#!/usr/bin/env python3
"""Self-test for analyze.py — builds synthetic matches and checks the join logic
(precision/recall) plus the silent-arm efficacy bucketing (RWANG TASK 2).

Run with `python -m pytest` (pytest collects the `test_*` functions below) or
directly as a script (`python test_analyze.py`), which runs the same checks.
"""

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


def signal(ts, armed=True, probability=0.9, missing=None, eta_ms=2000):
    r = {"ts": ts, "type": "gank_signal", "probability": probability,
         "missing_heroes": missing or ["CM"], "eta_ms": eta_ms}
    if armed is not None:
        r["armed"] = armed
    return r


def match_start(ts=0, silent_arm=False, study=True):
    return {"ts": ts, "type": "match_start", "silent_arm": silent_arm, "study": study}


def test_precision_recall_join():
    # Timeline: alert at t=1000 followed by a death at t=4000 (TP, covered).
    # A second alert at t=20000 with no consequence (false positive).
    recs = [
        tick(0, 0, 100),
        signal(1000, armed=True, probability=0.9, missing=["CM", "SF"], eta_ms=2000),
        tick(2000, 0, 60),
        tick(3000, 0, 20),
        tick(4000, 1, 0),          # death recorded here
        tick(5000, 1, 100),
        signal(20000, armed=True, probability=0.88, missing=["Lion"], eta_ms=1500),
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


def test_no_signal_match_has_uncovered_death():
    # No-signal match: precision n/a, recall 0 (a death nobody warned about).
    recs2 = [tick(0, 0, 100), tick(1000, 0, 10), tick(2000, 1, 0)]
    path2 = write_match(recs2)
    try:
        r2 = analyze.analyze_match(path2, window_ms=8000, death_hp=15)
        assert r2["alerts"] == 0 and r2["precision"] is None, r2
        assert r2["deaths"] == 1 and r2["recall"] == 0.0, r2
    finally:
        os.remove(path2)


def test_is_armed_defaults_true_for_legacy_records_without_the_field():
    legacy = {"ts": 1000, "type": "gank_signal", "probability": 0.9}
    assert analyze.is_armed(legacy) is True
    assert analyze.is_armed({"armed": False}) is False
    assert analyze.is_armed({"armed": True}) is True


def test_bucket_by_arm_splits_events_and_computes_death_rate_per_arm():
    # Two armed warnings (one followed by a death), one silent warning
    # (followed by a death) — silent-arm efficacy study (RWANG TASK 2).
    signals = [
        signal(1000, armed=True),
        signal(20000, armed=True),
        signal(30000, armed=False),
    ]
    deaths = [4000, 33000]  # covers the 1st armed alert and the silent alert
    buckets = analyze.bucket_by_arm(signals, deaths, window_ms=8000)
    assert buckets["armed"]["events"] == 2
    assert buckets["armed"]["deaths"] == 1
    assert abs(buckets["armed"]["rate"] - 0.5) < 1e-9
    assert buckets["silent"]["events"] == 1
    assert buckets["silent"]["deaths"] == 1
    assert abs(buckets["silent"]["rate"] - 1.0) < 1e-9


def test_bucket_by_arm_rate_is_none_when_arm_has_no_events():
    buckets = analyze.bucket_by_arm([signal(1000, armed=True)], [4000], window_ms=8000)
    assert buckets["armed"]["events"] == 1
    assert buckets["silent"]["events"] == 0
    assert buckets["silent"]["rate"] is None


def test_analyze_match_reports_arms_bucket_end_to_end_for_study_match():
    recs = [
        match_start(study=True),
        tick(0, 0, 100),
        signal(1000, armed=True),
        tick(4000, 1, 0),           # death within window of the armed alert
        signal(10000, armed=False),
        tick(19000, 1, 100),        # no death within window of the silent alert
    ]
    path = write_match(recs)
    try:
        r = analyze.analyze_match(path, window_ms=8000, death_hp=15)
        assert r["study"] is True
        assert r["arms"]["armed"]["events"] == 1
        assert r["arms"]["armed"]["deaths"] == 1
        assert r["arms"]["silent"]["events"] == 1
        assert r["arms"]["silent"]["deaths"] == 0
    finally:
        os.remove(path)


def test_study_flag_true_only_for_study_matches():
    assert analyze.study_flag([match_start(study=True)]) is True
    assert analyze.study_flag([match_start(study=False)]) is False
    # Legacy match with no match_start record at all.
    assert analyze.study_flag([tick(0, 0, 100), signal(1000)]) is False


def test_analyze_match_excludes_non_study_and_legacy_matches_from_arms():
    # Legacy match (no match_start): its all-armed events must NOT enter the
    # efficacy buckets, even though precision/recall still count normally (W1).
    legacy = [
        tick(0, 0, 100),
        signal(1000, armed=True),
        tick(4000, 1, 0),
    ]
    path = write_match(legacy)
    try:
        r = analyze.analyze_match(path, window_ms=8000, death_hp=15)
        assert r["study"] is False
        assert r["alerts"] == 1          # still analyzed for precision/recall
        assert r["arms"]["armed"]["events"] == 0
        assert r["arms"]["silent"]["events"] == 0
    finally:
        os.remove(path)

    # Explicitly opted-out study match (study=false): also excluded.
    opted_out = [
        match_start(study=False),
        signal(1000, armed=True),
        tick(4000, 1, 0),
    ]
    path2 = write_match(opted_out)
    try:
        r2 = analyze.analyze_match(path2, window_ms=8000, death_hp=15)
        assert r2["study"] is False
        assert r2["arms"]["armed"]["events"] == 0
    finally:
        os.remove(path2)


def test_merge_arm_buckets_sums_across_matches():
    a = {"armed": {"events": 2, "deaths": 1}, "silent": {"events": 1, "deaths": 1}}
    b = {"armed": {"events": 3, "deaths": 0}, "silent": {"events": 0, "deaths": 0}}
    merged = analyze.merge_arm_buckets(a, b)
    assert merged["armed"] == {"events": 5, "deaths": 1}
    assert merged["silent"] == {"events": 1, "deaths": 1}


def main() -> int:
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
    print("test_analyze: all assertions passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
