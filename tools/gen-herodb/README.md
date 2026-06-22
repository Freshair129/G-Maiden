# gen-herodb — G-Damage hero database generator (P-D3)

Generates `src-tauri/data/heroes.json` (loaded by `src-tauri/src/damage.rs` via
`include_str!`) for the G-Damage lethality engine.

## What it does

- **Base stats** (armor, magic resist, attack damage, attributes + gains, attack
  range, primary attribute) come from [dotaconstants] — clean, reliable fields.
- **Ability damage tables** come from `curated_abilities.json`, **not** from an
  automated parse. dotaconstants `special_values` are too inconsistent to trust
  for a kill-calc, and a wrong number here means lying to the player. Heroes
  without a curated entry get `abilities: []` and rely on attack-damage burst
  only until verified.

## Run

```
python gen_herodb.py                 # fetches dotaconstants over the network
python gen_herodb.py heroes.json     # or pass a local dotaconstants heroes.json
```

Writes the full roster to `src-tauri/data/heroes.json` and prints how many heroes
got curated abilities.

## Adding a hero's abilities

Add an entry to `curated_abilities.json` keyed by GSI internal name
(`npc_dota_hero_*`), with each ability's `damage_type` (`Physical`/`Magical`/
`Pure`), `damage_per_level` (index 0 = ability level 1), `cooldown`, and
`is_ultimate`. Re-run the generator. Verify against the in-game tooltip — these
numbers feed a "can I kill" call, so accuracy matters.

[dotaconstants]: https://github.com/odota/dotaconstants
