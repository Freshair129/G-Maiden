import json
import hashlib
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


def update_artifact_hash(root: Path, manifest_path: Path, artifact_id: str) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    artifact = next(item for item in manifest["artifacts"] if item["id"] == artifact_id)
    payload = (root / artifact["path"]).read_bytes()
    artifact["sha256"] = hashlib.sha256(payload).hexdigest()
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")


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

    def test_manifest_must_cover_every_runtime_gameplay_dataset(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            manifest_path = copy_manifest_fixture(temp_root)
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            manifest["artifacts"] = [
                artifact
                for artifact in manifest["artifacts"]
                if artifact["id"] != "SRC-ITEM-DB"
            ]
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")

            errors = validate_manifest(temp_root, manifest_path)

            self.assertTrue(
                any("required gameplay artifact is missing" in error for error in errors)
            )

    def test_runtime_hero_abilities_must_match_curated_generator_input(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            manifest_path = copy_manifest_fixture(temp_root)
            heroes_path = temp_root / "src-tauri" / "data" / "heroes.json"
            heroes = json.loads(heroes_path.read_text(encoding="utf-8"))
            sniper = next(
                hero for hero in heroes if hero["internal_name"] == "npc_dota_hero_sniper"
            )
            sniper["abilities"] = []
            heroes_path.write_text(json.dumps(heroes), encoding="utf-8")
            update_artifact_hash(temp_root, manifest_path, "SRC-HERO-DB")

            errors = validate_manifest(temp_root, manifest_path)

            self.assertTrue(
                any("do not match curated generator input" in error for error in errors)
            )

    def test_duplicate_runtime_item_names_are_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            manifest_path = copy_manifest_fixture(temp_root)
            items_path = temp_root / "src-tauri" / "data" / "items.json"
            items = json.loads(items_path.read_text(encoding="utf-8"))
            items[1]["name"] = items[0]["name"]
            items_path.write_text(json.dumps(items), encoding="utf-8")
            update_artifact_hash(temp_root, manifest_path, "SRC-ITEM-DB")

            errors = validate_manifest(temp_root, manifest_path)

            self.assertTrue(any("name is duplicated" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
