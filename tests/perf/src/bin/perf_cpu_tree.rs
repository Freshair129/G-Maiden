//! G-Maiden CPU Tree Harness
//!
//! Measures CPU usage the way Windows Task Manager effectively presents it for
//! an app group: the root `g-maiden.exe` process plus all live descendants
//! (WebView2 renderer/GPU/utility, sidecars, and subprocesses spawned by the
//! host such as the governor's PowerShell probes).
//!
//! This closes the gap between:
//!   - `governor.rs`, which measures only the current Rust host process, and
//!   - the user's real observation in Task Manager, which groups child
//!     processes under the app and can therefore show a much higher total.
//!
//! Usage:
//!   cargo run --release --bin perf_cpu_tree
//!   cargo run --release --bin perf_cpu_tree -- --pid 1234
//!   cargo run --release --bin perf_cpu_tree -- --secs 30 --interval-ms 1000
//!
//! Exit codes:
//!   0  = measurement completed and peak tree CPU <= 2.5%
//!   1  = measurement completed and peak tree CPU > 2.5%
//!   77 = skip (no live G-Maiden root pid found / process exited before sample)

use std::{collections::{BTreeMap, BTreeSet, HashMap}, env, process, thread, time::Duration};
use sysinfo::{Pid, Process, System};

const EXIT_SKIP: i32 = 77;
const CPU_BUDGET_PCT: f32 = 2.5;
const DEFAULT_DURATION_SECS: u64 = 20;
const DEFAULT_INTERVAL_MS: u64 = 1000;
const PRIME_INTERVAL_MS: u64 = 500;

#[derive(Clone, Debug, PartialEq, Eq)]
struct ProcNode {
    pid: u32,
    parent: Option<u32>,
    name: String,
}

#[derive(Clone, Debug)]
struct Sample {
    total_cpu_pct: f32,
    by_name: BTreeMap<String, f32>,
    members: Vec<(u32, String, f32)>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let pid = parse_u32_flag(&args, "--pid").or_else(find_gmaiden_pid);
    let secs = parse_u64_flag(&args, "--secs").unwrap_or(DEFAULT_DURATION_SECS);
    let interval_ms = parse_u64_flag(&args, "--interval-ms").unwrap_or(DEFAULT_INTERVAL_MS);

    println!("============================================================");
    println!(" G-Maiden CPU Tree Harness");
    println!(" Task Manager-aligned process-group CPU measurement");
    println!(
        " Budget: peak grouped CPU <= {:.1}%  (core-normalized over {} logical cores)",
        CPU_BUDGET_PCT,
        logical_cores() as u32
    );
    println!("============================================================");
    println!();

    let Some(root_pid) = pid else {
        eprintln!("[CPU] SKIP - no live g-maiden process found (start the app first, or pass --pid)");
        process::exit(EXIT_SKIP);
    };

    println!(
        "[CPU] Sampling root pid {} for {}s every {}ms ...",
        root_pid, secs, interval_ms
    );

    let result = run_measurement(root_pid, secs, interval_ms);
    match result {
        None => {
            eprintln!("[CPU] SKIP - root process disappeared before any usable sample");
            process::exit(EXIT_SKIP);
        }
        Some(samples) => report(samples),
    }
}

fn run_measurement(root_pid: u32, secs: u64, interval_ms: u64) -> Option<Vec<Sample>> {
    let root = Pid::from_u32(root_pid);
    let mut sys = System::new_all();

    // Prime sysinfo's CPU accounting; the first refresh has no meaningful delta yet.
    sys.refresh_all();
    thread::sleep(Duration::from_millis(PRIME_INTERVAL_MS));
    sys.refresh_all();

    if sys.process(root).is_none() {
        return None;
    }

    let rounds = secs.max(1).saturating_mul(1000).div_ceil(interval_ms.max(1));
    let mut samples = Vec::with_capacity(rounds as usize);

    for _ in 0..rounds {
        let graph = snapshot_process_graph(&sys);
        let tree = descendants_of(root_pid, &graph);
        if tree.is_empty() {
            break;
        }
        samples.push(capture_sample(&sys, &tree));
        thread::sleep(Duration::from_millis(interval_ms.max(1)));
        sys.refresh_all();
    }

    (!samples.is_empty()).then_some(samples)
}

fn snapshot_process_graph(sys: &System) -> Vec<ProcNode> {
    sys.processes()
        .values()
        .map(|p| ProcNode {
            pid: p.pid().as_u32(),
            parent: p.parent().map(|pid| pid.as_u32()),
            name: p.name().to_string(),
        })
        .collect()
}

fn descendants_of(root_pid: u32, graph: &[ProcNode]) -> BTreeSet<u32> {
    let mut children_by_parent: HashMap<u32, Vec<u32>> = HashMap::new();
    for node in graph {
        if let Some(parent) = node.parent {
            children_by_parent.entry(parent).or_default().push(node.pid);
        }
    }

    let mut seen = BTreeSet::new();
    let mut stack = vec![root_pid];
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(children) = children_by_parent.get(&pid) {
            stack.extend(children.iter().copied());
        }
    }
    seen
}

