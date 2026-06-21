#!/usr/bin/env python3
"""Fetch official Dota 2 hero icons for the minimap detector dataset.

The canonical minimap blip lives in Valve's VPK (needs GCFScape/VRF). The
closest *publicly downloadable* equivalent is the circular hero icon Valve
serves from the dota_react CDN — this is the same circular portrait the client
draws on the minimap. We pull one transparent-background PNG per hero so
`gen_dataset.py --icons-dir <out>` can composite real icons instead of the
synthetic-ring fallback (which NCC only scored ~10% on).

stdlib only (urllib) — no extra deps. Idempotent: skips files already present.

Usage:
    python fetch_icons.py --out ../../assets/minimap-icons
"""

import argparse
import json
import os
import sys
import time
import urllib.request

HEROES_API = "https://api.opendota.com/api/heroes"
# dota_react circular hero icon (transparent bg). <short> = name without the
# npc_dota_hero_ prefix, e.g. "antimage", "shadow_fiend".
ICON_URL = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/{short}.png"

UA = {"User-Agent": "G-Maiden-dataset-fetch/1.0 (+local tooling)"}


def get(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def hero_shorts() -> list[str]:
    """Return hero short-names (npc_dota_hero_X -> X) from the OpenDota API."""
    data = json.loads(get(HEROES_API).decode("utf-8"))
    shorts = []
    for h in data:
        name = h.get("name", "")
        if name.startswith("npc_dota_hero_"):
            shorts.append(name[len("npc_dota_hero_"):])
    return sorted(set(shorts))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../../assets/minimap-icons",
                    help="output dir for <hero>.png icons")
    ap.add_argument("--retries", type=int, default=3)
    args = ap.parse_args()

    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    print(f"fetching hero list from {HEROES_API} ...", file=sys.stderr)
    try:
        shorts = hero_shorts()
    except Exception as e:
        print(f"FAILED to get hero list: {e}", file=sys.stderr)
        return 1
    print(f"{len(shorts)} heroes", file=sys.stderr)

    ok, skipped, failed = 0, 0, []
    for i, short in enumerate(shorts, 1):
        dest = os.path.join(out, f"{short}.png")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            skipped += 1
            continue
        url = ICON_URL.format(short=short)
        for attempt in range(1, args.retries + 1):
            try:
                blob = get(url)
                if not blob or len(blob) < 100:
                    raise ValueError(f"suspiciously small ({len(blob)} bytes)")
                with open(dest, "wb") as f:
                    f.write(blob)
                ok += 1
                break
            except Exception as e:
                if attempt == args.retries:
                    failed.append((short, str(e)))
                else:
                    time.sleep(0.5 * attempt)
        if i % 20 == 0:
            print(f"  {i}/{len(shorts)} ...", file=sys.stderr)

    print(f"\ndone: downloaded={ok} skipped(existing)={skipped} "
          f"failed={len(failed)} -> {out}", file=sys.stderr)
    if failed:
        print("failed heroes:", file=sys.stderr)
        for short, err in failed:
            print(f"  {short}: {err}", file=sys.stderr)
    return 0 if not failed else 2


if __name__ == "__main__":
    raise SystemExit(main())
