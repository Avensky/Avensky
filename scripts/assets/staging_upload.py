#!/usr/bin/env python3
"""Validate and publish manifest-approved private Avensky assets from a local export folder.

The public repository contains only checksums and filenames, never vendor-owned GLBs.
Run with --watch --upload after export to publish newly approved files automatically.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import time

SHA256 = re.compile(r"^[0-9a-f]{64}$")
ALLOWED = {".glb", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".ktx2", ".bin"}


class AssetError(ValueError):
    pass


def validate_path(path):
    if not isinstance(path, str) or not path.startswith(("/models/", "/textures/")):
        raise AssetError("Asset paths must start with /models/ or /textures/")
    if any(piece in ("", ".", "..") for piece in path[1:].split("/")) or any(c in path for c in "\\%?#\x00"):
        raise AssetError("Unsafe logical asset path: " + path)
    if PurePosixPath(path).suffix.lower() not in ALLOWED:
        raise AssetError("Unsupported asset extension: " + path)
    return path


def read_manifest(path):
    try:
        manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise AssetError("Cannot read asset manifest: " + str(path)) from exc
    if isinstance(manifest, list):
        records = [(entry.get("url"), entry) for entry in manifest if isinstance(entry, dict)]
        if len(records) != len(manifest):
            raise AssetError("Expected an array of asset records")
    elif isinstance(manifest, dict):
        records = list(manifest.items())
    else:
        raise AssetError("Manifest must be an asset list or URL-to-hash mapping")
    found = {}
    for url, entry in records:
        url = validate_path(url)
        if not isinstance(entry, dict) or not isinstance(entry.get("sha256"), str) or not SHA256.fullmatch(entry["sha256"]):
            raise AssetError("Invalid SHA-256 for " + url)
        size = entry.get("size")
        if type(size) is not int or size <= 0:
            raise AssetError("Invalid asset byte count for " + url)
        meta = (entry["sha256"], size)
        if url in found and found[url] != meta:
            raise AssetError("Conflicting duplicate asset: " + url)
        found[url] = meta
    if not found:
        raise AssetError("The asset manifest is empty")
    return found


def locate_asset(source, url):
    root = Path(source).resolve(strict=True)
    basename = PurePosixPath(url).name
    paths = [root / url.lstrip("/"), root / basename, root / "models" / basename]
    matches = []
    for candidate in paths:
        if not candidate.is_file():
            continue
        resolved = candidate.resolve(strict=True)
        if not resolved.is_relative_to(root):
            raise AssetError("Asset symlink escapes source folder: " + basename)
        if resolved not in matches:
            matches.append(resolved)
    if len(matches) > 1:
        raise AssetError("Ambiguous asset filename; remove duplicates: " + basename)
    return matches[0] if matches else None


def verify_file(path, url, expected):
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as stream:
        header = stream.read(12)
        if url.lower().endswith(".glb") and (len(header) != 12 or header[:4] != b"glTF"
                or int.from_bytes(header[4:8], "little") != 2):
            raise AssetError("Invalid glTF 2.0 header: " + path.name)
        digest.update(header)
        size += len(header)
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    if url.lower().endswith(".glb") and int.from_bytes(header[8:12], "little") != size:
        raise AssetError("GLB length header disagrees: " + path.name)
    if (digest.hexdigest(), size) != expected:
        raise AssetError("SHA-256 or size differs from approved manifest: " + path.name)


def put_object(path, digest, profile, bucket, region, run=subprocess.run):
    key = "staging/objects/" + digest
    args = ["aws", "--profile", profile, "s3api", "put-object", "--region", region,
            "--bucket", bucket, "--key", key, "--body", str(path), "--if-none-match", "*",
            "--checksum-algorithm", "SHA256", "--checksum-sha256",
            base64.b64encode(bytes.fromhex(digest)).decode("ascii"), "--no-cli-pager"]
    result = run(args, capture_output=True, text=True)
    if result.returncode == 0:
        return "uploaded"
    if "PreconditionFailed" in result.stderr:
        # The gateway performs a full SHA-256/ETag verification before activation.
        return "already present; gateway verification required"
    if "ConditionalRequestConflict" in result.stderr:
        raise AssetError("Concurrent write conflict for " + path.name + "; retry the upload")
    match = re.search(r"\(([A-Za-z][A-Za-z0-9]+)\)", result.stderr)
    raise AssetError("AWS upload rejected " + path.name + ": " + (match.group(1) if match else "AWS CLI error"))


def publish_once(source, manifests, *, upload, profile, bucket, region, known=None, run=subprocess.run):
    known = {} if known is None else known
    approved = {}
    for file in manifests:
        for url, metadata in read_manifest(file).items():
            if url in approved and approved[url] != metadata:
                raise AssetError("Conflicting manifests for " + url)
            approved[url] = metadata
    count, missing = 0, []
    for url, (sha, size) in sorted(approved.items()):
        asset = locate_asset(source, url)
        if asset is None:
            missing.append(url)
            continue
        # Recheck even when previously uploaded: Blender can replace a finished export.
        stamp = (str(asset), asset.stat().st_mtime_ns, asset.stat().st_size, sha)
        if known.get(url) == stamp:
            continue
        verify_file(asset, url, (sha, size))
        status = put_object(asset, sha, profile, bucket, region, run=run) if upload else "validated (dry run)"
        known[url] = stamp
        count += 1
        print(asset.name + ": " + status, flush=True)
    return count, missing


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Private Blender exports or extracted pack directory")
    parser.add_argument("--manifest", type=Path, action="append", required=True, help="Approved JSON catalog; repeat for more collections")
    parser.add_argument("--profile", default="avensky-lightsail", help="AWS CLI profile with private Lightsail bucket write access")
    parser.add_argument("--bucket", default="caring-vegan")
    parser.add_argument("--region", default="us-west-2")
    parser.add_argument("--upload", action="store_true", help="Write only immutable digest-keyed objects; default is dry run")
    parser.add_argument("--watch", action="store_true", help="Continuously scan for newly approved exports")
    parser.add_argument("--interval", type=int, default=10, help="Seconds between scans in watch mode (>= 5)")
    args = parser.parse_args(argv)
    if args.watch and not args.upload:
        parser.error("--watch requires explicit --upload")
    if args.interval < 5:
        parser.error("--interval must be at least 5 seconds")
    if not args.source.is_dir():
        parser.error("--source must point to an existing private directory")
    known = {}
    try:
        while True:
            try:
                count, missing = publish_once(args.source, args.manifest, upload=args.upload,
                    profile=args.profile, bucket=args.bucket, region=args.region, known=known)
                if not args.watch:
                    if missing:
                        raise AssetError(str(len(missing)) + " approved asset(s) missing from " + str(args.source))
                    print("Checked " + str(count) + " approved asset(s)", flush=True)
                    break
            except AssetError as exc:
                if not args.watch:
                    raise
                print("Waiting for valid export: " + str(exc), file=sys.stderr, flush=True)
            if args.watch:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("Uploader stopped", flush=True)
        return 0
    except AssetError as exc:
        parser.exit(1, "Asset publication blocked: " + str(exc) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
