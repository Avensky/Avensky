#!/usr/bin/python3 -I
"""Install the game image for the staging frontend's main commit on Vultr."""
import base64
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time


STATE = Path("/var/lib/avensky-staging-deploy")
COMPOSE = "/etc/avensky/staging-game.compose.yaml"
PROJECT = "avensky-staging"
VOLUME = "avensky-staging_avensky_staging_data"
PORT = 9002
READY_TIMEOUT = 40
IMAGE = "avensky-staging-game"
INPUTS = (".dockerignore", "avenlab-server", "packages/wardrobe-catalog")
LABEL = "org.avensky.staging-game-inputs"


def output(*args):
    return subprocess.check_output(args, text=True).strip()


def compose(*args, image=None):
    command = ["docker", "compose", "-p", PROJECT, "-f", COMPOSE]
    override = None
    if image:
        command.extend(["-f", "-"])
        override = json.dumps({"services": {"game": {"image": image}}})
    subprocess.run([*command, *args], input=override, text=True, check=True)


def wait_ready():
    deadline = time.monotonic() + READY_TIMEOUT
    while time.monotonic() < deadline:
        connection = http.client.HTTPConnection("127.0.0.1", PORT, timeout=2)
        key = base64.b64encode(os.urandom(16)).decode()
        accept = base64.b64encode(hashlib.sha1(
            (key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()
        ).digest()).decode()
        try:
            connection.request("GET", "/ws/", headers={
                "Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Key": key,
                "Sec-WebSocket-Version": "13", "Origin": "https://staging.avensky.com",
            })
            response = connection.getresponse()
            if response.status == 101 and response.getheader("Sec-WebSocket-Accept") == accept:
                return
        except (OSError, http.client.HTTPException):
            pass
        finally:
            connection.close()
        time.sleep(1)
    raise RuntimeError("Staging did not complete a WebSocket handshake")


def volume_path():
    volume, = json.loads(output("docker", "volume", "inspect", VOLUME))
    if volume["Driver"] != "local" or volume.get("Options") or volume["Name"] != VOLUME:
        raise ValueError("Expected the existing local staging data volume")
    return Path(volume["Mountpoint"]).resolve(strict=True)


def sync_volume(source, destination):
    subprocess.run(["rsync", "-aHAXx", "--numeric-ids", "--delete",
                    str(source) + "/", str(destination) + "/"], check=True)


def record(state):
    temporary = STATE / "pending.tmp"
    temporary.write_text(json.dumps(state))
    temporary.replace(STATE / "pending.json")


def activate(image):
    compose("up", "-d", "--no-deps", "--no-build", "--pull", "never", "game", image=image)
    wait_ready()


PORTAL = "avensky-alpha-access.service"


def portal_running():
    return Path("/run/systemd/system").is_dir() and subprocess.run(
        ["systemctl", "is-active", "--quiet", PORTAL], check=False).returncode == 0


def recover():
    pending = STATE / "pending.json"
    state = json.loads(pending.read_text())
    if state.get("portal_active"):
        subprocess.run(["systemctl", "stop", PORTAL], check=True)
    if state["snapshot_complete"]:
        compose("stop", "game")
        sync_volume((STATE / "snapshot").resolve(strict=True), volume_path())
        activate(IMAGE + ":rollback")
    else:
        subprocess.run(["docker", "start", state["container"]], check=True)
        wait_ready()
    if state.get("portal_active"):
        subprocess.run(["systemctl", "start", PORTAL], check=True)
    pending.unlink()
    print("Recovered the previous staging game", flush=True)


def deploy(commit):
    if (STATE / "pending.json").exists():
        recover()
    git = ["git", "--git-dir", str(STATE / "source.git")]
    subprocess.run([*git, "fetch", "--no-tags", "--depth=1", "origin", "refs/heads/main"], check=True)
    if output(*git, "rev-parse", "FETCH_HEAD") != commit:
        raise ValueError("The requested commit is no longer the head of main")
    tree = subprocess.check_output([*git, "ls-tree", "-z", commit, "--", *INPUTS])
    digest = hashlib.sha256(tree).hexdigest()
    container = output("docker", "compose", "-p", PROJECT, "-f", COMPOSE, "ps", "-q", "game")
    current, = json.loads(output("docker", "inspect", container))
    labels = current["Config"]["Labels"]
    data = volume_path()
    if (labels.get("com.docker.compose.project") != PROJECT
            or labels.get("com.docker.compose.service") != "game"
            or "AVENLAB_ENV=staging" not in current["Config"]["Env"]
            or not any(m.get("Name") == VOLUME and m["Destination"] == "/data"
                       and m["Source"] == str(data) for m in current["Mounts"])
            or current["NetworkSettings"]["Ports"].get("9001/tcp") != [
                {"HostIp": "127.0.0.1", "HostPort": str(PORT)}]):
        raise ValueError("Running service does not match the staging project, port and data volume")
    wait_ready()
    if labels.get(LABEL) == digest:
        print("Staging game already matches. Active sessions continue.", flush=True)
        return

    candidate = IMAGE + ":" + digest
    with tempfile.TemporaryFile(dir=STATE) as archive:
        subprocess.run([*git, "archive", commit, "--", *INPUTS], stdout=archive, check=True)
        archive.seek(0)
        subprocess.run(["docker", "build", "--label", LABEL + "=" + digest, "-t", candidate,
                        "-f", "avenlab-server/Dockerfile", "-"], stdin=archive, check=True)
    # Keep the old image and a cold copy of the whole volume, including SQLite and career files.
    subprocess.run(["docker", "tag", current["Image"], IMAGE + ":rollback"], check=True)
    backup = STATE / "snapshot"
    backup.mkdir(exist_ok=True)
    state = {"container": current["Id"], "snapshot_complete": False, "portal_active": portal_running()}
    record(state)
    try:
        if state["portal_active"]:
            subprocess.run(["systemctl", "stop", PORTAL], check=True)
        compose("stop", "game")
        sync_volume(data, backup)
        state["snapshot_complete"] = True
        record(state)
        activate(candidate)
        if state["portal_active"]:
            subprocess.run(["systemctl", "start", PORTAL], check=True)
    except (OSError, subprocess.SubprocessError, RuntimeError, KeyboardInterrupt):
        recover()
        raise
    (STATE / "pending.json").unlink()
    print("Staging game is accepting WebSockets on the new image.", flush=True)


def main():
    if len(sys.argv) != 2 or not re.fullmatch("[0-9a-f]{40}", sys.argv[1]):
        sys.exit("Supply one full main commit SHA")
    os.umask(0o077)
    os.chdir(STATE)
    with (STATE / "deploy.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        deploy(sys.argv[1])


if __name__ == "__main__":
    main()
