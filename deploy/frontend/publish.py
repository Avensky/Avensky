#!/usr/bin/env python3
"""Forced SSH command for versioned frontend releases on Vultr."""
import argparse
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.error import URLError
from urllib.request import Request, urlopen


MAX_STAGING_SIZE = 512 * 1024 * 1024
MAX_PRODUCTION_SIZE = 4 * 1024 * 1024 * 1024
MAX_ENTRIES = 20_000
SHA = re.compile(r"[a-f0-9]{40}")
RELEASE = re.compile(r"[a-f0-9]{64}")
STAGING_MODEL = "/models/roads/Road_Narrow_Oneway/Road_Narrow_Oneway_LOD0.glb"
STAGING_ENTRY_MODELS = (
    "/models/world/garage_special.glb",
    "/models/characters/villagers/villager-female/villager-female.portrait.glb",
    "/models/characters/female/wardrobe/dress/linen-nightgown.mobile.glb",
)
STAGING_VERIFIED_ASSET_ROOT = Path("/etc/avensky-assets")


def unpack(stream, destination, staging):
    size, count = 0, 0
    limit = MAX_STAGING_SIZE if staging else MAX_PRODUCTION_SIZE
    with tarfile.open(fileobj=stream, mode="r|gz") as archive:
        for member in archive:
            count += 1
            size += member.size
            name = PurePosixPath(member.name)
            if (count > MAX_ENTRIES or size > limit or name.is_absolute()
                    or ".." in name.parts or "\\" in member.name or not name.parts
                    or (name.parts[0] != "web" and name.as_posix() not in ({"bundle.json", "asset-release.json"} if staging else {"bundle.json"}))):
                raise ValueError("Archive path or size is outside the release limits")
            if staging and (name.suffix.lower() == ".glb" or ".asset-release" in name.parts):
                raise ValueError("Unexpected model payload in the staging archive")
            output = destination.joinpath(*name.parts)
            if member.isdir():
                output.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                output.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, output.open("xb") as target:
                    shutil.copyfileobj(source, target)
            else:
                raise ValueError("Release archives must contain regular files and directories")
    if not (destination / "web/index.html").is_file():
        raise ValueError("The release has no frontend entry point")


def check_staging_assets(verified, release):
    if not isinstance(release, str) or not RELEASE.fullmatch(release):
        raise ValueError("The staging bundle has an invalid asset release ID")
    # The legacy receiver still points at a trusted operator-owned file.
    # New verified releases may be installed beside it under their sealed ID
    # without editing the forced SSH key or weakening the gateway probe.
    manifest = json.loads(verified.read_text(encoding="utf-8"))
    if manifest["release"]["id"] != release:
        filename = "verified-" + release + ".json"
        # The gateway may use /etc/avensky-assets even when the older SSH
        # receiver still points to /etc/avensky/verified-staging.json.
        candidates = [verified.with_name(filename), STAGING_VERIFIED_ASSET_ROOT / filename]
        for candidate in candidates:
            if candidate.is_symlink() or not candidate.is_file():
                continue
            recorded = json.loads(candidate.read_text(encoding="utf-8"))
            if recorded["release"]["id"] == release:
                manifest = recorded
                break
        else:
            raise ValueError("The bundle needs a different verified asset release")
    request = Request(
        "http://127.0.0.1:9060/__staging-assets/" + release + STAGING_MODEL,
        headers={"Range": "bytes=0-3"},
    )
    with urlopen(request, timeout=15) as response:
        if response.status != 206 or response.read(5) != b"glTF":
            raise ValueError("The private gateway is not serving the verified release")


def probe_staging_entry_models(release):
    if not isinstance(release, str) or not RELEASE.fullmatch(release):
        raise ValueError("The staging bundle has an invalid asset release ID")
    for model in STAGING_ENTRY_MODELS:
        request = Request("http://127.0.0.1:9060/__staging-assets/" + release + model,
                          headers={"Range": "bytes=0-3"})
        try:
            with urlopen(request, timeout=15) as response:
                if response.status == 206 and response.read(4) == b"glTF":
                    continue
        except URLError as error:
            raise ValueError(f"Gateway could not serve {model} for release {release}: {error}") from error
        raise ValueError(f"Gateway returned an invalid GLB range for {model} in release {release}")


