import json
import shutil
import tempfile
import unittest
from pathlib import Path

from verify_manifest import validate_manifest


REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = REPO_ROOT / "src-tauri" / "data" / "provenance.json"


def copy_manifest_fixture(destination: Path) -> Path:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    for artifact in manifest["artifacts"]:
        source = REPO_ROOT / artifact["path"]
        target = destination / artifact["path"]
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    manifest_copy = destination / "src-tauri" / "data" / "provenance.json"
    manifest_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(MANIFEST_PATH, manifest_copy)
    return manifest_copy


class VerifyManifestTests(unittest.TestCase):
    def test_current_manifest_matches_all_declared_artifacts(self):
        self.assertEqual(validate_manifest(REPO_ROOT, MANIFEST_PATH), [])

    def test_tampered_artifact_reports_sha256_mismatch(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            manifest_path = copy_manifest_fixture(temp_root)

            artifact = temp_root / "src-tauri" / "data" / "heroes.json"
            artifact.write_bytes(artifact.read_bytes() + b"\n")

            errors = validate_manifest(temp_root, manifest_path)

            self.assertTrue(any("sha256 mismatch" in error for error in errors))

    def test_verified_entry_requires_complete_provenance(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            manifest_path = copy_manifest_fixture(temp_root)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"][0]["status"] = "VERIFIED"
            manifest["artifacts"][0]["source"]["revision"] = None
            manifest["artifacts"][0]["source"]["retrieved_at"] = None
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            errors = validate_manifest(temp_root, manifest_path)

            self.assertTrue(any("VERIFIED" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
