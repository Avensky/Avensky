#!/usr/bin/python3 -I
"""Restricted root helper: verify private staging assets and activate gateway."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import subprocess
import sys
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen

BASE = Path("/etc/avensky-assets")
STATE = Path("/var/lib/avensky-staging-assets")
VERIFIER = Path("/usr/local/lib/avensky/staging-verifier/deploy/staging-assets/verify.mjs")
GATEWAY = "/opt/avensky/cloud-staging/deploy/staging-assets/gateway.mjs"
DROPIN = Path("/etc/systemd/system/avensky-staging-assets.service.d/zzzz-auto-release.conf")
LEGACY = (BASE / "verified-tennis-alpha.json", BASE / "verified-staging.json")
SHA = re.compile(r"[0-9a-f]{64}\Z")
ROAD = "/models/roads/Road_Narrow_Oneway/Road_Narrow_Oneway_LOD0.glb"


def run(*args, **options):
    return subprocess.run(list(args), check=True, **options)


def candidate_from_stdin():
    data = sys.stdin.buffer.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise ValueError("Staging release metadata is too large")
    value = json.loads(data)
    if (not isinstance(value, dict) or value.get("environment") != "staging"
        or value.get("version") != 1 or not isinstance(value.get("assets"), dict)
        or not isinstance(value.get("id"), str) or not SHA.fullmatch(value["id"])
        or not 0 < len(value["assets"]) <= 10000):
        raise ValueError("Invalid private asset release")
    return value


def valid_proof(file, release):
    if file.is_symlink() or not file.is_file():
        return False
    try:
        item = json.loads(file.read_text(encoding="utf-8"))
        return (item["release"]["id"] == release["id"]
                and item["release"]["assets"] == release["assets"]
                and set(item["objects"]) == set(release["assets"]))
    except (OSError, ValueError, TypeError, KeyError):
        return False


def best_previous(release):
    best, count = None, 0
    for file in [*LEGACY, *BASE.glob("verified-*.json")]:
        if file.is_symlink() or not file.is_file():
            continue
        try:
            assets = json.loads(file.read_text())["release"]["assets"]
            shared = sum(assets.get(p) == entry for p, entry in release["assets"].items())
            if shared > count:
                best, count = file, shared
        except (OSError, ValueError, TypeError, KeyError):
            continue
    return best


def probe(release, *, tries=1):
    url = ("http://127.0.0.1:9060/__staging-assets/" + release
           + ROAD)
    for attempt in range(tries):
        try:
            with urlopen(Request(url, headers={"Range": "bytes=0-3"}), timeout=5) as response:
                if response.status == 206 and response.read(4) == b"glTF":
                    return True
        except (OSError, URLError):
            pass
        if attempt + 1 < tries:
            time.sleep(1)
    return False


def verify_and_install(release, target):
    account = pwd.getpwnam("avensky-assets")
    if not VERIFIER.is_file():
        raise ValueError("Trusted staging verifier not installed")
    prior = best_previous(release)
    with tempfile.TemporaryDirectory(prefix="candidate-", dir=STATE) as directory:
        workspace = Path(directory)
        os.chown(workspace, account.pw_uid, account.pw_gid)
        request, output = workspace / "release.json", workspace / "verified.json"
        request.write_text(json.dumps(release) + "\n")
        os.chown(request, account.pw_uid, account.pw_gid)
        args = ["runuser", "-u", account.pw_name, "--", "env",
                "HOME=" + account.pw_dir, "AVENSKY_ASSET_BUCKET=caring-vegan",
                "AWS_PROFILE=avensky-staging-reader", "/usr/bin/node",
                str(VERIFIER), str(request), str(output), "--models-root"]
        if prior:
            args.extend(["--reuse-verified", str(prior)])
        run(*args, timeout=1800)
        if not valid_proof(output, release):
            raise ValueError("Private S3 verification did not produce a matching release")
        with tempfile.NamedTemporaryFile(dir=BASE, prefix=".verified-", delete=False) as dst:
            temp = Path(dst.name)
            with output.open("rb") as src:
                shutil.copyfileobj(src, dst)
        try:
            os.chown(temp, 0, account.pw_gid)
            temp.chmod(0o640)
            if target.exists() or target.is_symlink():
                raise ValueError("Conflicting release appeared while verifying")
            os.replace(temp, target)
        finally:
            temp.unlink(missing_ok=True)


def manifests_for(candidate):
    files = list(LEGACY)
    known = [f for f in BASE.glob("verified-*.json")
             if f.is_file() and not f.is_symlink()
             and SHA.fullmatch(f.stem.removeprefix("verified-"))]
    known.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    files.extend(f for f in known[:12] if f not in files)
    if candidate not in files:
        files.append(candidate)
    return files


def activate_gateway(release, verified):
    if probe(release["id"]):
        return
    if DROPIN.is_symlink():
        raise ValueError("Refusing symlinked gateway override")
    previous = DROPIN.read_bytes() if DROPIN.is_file() else None
    files = manifests_for(verified)
    contents = ("[Service]\nExecStart=\nExecStart=/usr/bin/node " + GATEWAY
                + " " + " ".join(str(f) for f in files) + "\n").encode()
    DROPIN.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=DROPIN.parent, delete=False) as dst:
        tmp = Path(dst.name)
        dst.write(contents)
    try:
        tmp.chmod(0o644)
        os.replace(tmp, DROPIN)
    finally:
        tmp.unlink(missing_ok=True)
    try:
        run("systemctl", "daemon-reload")
        run("systemctl", "restart", "avensky-staging-assets.service")
        old = json.loads(LEGACY[0].read_text())["release"]["id"]
        if not probe(release["id"], tries=20) or not probe(old, tries=5):
            raise RuntimeError("New or previous staging asset release failed the HTTP probe")
    except Exception:
        if previous is None:
            DROPIN.unlink(missing_ok=True)
        else:
            DROPIN.write_bytes(previous)
        run("systemctl", "daemon-reload")
        run("systemctl", "restart", "avensky-staging-assets.service")
        raise


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise ValueError("Staging asset helper requires sudo with no arguments")
    STATE.mkdir(parents=True, exist_ok=True)
    account = pwd.getpwnam("avensky-assets")
    os.chown(STATE, 0, account.pw_gid)
    STATE.chmod(0o750)
    release = candidate_from_stdin()
    with (STATE / "activation.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = BASE / ("verified-" + release["id"] + ".json")
        if not valid_proof(target, release):
            if target.exists() or target.is_symlink():
                raise ValueError("Existing verified file disagrees with candidate")
            verify_and_install(release, target)
        activate_gateway(release, target)
    print("Staging private assets ready:", release["id"], flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, TypeError, RuntimeError, subprocess.CalledProcessError) as error:
        print("Staging asset activation failed:", str(error), file=sys.stderr)
        sys.exit(1)
