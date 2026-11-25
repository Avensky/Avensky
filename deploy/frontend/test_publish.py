import io
import json
from pathlib import Path
import sys
import subprocess
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

    def test_operator_installed_release_by_id_without_ssh_config_change(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            legacy = root / "verified-staging.json"
            legacy.write_text(json.dumps({"release": {"id": ASSETS}}))
            current = "c" * 64
            candidate = root / ("verified-" + current + ".json")
            candidate.write_text(json.dumps({"release": {"id": current}}))
            with patch.object(publish, "urlopen") as open_url:
                open_url.return_value.__enter__.return_value.status = 206
                open_url.return_value.__enter__.return_value.read.return_value = b"glTF"
                publish.check_staging_assets(legacy, current)
                self.assertIn(current, open_url.call_args.args[0].full_url)
            candidate.unlink()
            candidate.write_text(json.dumps({"release": {"id": ASSETS}}))
            with self.assertRaisesRegex(ValueError, "different verified"):
                publish.check_staging_assets(legacy, current)
            candidate.unlink()
            candidate.symlink_to(legacy)
            with self.assertRaisesRegex(ValueError, "different verified"):
                publish.check_staging_assets(legacy, current)

    def test_gateway_manifest_directory_is_trusted_when_receiver_uses_legacy_path(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            assets = root / "gateway"
            assets.mkdir()
            legacy = root / "legacy" / "verified-staging.json"
            legacy.parent.mkdir()
            legacy.write_text(json.dumps({"release": {"id": ASSETS}}))
            new_id = "c" * 64
            candidate = assets / ("verified-" + new_id + ".json")
            candidate.write_text(json.dumps({"release": {"id": new_id}}))
            with (patch.object(publish, "STAGING_VERIFIED_ASSET_ROOT", assets),
                  patch.object(publish, "urlopen") as open_url):
                open_url.return_value.__enter__.return_value.status = 206
                open_url.return_value.__enter__.return_value.read.return_value = b"glTF"
                publish.check_staging_assets(legacy, new_id)
                self.assertIn(new_id, open_url.call_args.args[0].full_url)
            candidate.unlink()
            candidate.symlink_to(legacy)
            with patch.object(publish, "STAGING_VERIFIED_ASSET_ROOT", assets):
                with self.assertRaisesRegex(ValueError, "different verified"):
                    publish.check_staging_assets(legacy, new_id)

    def test_staging_deploy_skips_s3_release_approval(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            data = tar_bytes({
                "bundle.json": bundle("staging", assetRelease=ASSETS),
                "web/index.html": b"staging",
                "asset-release.json": json.dumps({"id": ASSETS, "assets": {}}).encode(),
            })
            with (
                patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(data))),
                patch.object(publish, "check_staging_assets", side_effect=AssertionError("Unexpected release gate")),
                patch.object(publish.subprocess, "run") as action,
            ):
                publish.publish(SimpleNamespace(environment="staging", root=path,
                                verified_manifest=path / "verified"), COMMIT)
            action.assert_not_called()
            self.assertEqual((path / "current/index.html").read_bytes(), b"staging")
            self.assertTrue((path / "releases" / COMMIT / "asset-release.json").is_file())

    def test_asset_release_manifest_mismatch_never_installs_or_switches(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            data = tar_bytes({
                "bundle.json": bundle("staging", assetRelease=ASSETS),
                "web/index.html": b"staging",
                "asset-release.json": json.dumps({"id": "c" * 64}).encode(),
            })
            with (
                patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(data))),
                patch.object(publish, "check_staging_assets"),
                patch.object(publish.subprocess, "run") as action,
            ):
                with self.assertRaisesRegex(ValueError, "disagrees"):
                    publish.publish(SimpleNamespace(environment="staging", root=path,
                                    verified_manifest=path / "verified"), COMMIT)
            action.assert_not_called()
            self.assertFalse((path / "current").exists())

    def test_game_failure_keeps_previous_frontend_and_no_receipt(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old = root / "old"
            old.mkdir()
            (root / "current").symlink_to(old)
            data = tar_bytes({"bundle.json": bundle("staging", assetRelease=ASSETS), "web/index.html": b"stage", "asset-release.json": json.dumps({"id": ASSETS}).encode()})
            args = SimpleNamespace(environment="staging", root=root, verified_manifest=root / "verified")
            with (
                patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(data))),
                patch.object(publish, "check_staging_assets"),
                patch.object(publish.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "game")) as game,
            ):
                with self.assertRaises(subprocess.CalledProcessError):
                    publish.publish(args, COMMIT, deploy_game=True)
                self.assertEqual(game.call_args.args[0][-1], COMMIT)
            self.assertEqual((root / "current").resolve(), old)
            self.assertFalse((root / "releases" / COMMIT / "staged").exists())
            args.environment = "production"
            with self.assertRaisesRegex(ValueError, "staging-only"):
                publish.publish(args, COMMIT, deploy_game=True)

    @unittest.skipIf(sys.platform == "win32", "Activation is installed on Ubuntu")
    def test_staging_switch_and_live_promotion_require_matching_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            stage, production, approved = (path / name for name in ("stage", "production", "approved"))
            for root in (stage, production, approved):
                root.mkdir()
            data = tar_bytes({"bundle.json": bundle("staging", assetRelease=ASSETS), "web/index.html": b"stage"})
            bad = tar_bytes({"bundle.json": bundle("staging", assetRelease=ASSETS),
                             "web/index.html": b"stage", "asset-release.json": json.dumps({"id": "c" * 64}).encode()})
            with patch.object(publish.sys, "stdin", SimpleNamespace(buffer=io.BytesIO(bad))):
                with self.assertRaisesRegex(ValueError, "disagrees"):
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
