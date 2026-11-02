---
title: "CR-040/C OBS CV compatibility spike"
doc_id: "cr040-obs-cv-spike"
status: "draft"
version: "0.1.0"
updated: "2026-11-02"
owner: "G-Maiden"
---

# CR-040/C OBS CV compatibility spike

## Purpose

Define a source-only contract and synthetic fixtures for evaluating OBS Virtual Camera as a possible CV frame source. Preserve DXGI as the MVP CV path until live comparison proves the alternate source meets the existing quality, latency, privacy, FPS, and resource gates.

This directory contains no native hook, injection, OBS connection, captured frame, production adapter, or runtime-provider change. All JSON geometry and timestamps are synthetic fixture values. They are not Dota match data, Windows observations, OBS measurements, or performance results.

## Files

- [`compatibility-proposal.md`](compatibility-proposal.md) records the reviewed Rust source boundary and a non-binding candidate interface.
- [`fixtures.json`](fixtures.json) contains game-only source descriptors and 1080p / non-16:9 geometry cases.
- [`contract.mjs`](contract.mjs) implements source classification, aspect-preserving viewport mapping, exact ROI projection, receipt timestamp metadata, and fail-closed freshness assessment with Node standard-library APIs only.
- [`contract.test.mjs`](contract.test.mjs) defines deterministic synthetic tests for those behaviors.
- [`acceptance-matrix.md`](acceptance-matrix.md) defines the live Windows / Dota / OBS plan and status rules.

## Local focused test

```powershell
node --test tools/obs-cv-spike/contract.test.mjs
```

Local execution is `NOT RUN` for this candidate because a later process snapshot reported Dota 2 and two G-Maiden processes active. No Node test result is claimed here. The current CI workflow has explicit Node test paths and does not invoke this file. Hosted CI validates the repository gates but does not execute this focused suite.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-11-02 | Add the source-only spike contract, synthetic fixtures, and live acceptance plan. |
