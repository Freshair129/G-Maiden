#!/usr/bin/env python3
"""Self-test for analyze.py — builds a synthetic match and checks the join logic."""

import json
import os
import tempfile

import analyze


def write_match(records: list[dict]) -> str:
    fd, path = tempfile.mkstemp(prefix="match-", suffix=".jsonl")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return path


def tick(ts, deaths, hp):
    return {"ts": ts, "tick": {"deaths": deaths, "hp_percent": hp, "alive": hp > 0}}


def main() -> int:
    # Timeline: alert at t=1000 followed by a death at t=4000 (TP, covered).
    # A second alert at t=20000 with no consequence (false positive).
    recs = [
        tick(0, 0, 100),
        {"ts": 1000, "type": "gank_signal", "probability": 0.9,
         "missing_heroes": ["CM", "SF"], "eta_ms": 2000},
        tick(2000, 0, 60),
        tick(3000, 0, 20),
        tick(4000, 1, 0),          # death recorded here
        tick(5000, 1, 100),
        {"ts": 20000, "type": "gank_signal", "probability": 0.88,
         "missing_heroes": ["Lion"], "eta_ms": 1500},
        tick(21000, 1, 100),
        tick(28000, 1, 100),       # no death/HP drop after the 2nd alert
    ]
    path = write_match(recs)
    try:
        r = analyze.analyze_match(path, window_ms=8000, death_hp=15)
        assert r["alerts"] == 2, r
        assert r["deaths"] == 1, r
        assert r["true_positives"] == 1, r            # only the first alert hit
        assert abs(r["precision"] - 0.5) < 1e-9, r    # 1/2
        assert r["deaths_covered"] == 1, r
        assert abs(r["recall"] - 1.0) < 1e-9, r       # the death was warned
    finally:
        os.remove(path)

    # No-signal match: precision n/a, recall 0 (a death nobody warned about).
    recs2 = [tick(0, 0, 100), tick(1000, 0, 10), tick(2000, 1, 0)]
    path2 = write_match(recs2)
    try:
        r2 = analyze.analyze_match(path2, window_ms=8000, death_hp=15)
        assert r2["alerts"] == 0 and r2["precision"] is None, r2
        assert r2["deaths"] == 1 and r2["recall"] == 0.0, r2
    finally:
        os.remove(path2)

    print("test_analyze: all assertions passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
