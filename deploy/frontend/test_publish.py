import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

if sys.platform == "win32":
    # Windows validates the archive and gates. Linux CI also tests the flock.
    sys.modules["fcntl"] = SimpleNamespace(flock=lambda *_: None, LOCK_EX=2)

import publish


COMMIT = "a" * 40
ASSETS = "b" * 64


def bundle(env, **extra):
    return json.dumps({"commit": COMMIT, "environment": env, **extra}).encode()


def tar_bytes(files, symlink=None):
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w:gz") as writer:
        for name, content in files.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(content)
            writer.addfile(entry, io.BytesIO(content))
        if symlink:
            entry = tarfile.TarInfo(symlink)
            entry.type = tarfile.SYMTYPE
            entry.linkname = "/private"
            writer.addfile(entry)
    return archive.getvalue()


class ReleaseTest(unittest.TestCase):
    def test_bad_archive_never_escapes_or_enters_web(self):
        for body in (
            tar_bytes({"../secret": b"bad"}),
            tar_bytes({"web/../secret": b"bad"}),
            tar_bytes({"web/model.glb": b"glTF"}),
            tar_bytes({"web/.asset-release/private.json": b"secret"}),
            tar_bytes({"web/index.html": b"ok"}, symlink="web/escape"),
        ):
            with self.subTest(length=len(body)), tempfile.TemporaryDirectory() as temp:
                with self.assertRaises(ValueError):
                    publish.unpack(io.BytesIO(body), Path(temp), staging=True)

    def test_staging_requires_the_verified_id_and_working_range(self):
        with tempfile.TemporaryDirectory() as temp:
            verified = Path(temp) / "verified.json"
            verified.write_bytes(json.dumps({"release": {"id": ASSETS}}).encode())
            with patch.object(publish, "urlopen") as open_url:
                open_url.return_value.__enter__.return_value.status = 206
                open_url.return_value.__enter__.return_value.read.return_value = b"glTF"
                publish.check_staging_assets(verified, ASSETS)
                self.assertEqual(open_url.call_args.args[0].get_header("Range"), "bytes=0-3")
                with self.assertRaises(ValueError):
                    publish.check_staging_assets(verified, "c" * 64)

    @unittest.skipIf(sys.platform == "win32", "Activation is installed on Ubuntu")
    def test_staging_switch_and_live_promotion_require_matching_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            stage, production, approved = (path / name for name in ("stage", "production", "approved"))
            for root in (stage, production, approved):
                root.mkdir()
            data = tar_bytes({"bundle.json": bundle("staging", assetRelease=ASSETS), "web/index.html": b"stage"})
            with (
                patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(data))),
                patch.object(publish, "check_staging_assets", side_effect=ValueError("Gateway offline")),
            ):
                with self.assertRaises(ValueError):
                    publish.publish(SimpleNamespace(environment="staging", root=stage, verified_manifest=path / "verified"), COMMIT)
            self.assertFalse((stage / "current").exists())
            with (
                patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(data))),
                patch.object(publish, "check_staging_assets"),
            ):
                publish.publish(SimpleNamespace(environment="staging", root=stage, verified_manifest=path / "verified"), COMMIT)
            self.assertEqual((stage / "current/index.html").read_bytes(), b"stage")

            args = SimpleNamespace(environment="production", root=production, staging_root=stage, approved_root=approved)
            with self.assertRaises(FileNotFoundError):
                publish.publish(args, COMMIT)
            (approved / (COMMIT + ".tar.gz")).write_bytes(tar_bytes({
                "bundle.json": bundle("production", licenseReview="production review record"), "web/index.html": b"live",
            }))
            publish.publish(args, COMMIT)
            self.assertEqual((production / "current/index.html").read_bytes(), b"live")
            self.assertEqual((stage / "current/index.html").read_bytes(), b"stage")


if __name__ == "__main__":
    unittest.main()
