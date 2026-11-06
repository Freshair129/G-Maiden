//! Headless GPU telemetry feeder for G-Maiden.
//!
//! A dependency-free sidecar maintains a read-only NVML GPU0 session and POSTs
//! telemetry to the selected local G-Maiden service. Driver DLL residency remains
//! part of whole-app resource accounting. No query child processes are spawned.
//!
//! Interval: `GMAIDEN_GPU_FEED_MS` env (default 3000, floored at 500).

#![cfg_attr(all(target_os = "windows", not(test)), windows_subsystem = "windows")]

use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread::sleep;
use std::time::Duration;

// Endpoint loss still exits after 20 failed checks (~60s at the default interval).
// GPU reconnect cooldown ticks are not failed acquisition attempts.
mod feed_loop;

#[cfg(windows)]
mod nvml;

fn main() {
    let interval = std::env::var("GMAIDEN_GPU_FEED_MS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(3000)
        .max(500);

    #[cfg(windows)]
    let mut gpu = nvml::Sampler::new();
    let mut failures = feed_loop::FailureBudget::new();
    loop {
        let endpoint = selected_port().and_then(|port| {
            let host = format!("127.0.0.1:{port}");
            verify_health(&host, port).ok().map(|_| host)
        });
        let keep_running = failures.tick(
            endpoint.is_some(),
            || {
                #[cfg(windows)]
                {
                    gpu.sample_json()
                }
                #[cfg(not(windows))]
                {
                    feed_loop::SampleState::ActualUnavailable
                }
            },
            |body| {
                endpoint
                    .as_ref()
                    .is_some_and(|host| post_to(host, body).is_ok())
            },
        );
        if !keep_running {
            return;
        }
        sleep(Duration::from_millis(interval));
    }
}

/// Minimal HTTP/1.1 POST to the loopback server — no HTTP-client crate needed.
fn selected_port() -> Option<u16> {
    let file =
        std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("G-Maiden/gsi-port.txt");
    let text = std::fs::read_to_string(file).ok()?;
    parse_port(&text)
}

fn parse_port(text: &str) -> Option<u16> {
    text.trim()
        .parse::<u16>()
        .ok()
        .filter(|port| (3000..=3010).contains(port))
}

fn verify_health(host: &str, port: u16) -> std::io::Result<()> {
    let response = request(host, "GET", "/health", "")?;
    let (_, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| std::io::Error::other("invalid health response"))?;
    let compact: String = body
        .chars()
        .filter(|ch| !ch.is_ascii_whitespace())
        .collect();
    if compact != format!("{{\"service\":\"g-maiden\",\"port\":{port}}}") {
        return Err(std::io::Error::other(
            "endpoint is not the selected G-Maiden service",
        ));
    }
    Ok(())
}

fn post_to(host: &str, body: &str) -> std::io::Result<()> {
    request(host, "POST", "/telemetry", body).map(|_| ())
}

fn request(host: &str, method: &str, path: &str, body: &str) -> std::io::Result<String> {
    let address = host
        .parse()
        .map_err(|_| std::io::Error::other("invalid loopback endpoint"))?;
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    let req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        body.len(), body
    );
    stream.write_all(req.as_bytes())?;
    let mut response = String::new();
    stream.take(8192).read_to_string(&mut response)?;
    if !response.starts_with("HTTP/1.1 200 ") && !response.starts_with("HTTP/1.0 200 ") {
        return Err(std::io::Error::other(
            "G-Maiden did not acknowledge telemetry/health",
        ));
    }
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server(response: &'static str) -> (String, std::thread::JoinHandle<()>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let host = listener.local_addr().unwrap().to_string();
        let worker = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buf = [0; 4096];
            let _ = stream.read(&mut buf);
            stream.write_all(response.as_bytes()).unwrap();
        });
        (host, worker)
    }
    #[test]
    fn telemetry_requires_success_ack() {
        let (host, worker) = server(
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        assert!(post_to(&host, "{}").is_err());
        worker.join().unwrap();
    }
    #[test]
    fn telemetry_accepts_success_ack() {
        let (host, worker) =
            server("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        assert!(post_to(&host, "{}").is_ok());
        worker.join().unwrap();
    }
    #[test]
    fn only_supported_published_ports_are_admitted() {
        assert_eq!(parse_port("3007\n"), Some(3007));
        assert_eq!(parse_port("3011"), None);
        assert_eq!(parse_port("http://evil"), None);
    }
    #[test]
    fn health_must_identify_service_and_selected_port() {
        let (host, worker) = server(
            "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"service\":\"g-maiden\",\"port\":3007}",
        );
        assert!(verify_health(&host, 3007).is_ok());
        worker.join().unwrap();
        let (host, worker) = server(
            "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"service\":\"other\",\"port\":3007}",
        );
        assert!(verify_health(&host, 3007).is_err());
        worker.join().unwrap();
        let (host, worker) = server(
            "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{\"service\":\"g-maiden\",\"port\":3000}",
        );
        assert!(verify_health(&host, 3007).is_err());
        worker.join().unwrap();
    }
}
