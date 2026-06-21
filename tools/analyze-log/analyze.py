#!/usr/bin/env python3
"""Analyze G-Log match files to evaluate G-Signal gank warnings (#7 calibration).

G-Log writes one JSONL per match (`%LOCALAPPDATA%\\G-Maiden\\logs\\match-*.jsonl`),
mixing two record kinds on a shared millisecond timeline:
  - tick samples (~1 Hz): {"ts": <ms>, "tick": {deaths, hp_percent, clock_time, ...}}
  - G-Signal events:       {"ts": <ms>, "type": "gank_signal"|"gank_revision"|"enemy_missing", ...}

We join each `gank_signal` to what actually happened next (death, or a steep HP
drop) within a window, and report precision (were the warnings right?) and recall
(did we warn before deaths?). Those two numbers are exactly what you tune the
G-Motion probability curve + G-Signal DANGER_THRESHOLD against — replacing the
v1 heuristic guesswork with measured outcomes.

Everything stays local; this only READS the logs. stdlib only.

Usage:
    python analyze.py                      # scan the default G-Log dir
    python analyze.py path/to/match.jsonl  # one match
    python analyze.py path/to/logs/        # a directory of matches
    python analyze.py --window-ms 8000 --death-hp 15
"""

import argparse
import glob
import json
import os
import sys


def default_log_dir() -> str:
    base = os.environ.get("LOCALAPPDATA", ".")
    return os.path.join(base, "G-Maiden", "logs")


def load_records(path: str) -> list[dict]:
    recs = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except json.JSONDecodeError:
                pass  # tolerate a torn last line from a power-cut
    recs.sort(key=lambda r: r.get("ts", 0))
    return recs


def split(recs: list[dict]):
    ticks, signals = [], []
    for r in recs:
        if "tick" in r:
            t = r["tick"]
            ticks.append({
                "ts": r.get("ts", 0),
                "deaths": int(t.get("deaths", 0)),
                "hp": int(t.get("hp_percent", 0)),
                "alive": bool(t.get("alive", True)),
            })
        elif r.get("type") == "gank_signal":
            signals.append(r)
    return ticks, signals


def death_events(ticks: list[dict]) -> list[int]:
    """Timestamps (ms) where the player's death count increased."""
    out, prev = [], None
    for t in ticks:
        if prev is not None and t["deaths"] > prev:
            out.append(t["ts"])
        prev = t["deaths"]
    return out


def hp_in_window(ticks: list[dict], start: int, end: int) -> int:
    """Minimum HP% seen in (start, end]; 100 if no samples there."""
    lows = [t["hp"] for t in ticks if start < t["ts"] <= end and t["hp"] > 0]
    return min(lows) if lows else 100


def analyze_match(path: str, window_ms: int, death_hp: int) -> dict:
    ticks, signals = split(load_records(path))
    deaths = death_events(ticks)

    # Precision: each alert is a true positive if a death OR a steep HP drop
    # follows within the window.
    tp = 0
    alert_details = []
    for s in signals:
        ts = s.get("ts", 0)
        died = any(ts < d <= ts + window_ms for d in deaths)
        min_hp = hp_in_window(ticks, ts, ts + window_ms)
        hit = died or min_hp <= death_hp
        tp += 1 if hit else 0
        alert_details.append({
            "ts": ts, "prob": s.get("probability"), "missing": s.get("missing_heroes"),
            "outcome": "death" if died else (f"hp<={min_hp}" if hit else "safe"),
        })

    # Recall: each death is "covered" if an alert preceded it within the window.
    covered = sum(1 for d in deaths if any(s.get("ts", 0) <= d <= s.get("ts", 0) + window_ms for s in signals))

    n_alerts = len(signals)
    n_deaths = len(deaths)
    return {
        "match": os.path.basename(path),
        "alerts": n_alerts,
        "deaths": n_deaths,
        "true_positives": tp,
        "precision": (tp / n_alerts) if n_alerts else None,
        "deaths_covered": covered,
        "recall": (covered / n_deaths) if n_deaths else None,
        "details": alert_details,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path", nargs="?", default=default_log_dir(),
                    help="match-*.jsonl file, a dir of them, or the G-Log dir")
    ap.add_argument("--window-ms", type=int, default=8000,
                    help="how long after an alert an outcome still counts")
    ap.add_argument("--death-hp", type=int, default=15,
                    help="HP%% at/below which a near-death counts as a hit")
    ap.add_argument("--verbose", action="store_true", help="print per-alert detail")
    args = ap.parse_args()

    if os.path.isdir(args.path):
        files = sorted(glob.glob(os.path.join(args.path, "match-*.jsonl")))
    else:
        files = [args.path]
    if not files:
        print(f"no match logs found at {args.path}", file=sys.stderr)
        return 1

    tot_alerts = tot_deaths = tot_tp = tot_cov = 0
    for path in files:
        r = analyze_match(path, args.window_ms, args.death_hp)
        prec = f"{r['precision']:.0%}" if r["precision"] is not None else "n/a"
        rec = f"{r['recall']:.0%}" if r["recall"] is not None else "n/a"
        print(f"{r['match']}: alerts={r['alerts']} deaths={r['deaths']} "
              f"precision={prec} recall={rec}")
        if args.verbose:
            for d in r["details"]:
                p = f"{d['prob']:.2f}" if isinstance(d["prob"], (int, float)) else "?"
                print(f"    t={d['ts']} p={p} missing={d['missing']} -> {d['outcome']}")
        tot_alerts += r["alerts"]
        tot_deaths += r["deaths"]
        tot_tp += r["true_positives"]
        tot_cov += r["deaths_covered"]

    print("-" * 60)
    prec = f"{tot_tp / tot_alerts:.0%}" if tot_alerts else "n/a"
    rec = f"{tot_cov / tot_deaths:.0%}" if tot_deaths else "n/a"
    print(f"TOTAL ({len(files)} matches): alerts={tot_alerts} deaths={tot_deaths} "
          f"precision={prec} recall={rec}")
    print("\nTuning hint: low precision -> raise DANGER_THRESHOLD or the missing_risk "
          "curve (signal.rs/motion.rs); low recall -> lower it / add features.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
