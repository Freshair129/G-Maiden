#!/usr/bin/env python3
"""Generate src-tauri/data/heroes.json for the G-Damage engine.

Base stats (armor, magic resist, attack damage, attributes/gains, attack range)
come from dotaconstants — these fields are clean and reliable.

Ability damage tables are deliberately NOT auto-extracted: dotaconstants
`special_values` are too inconsistent to trust for a kill-calc (the wrong number
here means lying to the player). They come from `curated_abilities.json`, which
is hand-verified. Heroes without a curated entry get `abilities: []` and rely on
attack-damage burst only until someone verifies their abilities.

Usage:
    python gen_herodb.py [path-to-local-heroes.json]
If no path is given, fetches dotaconstants over the network.
"""
import json
import os
import sys
import urllib.request

HEROES_URL = "https://raw.githubusercontent.com/odota/dotaconstants/master/build/heroes.json"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "..", "src-tauri", "data", "heroes.json"))
CURATED = os.path.join(HERE, "curated_abilities.json")

# dotaconstants primary_attr -> our HeroData primary_attr
ATTR = {"str": "str", "agi": "agi", "int": "int", "all": "uni"}


def load_heroes(local):
    if local and os.path.exists(local):
        with open(local, encoding="utf-8") as f:
            return json.load(f)
    with urllib.request.urlopen(HEROES_URL, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    local = sys.argv[1] if len(sys.argv) > 1 else None
    raw = load_heroes(local)
    with open(CURATED, encoding="utf-8") as f:
        curated = json.load(f)

    def sort_key(kv):
        try:
            return int(kv[0])
        except (TypeError, ValueError):
            return 1 << 30

    out = []
    for _id, h in sorted(raw.items(), key=sort_key):
        name = h.get("name")
        if not name:
            continue
        out.append({
            "internal_name": name,
            "display_name": h.get("localized_name", name),
            "base_damage_min": float(h.get("base_attack_min", 0)),
            "base_damage_max": float(h.get("base_attack_max", 0)),
            "base_armor": float(h.get("base_armor", 0)),
            "base_magic_resistance": float(h.get("base_mr", 25)),
            "primary_attr": ATTR.get(h.get("primary_attr", "int"), "int"),
            "base_str": float(h.get("base_str", 0)),
            "str_gain": float(h.get("str_gain", 0)),
            "base_agi": float(h.get("base_agi", 0)),
            "agi_gain": float(h.get("agi_gain", 0)),
            "base_int": float(h.get("base_int", 0)),
            "int_gain": float(h.get("int_gain", 0)),
            "base_attack_speed": float(h.get("base_attack_time", 100)),
            "attack_range": float(h.get("attack_range", 0)),
            "abilities": curated.get(name, []),
        })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")

    n_ab = sum(1 for r in out if r["abilities"])
    print(f"wrote {len(out)} heroes to {OUT} ({n_ab} with curated abilities)")


if __name__ == "__main__":
    main()
