---
title: "G-Sensory GPU telemetry feeder"
doc_id: "gpu-feeder-readme"
status: active
version: "0.1.2"
updated: 2026-10-28
owner: "G-Maiden"
---

# GPU telemetry feeder

The Windows sidecar reads GPU0 metadata through the installed NVIDIA NVML driver
and keeps one initialized session across successful samples. It loads only the
absolute `nvml.dll` path returned by `GetSystemDirectoryW`, with DLL dependency
search restricted to System32. There are no Rust dependencies or CLI fallbacks.
Read-only C signatures follow the [NVIDIA NVML reference](https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html):
`nvmlInit_v2`, `nvmlShutdown`, `nvmlDeviceGetHandleByIndex_v2`, `nvmlDeviceGetName`,
`nvmlDeviceGetUtilizationRates`, `nvmlDeviceGetMemoryInfo` (v1), and
`nvmlDeviceGetTemperature` (GPU sensor). The library remains loaded through shutdown.

The published loopback port and matching `/health` service are verified before
sampling. The existing `/telemetry` body retains `gpus`, `name`, `loadPercent`,
`tempC`, `vramUsedMb`, and `vramTotalMb`; memory values are MiB despite the field
suffix. A POST succeeds only after HTTP 200. The default sample interval is 3s,
floored at 500ms by `GMAIDEN_GPU_FEED_MS`.

A missing DLL/export, initialization failure, unsupported field, invalid output,
or driver sample error produces no sample. It never produces substitute zero
metrics. Failed sessions are dropped and reconnect attempts have a 30s cooldown;
actual failed GPU acquisitions and POST attempts increment the failure count.
Healthy-endpoint cooldown ticks neither increment nor reset it. A ready sample
with HTTP 200 ACK resets it. Missing or unhealthy endpoints still count every
loop tick and exit after 20 consecutive failures, even during GPU cooldown.
Consumers retain their existing telemetry staleness behavior. Production remains
a GUI subsystem process; tests use the console subsystem to retain test output.

Driver calls stay in this owned sidecar, outside the critical capture/audio path.
They rely on the driver returning; the loop does not claim a driver-call deadline.
The persistent DLL and sidecar RAM/CPU still count toward the complete application
budget. Unit tests and a metadata probe do not establish the current
900,000,000-byte aggregate Working Set, CPU or FPS gates;
those require a new integrated native receipt.

## Changelog

| Version | Date | Change |
| --- | --- | --- |
| 0.1.0 | 2026-10-28 | Replace repeated query child processes with persistent read-only NVML. |
| 0.1.1 | 2026-10-28 | Distinguish retry waiting from actual failed attempts so 500ms cadence can reach reconnect. |
| 0.1.2 | 2026-10-28 | Align the integrated RAM acceptance boundary with the owner-approved 900 MB MVP ceiling. |
