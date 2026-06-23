# hybrid-meter

Live cost meter for the GoVibe hybrid loop: a frontier model plans + reviews, local SLMs execute on-device. See what ran free, what stayed local, and what you saved.

## Use

```
npx hybrid-meter                      # replay a real 128-run build as a live meter (demo)
npx hybrid-meter watch usage.jsonl    # live meter over your own run log
npx hybrid-meter report usage.jsonl   # one-shot savings report
```

No dependencies. The demo needs nothing but Node — it replays a bundled, real run log.

## What it shows

- **on-device %** — share of runs that executed locally at `$0` (ground truth, measured)
- **saved (est.)** — hybrid vs all-frontier, run-replacement estimate
- **review tax** — frontier review as a share of spend (the next optimization lever)

## Honest by design

The demo replays **real measured data** (128 runs). The saved figure is an *estimate* (a token-only floor is lower); the sample was planning-heavy, so implementation-heavy workloads run a higher local share. The one number that is not an estimate: **code never leaves the machine.**

## Feed it your own data

Point `watch`/`report` at any JSONL where each line is `{"model","mode","cost","in","out", ...}`. Runs whose `model` contains `ollama` count as local (`$0`); the rest are frontier spend. `#review` in the id is counted as the review tax.
