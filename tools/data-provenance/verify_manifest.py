#!/usr/bin/env python3
"""Validate the local provenance manifest for G-Series static data."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
MANIFEST_ID = "G-DATA-PROVENANCE"
ALLOWED_ROLES = {"runtime_snapshot", "generator_input"}
ALLOWED_SOURCE_KINDS = {
    "external_snapshot",
    "manual_snapshot",
    "manual_curated",
    "derived",
}
ALLOWED_STATUSES = {"VERIFIED", "PARTIAL", "UNVERIFIED"}
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
REQUIRED_ARTIFACT_FIELDS = {
    "id",
    "path",
    "role",
    "consumers",
    "source",
    "generation",
    "sha256",
    "status",
}
REQUIRED_SOURCE_FIELDS = {
    "kind",
    "url",
    "revision",
    "patch",
    "retrieved_at",
    "dataset_label",
}
REQUIRED_GENERATION_FIELDS = {"tool", "commit"}
REQUIRED_GAMEPLAY_ARTIFACTS = {
    "SRC-HERO-DB": ("src-tauri/data/heroes.json", "runtime_snapshot"),
    "SRC-HERO-ABILITIES-CURATED": (
        "tools/gen-herodb/curated_abilities.json",
        "generator_input",
    ),
    "SRC-ITEM-DB": ("src-tauri/data/items.json", "runtime_snapshot"),
    "SRC-ITEM-PRICES": ("src-tauri/data/item-prices.json", "runtime_snapshot"),
    "SRC-COUNTER-DB": ("src-tauri/data/item_counters.json", "runtime_snapshot"),
}
DAMAGE_TYPES = {"Physical", "Magical", "Pure"}
HERO_NUMERIC_FIELDS = (
    "base_damage_min",
    "base_damage_max",
    "base_armor",
    "base_magic_resistance",
    "base_str",
    "str_gain",
    "base_agi",
    "agi_gain",
    "base_int",
    "int_gain",
    "base_attack_speed",
    "attack_range",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _within_root(root: Path, path: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _load_json(path: Path) -> tuple[Any | None, str | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return None, str(exc)


def _finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
    )


def _validate_abilities(abilities: Any, prefix: str, errors: list[str]) -> None:
    if not isinstance(abilities, list):
        errors.append(f"{prefix} must be an array")
        return

    names: set[str] = set()
    for index, ability in enumerate(abilities):
        item_prefix = f"{prefix}[{index}]"
        if not isinstance(ability, dict):
            errors.append(f"{item_prefix} must be an object")
            continue
        name = ability.get("name")
        if not isinstance(name, str) or not name:
            errors.append(f"{item_prefix}.name must be a non-empty string")
        elif name in names:
            errors.append(f"{item_prefix}.name is duplicated: {name}")
        else:
            names.add(name)

        if ability.get("damage_type") not in DAMAGE_TYPES:
            errors.append(f"{item_prefix}.damage_type must be Physical, Magical, or Pure")

        levels = ability.get("damage_per_level")
        if not isinstance(levels, list) or not levels:
            errors.append(f"{item_prefix}.damage_per_level must be a non-empty array")
        elif any(not _finite_number(value) or value < 0 for value in levels):
            errors.append(f"{item_prefix}.damage_per_level must contain finite non-negative numbers")

        cooldown = ability.get("cooldown")
        if not _finite_number(cooldown) or cooldown < 0:
            errors.append(f"{item_prefix}.cooldown must be a finite non-negative number")
        if not isinstance(ability.get("is_ultimate"), bool):
            errors.append(f"{item_prefix}.is_ultimate must be boolean")


def _validate_hero_database(heroes: Any, errors: list[str]) -> set[str]:
    prefix = "SRC-HERO-DB"
    if not isinstance(heroes, list):
        errors.append(f"{prefix} must be an array")
        return set()
    if len(heroes) < 120:
        errors.append(f"{prefix} has {len(heroes)} heroes; runtime baseline requires at least 120")

    names: set[str] = set()
    for index, hero in enumerate(heroes):
        item_prefix = f"{prefix}[{index}]"
        if not isinstance(hero, dict):
            errors.append(f"{item_prefix} must be an object")
            continue
        name = hero.get("internal_name")
        if not isinstance(name, str) or not name:
            errors.append(f"{item_prefix}.internal_name must be a non-empty string")
        elif name in names:
            errors.append(f"{item_prefix}.internal_name is duplicated: {name}")
        else:
            names.add(name)
        if not isinstance(hero.get("display_name"), str) or not hero["display_name"]:
            errors.append(f"{item_prefix}.display_name must be a non-empty string")
        if hero.get("primary_attr") not in {"str", "agi", "int", "uni"}:
            errors.append(f"{item_prefix}.primary_attr is unsupported")
        for field in HERO_NUMERIC_FIELDS:
            if not _finite_number(hero.get(field)):
                errors.append(f"{item_prefix}.{field} must be a finite number")
        minimum = hero.get("base_damage_min")
        maximum = hero.get("base_damage_max")
        if _finite_number(minimum) and _finite_number(maximum) and (minimum < 0 or maximum < minimum):
            errors.append(f"{item_prefix} base damage range is invalid")
        _validate_abilities(hero.get("abilities"), f"{item_prefix}.abilities", errors)
    return names


def _validate_item_database(items: Any, errors: list[str]) -> None:
    prefix = "SRC-ITEM-DB"
    if not isinstance(items, list) or not items:
        errors.append(f"{prefix} must be a non-empty array")
        return
    names: set[str] = set()
    for index, item in enumerate(items):
        item_prefix = f"{prefix}[{index}]"
        if not isinstance(item, dict):
            errors.append(f"{item_prefix} must be an object")
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name:
            errors.append(f"{item_prefix}.name must be a non-empty string")
        elif name in names:
            errors.append(f"{item_prefix}.name is duplicated: {name}")
        else:
            names.add(name)
        for field in ("bonus_attack_damage", "active_burst"):
            value = item.get(field)
            if not _finite_number(value) or value < 0:
                errors.append(f"{item_prefix}.{field} must be a finite non-negative number")
        if item.get("active_burst_type") not in DAMAGE_TYPES:
            errors.append(f"{item_prefix}.active_burst_type must be Physical, Magical, or Pure")


def _validate_gameplay_artifacts(root: Path, errors: list[str]) -> None:
    loaded: dict[str, Any] = {}
    for artifact_id, (relative_path, _) in REQUIRED_GAMEPLAY_ARTIFACTS.items():
        value, load_error = _load_json(root / relative_path)
        if load_error:
            errors.append(f"{artifact_id} could not be read: {load_error}")
        else:
            loaded[artifact_id] = value

    heroes = loaded.get("SRC-HERO-DB")
    hero_names = _validate_hero_database(heroes, errors) if heroes is not None else set()

    curated = loaded.get("SRC-HERO-ABILITIES-CURATED")
    if not isinstance(curated, dict):
        if curated is not None:
            errors.append("SRC-HERO-ABILITIES-CURATED must be an object")
    else:
        for hero_name, abilities in curated.items():
            if hero_name.startswith("_"):
                continue
            if hero_name not in hero_names:
                errors.append(f"curated abilities refer to missing hero: {hero_name}")
            _validate_abilities(abilities, f"curated abilities for {hero_name}", errors)

        if isinstance(heroes, list):
            for index, hero in enumerate(heroes):
                if not isinstance(hero, dict) or not isinstance(hero.get("internal_name"), str):
                    continue
                expected = curated.get(hero["internal_name"], [])
                if hero.get("abilities") != expected:
                    errors.append(
                        f"SRC-HERO-DB[{index}].abilities do not match curated generator input"
                    )

    _validate_item_database(loaded.get("SRC-ITEM-DB"), errors)

    prices = loaded.get("SRC-ITEM-PRICES")
    if not isinstance(prices, dict) or not prices:
        errors.append("SRC-ITEM-PRICES must be a non-empty object")
    else:
        for name, price in prices.items():
            if not isinstance(name, str) or not name:
                errors.append("SRC-ITEM-PRICES contains an invalid item name")
            if not isinstance(price, int) or isinstance(price, bool) or price <= 0:
                errors.append(f"SRC-ITEM-PRICES[{name!r}] must be a positive integer")

    counters = loaded.get("SRC-COUNTER-DB")
    if not isinstance(counters, dict) or not isinstance(counters.get("hero_counters"), dict):
        errors.append("SRC-COUNTER-DB must contain a hero_counters object")
    if not isinstance(counters, dict) or not isinstance(counters.get("item_counters"), dict):
        errors.append("SRC-COUNTER-DB must contain an item_counters object")


def validate_manifest(repo_root: Path, manifest_path: Path) -> list[str]:
    """Return validation errors for ``manifest_path`` and its declared files."""

    root = Path(repo_root).resolve()
    manifest = Path(manifest_path).resolve()
    errors: list[str] = []

    if not _within_root(root, manifest):
        return [f"manifest is outside repository root: {manifest}"]
    if not manifest.is_file():
        return [f"manifest not found: {manifest}"]

    document, load_error = _load_json(manifest)
    if load_error:
        return [f"manifest is not valid JSON: {load_error}"]
    if not isinstance(document, dict):
        return ["manifest root must be an object"]

    if document.get("schema_version") != SCHEMA_VERSION:
        errors.append(
            f"schema_version must be {SCHEMA_VERSION}, got {document.get('schema_version')!r}"
        )
    if document.get("manifest_id") != MANIFEST_ID:
        errors.append(f"manifest_id must be {MANIFEST_ID!r}")
    if document.get("runtime_network_fetch") is not False:
        errors.append("runtime_network_fetch must be false")
    for field in ("generated_at", "generated_by"):
        if not isinstance(document.get(field), str) or not document[field]:
            errors.append(f"manifest field {field!r} must be a non-empty string")

    artifacts = document.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        return errors + ["artifacts must be a non-empty array"]

    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for index, artifact in enumerate(artifacts):
        prefix = f"artifacts[{index}]"
        if not isinstance(artifact, dict):
            errors.append(f"{prefix} must be an object")
            continue

        missing = REQUIRED_ARTIFACT_FIELDS - artifact.keys()
        if missing:
            errors.append(f"{prefix} missing fields: {', '.join(sorted(missing))}")
            continue

        artifact_id = artifact["id"]
        relative_path = artifact["path"]
        if not isinstance(artifact_id, str) or not artifact_id:
            errors.append(f"{prefix}.id must be a non-empty string")
        elif artifact_id in seen_ids:
            errors.append(f"duplicate artifact id: {artifact_id}")
        else:
            seen_ids.add(artifact_id)

        expected_artifact = (
            REQUIRED_GAMEPLAY_ARTIFACTS.get(artifact_id)
            if isinstance(artifact_id, str)
            else None
        )
        if expected_artifact is not None and (relative_path, artifact["role"]) != expected_artifact:
            errors.append(
                f"{prefix} must map {artifact_id} to {expected_artifact[0]} "
                f"as {expected_artifact[1]}"
            )

        if not isinstance(relative_path, str) or not relative_path:
            errors.append(f"{prefix}.path must be a non-empty string")
            continue
        if Path(relative_path).is_absolute():
            errors.append(f"{prefix}.path must be relative: {relative_path}")
            continue
        if relative_path in seen_paths:
            errors.append(f"duplicate artifact path: {relative_path}")
        else:
            seen_paths.add(relative_path)

        artifact_path = (root / relative_path).resolve()
        if not _within_root(root, artifact_path):
            errors.append(f"{prefix}.path escapes repository root: {relative_path}")
        elif not artifact_path.is_file():
            errors.append(f"artifact not found: {relative_path}")
        else:
            expected_hash = artifact["sha256"]
            if not isinstance(expected_hash, str) or not SHA256_PATTERN.fullmatch(expected_hash):
                errors.append(f"{prefix}.sha256 must be 64 lowercase hexadecimal characters")
            elif _sha256(artifact_path) != expected_hash:
                errors.append(f"{relative_path} sha256 mismatch")

            _, json_error = _load_json(artifact_path)
            if json_error:
                errors.append(f"{relative_path} is not valid JSON: {json_error}")

        role = artifact["role"]
        if role not in ALLOWED_ROLES:
            errors.append(f"{prefix}.role is not supported: {role!r}")

        consumers = artifact["consumers"]
        if not isinstance(consumers, list) or not consumers or not all(
            isinstance(consumer, str) and consumer for consumer in consumers
        ):
            errors.append(f"{prefix}.consumers must be a non-empty string array")

        source = artifact["source"]
        if not isinstance(source, dict):
            errors.append(f"{prefix}.source must be an object")
        else:
            missing_source = REQUIRED_SOURCE_FIELDS - source.keys()
            if missing_source:
                errors.append(
                    f"{prefix}.source missing fields: {', '.join(sorted(missing_source))}"
                )
            elif source["kind"] not in ALLOWED_SOURCE_KINDS:
                errors.append(f"{prefix}.source.kind is not supported: {source['kind']!r}")

        generation = artifact["generation"]
        if not isinstance(generation, dict):
            errors.append(f"{prefix}.generation must be an object")
        else:
            missing_generation = REQUIRED_GENERATION_FIELDS - generation.keys()
            if missing_generation:
                errors.append(
                    f"{prefix}.generation missing fields: {', '.join(sorted(missing_generation))}"
                )

        status = artifact["status"]
        if status not in ALLOWED_STATUSES:
            errors.append(f"{prefix}.status is not supported: {status!r}")
        elif status == "VERIFIED":
            source_complete = (
                isinstance(source, dict)
                and isinstance(source.get("revision"), str)
                and bool(source["revision"])
                and isinstance(source.get("retrieved_at"), str)
                and bool(source["retrieved_at"])
            )
            generation_complete = (
                isinstance(generation, dict)
                and isinstance(generation.get("tool"), str)
                and bool(generation["tool"])
                and isinstance(generation.get("commit"), str)
                and bool(generation["commit"])
            )
            if not source_complete or not generation_complete:
                errors.append(
                    f"{prefix} marked VERIFIED but provenance is incomplete; use PARTIAL or UNVERIFIED"
                )

    missing_artifacts = REQUIRED_GAMEPLAY_ARTIFACTS.keys() - seen_ids
    for artifact_id in sorted(missing_artifacts):
        errors.append(f"required gameplay artifact is missing from manifest: {artifact_id}")
    _validate_gameplay_artifacts(root, errors)

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[2],
        help="repository root (default: inferred from this script)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="manifest path (default: src-tauri/data/provenance.json)",
    )
    args = parser.parse_args(argv)
    root = args.root.resolve()
    manifest_arg = args.manifest or Path("src-tauri/data/provenance.json")
    manifest = (manifest_arg if manifest_arg.is_absolute() else root / manifest_arg).resolve()
    errors = validate_manifest(root, manifest)
    if errors:
        print("FAIL: G-Series data provenance manifest")
        for error in errors:
            print(f"- {error}")
        return 1

    document, _ = _load_json(manifest)
    print(f"PASS: G-Series data provenance manifest ({len(document['artifacts'])} artifacts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