/// Logical cores, used to put `sysinfo`'s per-core percentages on the same scale
/// as the NFR.
///
/// `Process::cpu_usage()` is relative to ONE core: a process saturating a single
/// core reports 100%, and a multi-threaded one can exceed it. `governor.rs`
/// reports the budget-bearing number **core-normalized**
/// (`(cpu_delta_ms / (wall_ms * cores)) * 100`), and Task Manager's per-process
/// column is normalized too. Summing raw `cpu_usage()` and comparing it to a 2.5%
/// budget therefore over-reports by the core count — 12x on a 12-core box, which
/// makes every run FAIL at roughly 0.2% of real usage. Any conclusion about the
/// CPU NFR drawn from the un-normalized numbers is wrong by that factor.
fn logical_cores() -> f32 {
    std::thread::available_parallelism()
        .map(|n| n.get() as f32)
        .unwrap_or(1.0)
}

fn capture_sample(sys: &System, tree: &BTreeSet<u32>) -> Sample {
    let mut total = 0.0_f32;
    let mut by_name = BTreeMap::new();
    let mut members = Vec::with_capacity(tree.len());
    let cores = logical_cores();

    for pid in tree {
        let Some(proc) = sys.process(Pid::from_u32(*pid)) else {
            continue;
        };
        let cpu = proc.cpu_usage() / cores;
        total += cpu;
        *by_name.entry(proc.name().to_string()).or_insert(0.0) += cpu;
        members.push((*pid, proc.name().to_string(), cpu));
    }

    members.sort_by(|a, b| {
        b.2.partial_cmp(&a.2)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });

    Sample {
        total_cpu_pct: total,
        by_name,
        members,
    }
}

fn report(samples: Vec<Sample>) {
    let totals: Vec<f32> = samples.iter().map(|s| s.total_cpu_pct).collect();
    let peak = totals
        .iter()
        .copied()
        .fold(0.0_f32, f32::max);
    let mean = totals.iter().copied().sum::<f32>() / totals.len() as f32;
    let p50 = percentile(&totals, 0.50);
    let p95 = percentile(&totals, 0.95);
    let passed = peak <= CPU_BUDGET_PCT;

    println!();
    println!(
        "[CPU] total-tree  mean {:.2}%  p50 {:.2}%  p95 {:.2}%  peak {:.2}%  -> {}",
        mean,
        p50,
        p95,
        peak,
        if passed { "PASS" } else { "FAIL" }
    );

    let mut aggregate_by_name = BTreeMap::<String, f32>::new();
    for sample in &samples {
        for (name, cpu) in &sample.by_name {
            *aggregate_by_name.entry(name.clone()).or_insert(0.0) += *cpu;
        }
    }

    let mut contributors: Vec<(String, f32)> = aggregate_by_name
        .into_iter()
        .map(|(name, total_cpu)| (name, total_cpu / samples.len() as f32))
        .collect();
    contributors.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| a.0.cmp(&b.0))
    });

    println!();
    println!("[CPU] mean grouped contributors:");
    for (name, mean_cpu) in contributors {
        println!("  {:<24} {:>6.2}%", name, mean_cpu);
    }

    if let Some(hottest) = samples
        .iter()
        .max_by(|a, b| a.total_cpu_pct.partial_cmp(&b.total_cpu_pct).unwrap_or(std::cmp::Ordering::Equal))
    {
        println!();
        println!("[CPU] hottest sample member breakdown:");
        for (pid, name, cpu) in hottest.members.iter().take(12) {
            println!("  pid {:>6}  {:<24} {:>6.2}%", pid, name, cpu);
        }
    }

    println!();
    if passed {
        process::exit(0);
    } else {
        process::exit(1);
    }
}

fn percentile(values: &[f32], q: f32) -> f32 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((sorted.len() - 1) as f32 * q).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

fn parse_u32_flag(args: &[String], flag: &str) -> Option<u32> {
    let idx = args.iter().position(|a| a == flag)?;
    args.get(idx + 1)?.parse().ok()
}

fn parse_u64_flag(args: &[String], flag: &str) -> Option<u64> {
    let idx = args.iter().position(|a| a == flag)?;
    args.get(idx + 1)?.parse().ok()
}

fn find_gmaiden_pid() -> Option<u32> {
    let mut sys = System::new_all();
    sys.refresh_all();
    sys.processes()
        .values()
        .find(|p| is_gmaiden_root(p))
        .map(|p| p.pid().as_u32())
}

fn is_gmaiden_root(p: &Process) -> bool {
    let name = p.name().to_ascii_lowercase();
    name == "g-maiden.exe" || name == "g-maiden"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descendants_include_root_and_nested_children() {
        let graph = vec![
            ProcNode { pid: 10, parent: None, name: "g-maiden.exe".into() },
            ProcNode { pid: 11, parent: Some(10), name: "msedgewebview2.exe".into() },
            ProcNode { pid: 12, parent: Some(11), name: "msedgewebview2.exe".into() },
            ProcNode { pid: 20, parent: None, name: "other.exe".into() },
        ];
        let set = descendants_of(10, &graph);
        assert!(set.contains(&10));
        assert!(set.contains(&11));
        assert!(set.contains(&12));
        assert!(!set.contains(&20));
    }

    #[test]
    fn percentile_handles_edges() {
        let values = [1.0, 2.0, 3.0, 4.0];
        assert_eq!(percentile(&values, 0.0), 1.0);
        assert_eq!(percentile(&values, 1.0), 4.0);
    }

    #[test]
    fn parse_flag_reads_numeric_value() {
        let args = vec![
            "perf_cpu_tree".to_string(),
            "--secs".to_string(),
            "30".to_string(),
        ];
        assert_eq!(parse_u64_flag(&args, "--secs"), Some(30));
        assert_eq!(parse_u64_flag(&args, "--pid"), None);
    }
}
