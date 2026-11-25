import base64
from contextlib import ExitStack
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import patch
import uuid

import staging_game as game


class Handshake(BaseHTTPRequestHandler):
    def do_GET(self):
        key = self.headers["Sec-WebSocket-Key"]
        accept = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest())
        self.send_response(101)
        self.send_header("Upgrade", "websocket")
        self.send_header("Connection", "Upgrade")
        self.send_header("Sec-WebSocket-Accept", accept.decode())
        self.end_headers()

    def log_message(self, *args):
        pass


class StagingGameTest(unittest.TestCase):
    def test_real_websocket_handshake(self):
        with HTTPServer(("127.0.0.1", 0), Handshake) as server:
            thread = threading.Thread(target=server.handle_request)
            thread.start()
            try:
                with patch.object(game, "PORT", server.server_port):
                    game.wait_ready()
            finally:
                thread.join(timeout=3)

    def test_bad_snapshot_is_never_restored(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(game, "STATE", Path(temp)):
            game.record({"container": "old", "snapshot_complete": False})
            with (patch.object(game.subprocess, "run") as run, patch.object(game, "wait_ready"),
                  patch.object(game, "sync_volume") as copy):
                game.recover()
            run.assert_called_once_with(["docker", "start", "old"], check=True)
            copy.assert_not_called()
            self.assertFalse((Path(temp) / "pending.json").exists())

    def test_rollback_quiesces_the_portal_before_restoring_the_shared_database(self):
        events = []
        with tempfile.TemporaryDirectory() as temp, ExitStack() as patches:
            patches.enter_context(patch.object(game, "STATE", Path(temp)))
            patches.enter_context(patch.object(game, "volume_path", return_value=Path(temp)))
            patches.enter_context(patch.object(game.subprocess, "run", side_effect=lambda cmd, **kw: events.append(cmd[1])))
            patches.enter_context(patch.object(game, "compose", side_effect=lambda *args: events.append("stop game")))
            patches.enter_context(patch.object(game, "sync_volume", side_effect=lambda *args: events.append("restore data")))
            patches.enter_context(patch.object(game, "activate", side_effect=lambda *args: events.append("start game")))
            (Path(temp) / "snapshot").mkdir()
            game.record({"snapshot_complete": True, "portal_active": True})
            game.recover()
        self.assertEqual(events, ["stop", "stop game", "restore data", "start game", "start"])

    @unittest.skipUnless(os.getenv("AVENSKY_TEST_DOCKER") == "1", "Docker integration runs on the Ubuntu runner")
    def test_changed_image_restarts_ui_only_skips_and_failed_image_restores_data(self):
        with tempfile.TemporaryDirectory() as temp, ExitStack() as cleanup:
            root = Path(temp)
            repo = root / "repo"
            repo.mkdir()
            state = root / "state"
            state.mkdir()
            project = "stage-test-" + uuid.uuid4().hex[:10]
            volume = project + "_data"
            compose = root / "service.json"
            with socket.socket() as sock:
                sock.bind(("127.0.0.1", 0))
                port = sock.getsockname()[1]
            cleanup.enter_context(patch.multiple(game, STATE=state, PROJECT=project, IMAGE=project,
                                                 COMPOSE=str(compose), PORT=port, VOLUME=volume, READY_TIMEOUT=8))
            def git(*args):
                return subprocess.check_output(["git", "-C", repo, *args], text=True).strip()

            def commit():
                git("add", ".")
                git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
                return git("rev-parse", "HEAD")

            def container_id():
                return game.output("docker", "compose", "-p", project, "-f", str(compose), "ps", "-q", "game")

            git("init", "-qb", "main")
            (repo / ".dockerignore").write_text(".git\n")
            catalog = repo / "packages/wardrobe-catalog"
            catalog.mkdir(parents=True)
            (catalog / "index.json").write_text("{}")
            server = repo / "avenlab-server"
            server.mkdir()
            (server / "Dockerfile").write_text("FROM python:3.12-alpine\nCOPY avenlab-server/game.py /game.py\nCMD [\"python\", \"/game.py\"]\n")
            import inspect
            source = ("import base64, hashlib\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\n"
                      + inspect.getsource(Handshake) + "\nHTTPServer(('0.0.0.0',9001),Handshake).serve_forever()\n")
            script = server / "game.py"
            script.write_text(source)
            first = commit()
            subprocess.run(["git", "clone", "--bare", str(repo), str(state / "source.git")], check=True)
            # Deploy fetches from this bare repository's read-only origin.
            subprocess.run(["docker", "build", "-f", str(server / "Dockerfile"), "-t", project + ":initial", str(repo)], check=True)
            compose.write_text(json.dumps({
                "services": {"game": {"image": project + ":initial", "environment": ["AVENLAB_ENV=staging"],
                                      "ports": [f"127.0.0.1:{port}:9001"], "volumes": ["data:/data"]}},
                "volumes": {"data": {}},
            }))
            cleanup.callback(game.compose, "down", "--volumes")  # Unique disposable test project only.
            game.compose("up", "-d", "game")
            game.wait_ready()
            before = container_id()
            game.deploy(first)
            baseline = container_id()
            self.assertNotEqual(before, baseline)
            marker = game.volume_path() / "profile"
            marker.write_text("saved player")
            (repo / "menu.txt").write_text("new touch controls")
            ui = commit()
            game.deploy(ui)
            self.assertEqual(container_id(), baseline)
            # Failed candidate writes new-format data before failing its probe.
            script.write_text("from pathlib import Path\nimport time\n"
                              "Path('/data/profile').write_text('migration')\n"
                              "Path('/data/partial').touch()\ntime.sleep(60)\n")
            broken = commit()
            with self.assertRaisesRegex(RuntimeError, "WebSocket"):
                game.deploy(broken)
            self.assertEqual(marker.read_text(), "saved player")
            self.assertFalse((marker.parent / "partial").exists())
            self.assertFalse((state / "pending.json").exists())
            game.wait_ready()
            with self.assertRaisesRegex(ValueError, "head of main"):
                game.deploy(ui)


if __name__ == "__main__":
    unittest.main()
