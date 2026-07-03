//! Headless GPU telemetry feeder for G-Maiden.
//!
//! A tiny, dependency-free sidecar the main app spawns at startup. It runs
//! `nvidia-smi` every N seconds and POSTs the first GPU's metrics to G-Maiden's
//! local server (`POST http://127.0.0.1:3000/telemetry`). Keeping this in a
//! SEPARATE process means the main app never spawns nvidia-smi itself — the NFR
//! budgets stay about the app's own work, and a slow/blocked nvidia-smi can't
//! stall the UI. No UI, no crates (raw std only).
//!
//! Interval: `GMAIDEN_GPU_FEED_MS` env (default 3000, floored at 500).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::Command;
use std::thread::sleep;
use std::time::Duration;

const HOST: &str = "127.0.0.1:3000";
/// Consecutive failed pushes (or no-GPU samples) before we assume G-Maiden has
/// exited and shut ourselves down. At the default 3s interval this is ~60s. This
/// is a backstop; G-Maiden also kills any prior feeder before spawning a fresh
/// one, so normally exactly one feeder runs (the current app's).
const GIVE_UP_AFTER: u32 = 20;

fn main() {
    let interval = std::env::var("GMAIDEN_GPU_FEED_MS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(3000)
        .max(500);

    let mut fails: u32 = 0;
    loop {
        let ok = sample_json().map(|body| post(&body).is_ok()).unwrap_or(false);
        if ok {
            fails = 0;
        } else {
            // No GPU, or G-Maiden's server is unreachable. Give it a while, then
            // exit (the parent app is gone, or there's nothing to feed).
            fails += 1;
            if fails >= GIVE_UP_AFTER {
                return;
            }
        }
        sleep(Duration::from_millis(interval));
    }
}

/// Query nvidia-smi for the first GPU and build the `{ "gpus": [ ... ] }` body.
/// `None` when nvidia-smi is missing/fails or reports no GPU.
fn sample_json() -> Option<String> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW — no console flash
    }
    let out = cmd.output().ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let line = stdout.lines().find(|l| !l.trim().is_empty())?;
    let f: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if f.len() < 5 {
        return None;
    }
    // Keep the name JSON-safe (drop quotes/backslashes); numbers are plain.
    let name = f[0].replace(['"', '\\'], "");
    let load: f64 = f[1].parse().ok()?;
    let used: f64 = f[2].parse().ok()?; // MiB
    let total: f64 = f[3].parse().ok()?; // MiB
    let temp: f64 = f[4].parse().ok()?;
    Some(format!(
        "{{\"gpus\":[{{\"name\":\"{name}\",\"loadPercent\":{load},\"tempC\":{temp},\"vramUsedMb\":{used},\"vramTotalMb\":{total}}}]}}"
    ))
}

/// Minimal HTTP/1.1 POST to the loopback server — no HTTP-client crate needed.
fn post(body: &str) -> std::io::Result<()> {
    let mut stream = TcpStream::connect(HOST)?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let req = format!(
        "POST /telemetry HTTP/1.1\r\nHost: {HOST}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(),
        body
    );
    stream.write_all(req.as_bytes())?;
    let mut buf = [0u8; 128];
    let _ = stream.read(&mut buf); // drain/ack, ignore contents
    Ok(())
}
