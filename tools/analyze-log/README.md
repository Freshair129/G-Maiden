# analyze-log — evaluate G-Signal gank warnings (#7 calibration)

Offline analysis of G-Log match files to measure whether G-Signal's gank
warnings were actually right — the data you need to replace G-Motion's v1
probability heuristic with tuned constants.

## What it reads

G-Log writes one JSONL per match to `%LOCALAPPDATA%\G-Maiden\logs\match-*.jsonl`
(local only, never uploaded). Two record kinds share one millisecond timeline:

- **tick samples** (~1 Hz): `{"ts", "tick": {deaths, hp_percent, alive, clock_time, ...}}`
- **G-Signal events**: `{"ts", "type": "gank_signal", probability, missing_heroes, eta_ms}`,
  plus `gank_revision` and `enemy_missing` records.

## What it computes

For each `gank_signal`, it looks `--window-ms` (default 8 s) ahead and counts it
a **true positive** if the player died or dropped to `--death-hp`% (default 15)
or below. Then:

- **precision** = right warnings / all warnings (low → too trigger-happy)
- **recall** = deaths that were warned in time / all deaths (low → missing ganks)

## Run

```bash
python analyze.py                      # scan the default G-Log dir
python analyze.py path/to/match.jsonl  # one match
python analyze.py path/to/logs/ --verbose
python analyze.py --window-ms 8000 --death-hp 15
```

## Test

```bash
python test_analyze.py     # synthetic match, checks the join logic
```

## How to use it to tune #7

1. Play (or replay) a few real matches with G-Maiden running so logs accumulate.
2. Run the analyzer.
3. **Low precision** → raise `DANGER_THRESHOLD` (`src-tauri/src/signal.rs`) or
   flatten the `missing_risk` curve (`src-tauri/src/motion.rs`).
   **Low recall** → lower the threshold or add features (enemy roles, proximity
   to the player, lane pressure).
4. Re-run until precision/recall are both acceptable; commit the new constants.

> The current model is a transparent hand-tuned heuristic. This tool turns "feels
> about right" into a measured number against real outcomes.
