import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
from types import SimpleNamespace

MODULE = Path(__file__).with_name("staging_upload.py")
spec = importlib.util.spec_from_file_location("staging_upload", MODULE)
publisher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publisher)


def glb():
    body = b"{}  "
    return b"glTF" + struct.pack("<II", 2, len(body) + 12) + body


class StagingUploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.url = "/models/characters/female/hair/Hair_12_espresso.glb"
        self.asset = self.root / "models" / "Hair_12_espresso.glb"
        self.asset.parent.mkdir()
        self.asset.write_bytes(glb())
        self.sha = hashlib.sha256(glb()).hexdigest()
        self.metadata = {"sha256": self.sha, "size": len(glb())}
        self.manifest = self.root / "styles.json"
        self.manifest.write_text(json.dumps([{"url": self.url, **self.metadata}]))

    def test_catalog_list_and_generic_mapping(self):
        self.assertEqual(publisher.read_manifest(self.manifest), {self.url: (self.sha, len(glb()))})
        self.manifest.write_text(json.dumps({self.url: self.metadata}))
        self.assertEqual(publisher.read_manifest(self.manifest), {self.url: (self.sha, len(glb()))})

    def test_reject_path_traversal_and_malformed_checksums(self):
        for url in ["/models/../secret.glb", "/models/a//b.glb", "/models/%2e%2e/foo.glb", "/models/a.json", "https://example.com/a.glb"]:
            with self.subTest(url=url), self.assertRaises(publisher.AssetError):
                publisher.validate_path(url)
        self.manifest.write_text(json.dumps({self.url: {"sha256": "bad", "size": 12}}))
        with self.assertRaises(publisher.AssetError):
            publisher.read_manifest(self.manifest)

    def test_reject_hash_and_header_mismatch(self):
        self.assertEqual(publisher.locate_asset(self.root, self.url), self.asset)
        publisher.verify_file(self.asset, self.url, (self.sha, len(glb())))
        with self.assertRaisesRegex(publisher.AssetError, "SHA-256"):
            publisher.verify_file(self.asset, self.url, ("0" * 64, len(glb())))
        self.asset.write_bytes(b"not glb")
        with self.assertRaisesRegex(publisher.AssetError, "glTF"):
            publisher.verify_file(self.asset, self.url, (self.sha, len(glb())))

    def test_symlink_cannot_escape_private_root(self):
        outside = self.root.parent / (self.root.name + "-outside.glb")
        outside.write_bytes(glb())
        self.addCleanup(outside.unlink)
        self.asset.unlink()
        self.asset.symlink_to(outside)
        with self.assertRaisesRegex(publisher.AssetError, "escapes"):
            publisher.locate_asset(self.root, self.url)

    def test_dry_run_does_not_call_aws(self):
        def fail(*args, **kwargs):
            self.fail("Dry run called AWS")
        count, missing = publisher.publish_once(self.root, [self.manifest], upload=False,
            profile="avensky-lightsail", bucket="caring-vegan", region="us-west-2", run=fail)
        self.assertEqual((count, missing), (1, []))

    def test_conditional_immutable_upload_and_cache(self):
        called = []
        def run(args, **kwargs):
            called.append(args)
            return SimpleNamespace(returncode=0, stderr="")
        known = {}
        kw = dict(upload=True, profile="avensky-lightsail", bucket="caring-vegan", region="us-west-2", known=known, run=run)
        count, missing = publisher.publish_once(self.root, [self.manifest], **kw)
        self.assertEqual((count, missing), (1, []))
        self.assertEqual(publisher.publish_once(self.root, [self.manifest], **kw), (0, []))
        self.assertEqual(len(called), 1)
        self.assertIn("--if-none-match", called[0])
        self.assertIn("staging/objects/" + self.sha, called[0])
        self.assertIn("avensky-lightsail", called[0])
        def already(args, **kwargs):
            return SimpleNamespace(returncode=255, stderr="(PreconditionFailed)")
        self.assertIn("already present", publisher.put_object(self.asset, self.sha, "avensky-lightsail", "caring-vegan", "us-west-2", run=already))

    def test_missing_export_and_duplicate_manifest_are_safe(self):
        self.asset.unlink()
        count, missing = publisher.publish_once(self.root, [self.manifest], upload=False,
            profile="avensky-lightsail", bucket="caring-vegan", region="us-west-2")
        self.assertEqual(count, 0)
        self.assertEqual(missing, [self.url])
        other = self.root / "other.json"
        other.write_text(json.dumps({self.url: {"sha256": "0" * 64, "size": 12}}))
        with self.assertRaisesRegex(publisher.AssetError, "Conflicting"):
            publisher.publish_once(self.root, [self.manifest, other], upload=False,
                profile="avensky-lightsail", bucket="caring-vegan", region="us-west-2")


if __name__ == "__main__":
    unittest.main()