def publish(args, commit, *, deploy_game=False):
    staging = args.environment == "staging"
    if deploy_game and not staging:
        raise ValueError("The automatic game deploy is staging-only")
    root = args.root.resolve(strict=True)
    releases = root / "releases"
    releases.mkdir(exist_ok=True)
    current = root / "current"
    final = releases / commit

    with (root / ".release.lock").open("a", encoding="utf-8") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if current.exists() and not current.is_symlink():
            raise ValueError("The active frontend path must be a symlink")
        if not staging:
            proof = args.staging_root / "releases" / commit / "staged"
            if not proof.is_file() or proof.read_text(encoding="ascii").strip() != commit:
                raise ValueError("This commit has no recorded staging release")
        with tempfile.TemporaryDirectory(prefix=".candidate-", dir=root) as temp:
            candidate = Path(temp) / "release"
            candidate.mkdir()
            if staging:
                unpack(sys.stdin.buffer, candidate, staging=True)
            else:
                with (args.approved_root / (commit + ".tar.gz")).open("rb") as stream:
                    unpack(stream, candidate, staging=False)
            metadata = json.loads((candidate / "bundle.json").read_text(encoding="utf-8"))
            if metadata["commit"] != commit or metadata["environment"] != args.environment:
                raise ValueError("The bundle does not match the requested commit and environment")
            if staging:
                # Staging is internal: its bundled catalog enables the private
                # gateway to stream models on demand without a release gate.
                catalog = candidate / "asset-release.json"
                if not catalog.is_file():
                    raise ValueError("Staging bundle is missing its asset catalog")
                if json.loads(catalog.read_text(encoding="utf-8")).get("id") != metadata.get("assetRelease"):
                    raise ValueError("The staging asset catalog disagrees with the bundle")
            elif not isinstance(metadata.get("licenseReview"), str) or not metadata["licenseReview"].strip():
                raise ValueError("Production requires a recorded asset license review")
            if final.exists():
                previous = json.loads((final / "bundle.json").read_text(encoding="utf-8"))
                if previous != metadata:
                    raise ValueError("This commit already has a different installed bundle")
            else:
                candidate.rename(final)
            if staging:
                # The loopback gateway resolves catalogs once their release is
                # installed. Confirm the app can load before restarting the game
                # or moving the live frontend symlink.
                probe_staging_entry_models(metadata.get("assetRelease"))
            if deploy_game:
                subprocess.run(["sudo", "-n", "--", "/usr/local/lib/avensky/staging_game.py", commit],
                               stdin=subprocess.DEVNULL, check=True)
            # Caddy continues serving the previous release until the atomic swap.
            replacement = Path(temp) / "current"
            replacement.symlink_to(Path("releases") / commit / "web")
            os.replace(replacement, current)
            if staging:
                receipt = Path(temp) / "staged"
                receipt.write_text(commit + "\n", encoding="ascii")
                os.replace(receipt, final / "staged")
    print("Published", args.environment, commit)


def main():
    os.umask(0o022)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("environment", choices=["staging", "production"])
    parser.add_argument("root", type=Path)
    parser.add_argument("--verified-manifest", type=Path)
    parser.add_argument("--staging-root", type=Path)
    parser.add_argument("--approved-root", type=Path)
    args = parser.parse_args()
    command = os.environ.get("SSH_ORIGINAL_COMMAND", "").split()
    if (len(command) != 2 or command[0] not in {"publish-frontend", "publish-staging-with-game"} or not SHA.fullmatch(command[1])):
        parser.error("Expected a publish-frontend command and a full commit SHA")
    if args.environment == "production" and not (args.staging_root and args.approved_root):
        parser.error("Production requires a staging receipt and independently approved bundle storage")
    try:
        publish(args, command[1], deploy_game=command[0] == "publish-staging-with-game")
    except (ValueError, TypeError, OSError, KeyError, tarfile.TarError, URLError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Frontend release failed: {error}\n")


if __name__ == "__main__":
    main()
