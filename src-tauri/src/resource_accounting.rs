//! Pure aggregation; process identity includes creation time to reject PID reuse.
use std::collections::{BTreeMap, BTreeSet};

pub const RAM_BUDGET_BYTES: u64 = 900_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Identity {
    pub pid: u32,
    pub created: u64,
}

#[derive(Clone, Copy, Debug)]
pub struct Reading {
    pub identity: Identity,
    pub working_set: u64,
    pub cpu_100ns: u64,
}

/// Follow only parent links whose process creation times could form a real lineage.
/// An inaccessible relevant process is unknown, not evidence of non-membership.
pub fn descendants(
    roots: &[u32],
    edges: &[(u32, u32)],
    mut created: impl FnMut(u32) -> Option<u64>,
) -> Option<BTreeSet<Identity>> {
    let mut found = BTreeMap::new();
    for &pid in roots {
        if pid == 0 {
            return None;
        }
        let time = created(pid)?;
        if time == 0 {
            return None;
        }
        if found.insert(pid, time).is_some_and(|prior| prior != time) {
            return None;
        }
    }
    loop {
        let before = found.len();
        for &(pid, parent) in edges {
            let Some(&parent_time) = found.get(&parent) else {
                continue;
            };
            if found.contains_key(&pid) {
                continue;
            }
            if pid == 0 {
                return None;
            }
            let time = created(pid)?;
            if time == 0 {
                return None;
            }
            if time >= parent_time {
                found.insert(pid, time);
            }
        }
        if before == found.len() {
            break;
        }
    }
    Some(
        found
            .into_iter()
            .map(|(pid, created)| Identity { pid, created })
            .collect(),
    )
}

pub fn all_in_job(descendants: &BTreeSet<Identity>, pids: &[u32]) -> bool {
    descendants
        .iter()
        .all(|identity| pids.contains(&identity.pid))
}

pub fn same_identities(required: &[Identity], readings: &[Reading]) -> bool {
    required.len() == readings.len()
        && required.iter().copied().collect::<BTreeSet<_>>()
            == readings
                .iter()
                .map(|reading| reading.identity)
                .collect::<BTreeSet<_>>()
}

pub fn aggregate(required: &[u32], readings: &[Reading]) -> Option<(u64, BTreeMap<Identity, u64>)> {
    let required: BTreeSet<_> = required.iter().copied().collect();
    if required.is_empty() || required.contains(&0) {
        return None;
    }
    let mut samples = BTreeMap::new();
    for reading in readings {
        if !required.contains(&reading.identity.pid) {
            return None;
        }
        if samples.insert(reading.identity.pid, *reading).is_some() {
            return None;
        }
    }
    if samples.len() != required.len() {
        return None;
    }
    let mut bytes = 0_u64;
    let mut cpu = BTreeMap::new();
    for reading in samples.values() {
        bytes = bytes.checked_add(reading.working_set)?;
        cpu.insert(reading.identity, reading.cpu_100ns);
    }
    Some((bytes, cpu))
}

pub fn normalized_cpu(
    previous: &BTreeMap<Identity, u64>,
    current: &BTreeMap<Identity, u64>,
    wall_100ns: u64,
    cores: usize,
) -> Option<f64> {
    if wall_100ns == 0 || cores == 0 || previous.len() != current.len() {
        return None;
    }
    let mut delta = 0_u64;
    for (identity, now) in current {
        delta = delta.checked_add(now.checked_sub(*previous.get(identity)?)?)?;
    }
    Some(delta as f64 / wall_100ns as f64 / cores as f64 * 100.)
}

pub fn normalized_with_job(
    previous_job: u64,
    current_job: u64,
    previous_external: &BTreeMap<Identity, u64>,
    current_external: &BTreeMap<Identity, u64>,
    wall_100ns: u64,
    cores: usize,
) -> Option<f64> {
    let external = normalized_cpu(previous_external, current_external, wall_100ns, cores)?;
    Some(
        current_job.checked_sub(previous_job)? as f64 / wall_100ns as f64 / cores as f64 * 100.
            + external,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn older_reused_parent_id_does_not_claim_old_child_or_grandchild() {
        let times = BTreeMap::from([(10, 300), (20, 200), (30, 250), (40, 310)]);
        let got = descendants(&[10], &[(20, 10), (30, 20), (40, 10)], |pid| {
            times.get(&pid).copied()
        })
        .unwrap();
        assert_eq!(
            got,
            BTreeSet::from([
                Identity {
                    pid: 10,
                    created: 300
                },
                Identity {
                    pid: 40,
                    created: 310
                }
            ])
        );
    }

    #[test]
    fn live_breakaway_child_and_grandchild_are_not_exempt_from_job() {
        let times = BTreeMap::from([(10, 100), (20, 110), (30, 120)]);
        let got =
            descendants(&[10], &[(20, 10), (30, 20)], |pid| times.get(&pid).copied()).unwrap();
        assert!(!all_in_job(&got, &[10, 20]));
        assert!(all_in_job(&got, &[10, 20, 30]));
    }

    #[test]
    fn inaccessible_relevant_times_and_pid_reuse_race_fail_closed() {
        let times = BTreeMap::from([(10, 100)]);
        assert!(descendants(&[10], &[(20, 10)], |pid| times.get(&pid).copied()).is_none());
        assert!(descendants(&[10], &[], |_| None).is_none());
        assert!(!same_identities(
            &[Identity {
                pid: 10,
                created: 100
            }],
            &[r(10, 1, 0)]
        ));
        assert!(same_identities(
            &[Identity {
                pid: 10,
                created: 1
            }],
            &[r(10, 1, 0)]
        ));
    }
    fn r(pid: u32, bytes: u64, cpu: u64) -> Reading {
        Reading {
            identity: Identity { pid, created: 1 },
            working_set: bytes,
            cpu_100ns: cpu,
        }
    }
    #[test]
    fn owner_ram_contract_is_exact_decimal_nine_hundred_megabytes() {
        assert_eq!(RAM_BUDGET_BYTES, 900_000_000);
    }
    #[test]
    fn children_and_shared_provider_count_with_decimal_budget() {
        for (provider_bytes, expected, over) in [
            (300_000_000, 800_000_000, false),
            (400_000_000, 900_000_000, false),
            (400_000_001, 900_000_001, true),
        ] {
            let (bytes, _) = aggregate(
                &[1, 2, 3, 3],
                &[
                    r(1, 200_000_000, 0),
                    r(2, 300_000_000, 0),
                    r(3, provider_bytes, 0),
                ],
            )
            .unwrap();
            assert_eq!(bytes, expected);
            assert_eq!(bytes > RAM_BUDGET_BYTES, over);
        }
    }
    #[test]
    fn missing_denied_duplicate_or_zero_pid_cannot_be_green() {
        assert!(aggregate(&[1, 2], &[r(1, 1, 0)]).is_none());
        assert!(aggregate(&[1], &[r(1, 1, 0), r(1, 1, 0)]).is_none());
        assert!(aggregate(&[0], &[]).is_none());
    }
    #[test]
    fn cpu_is_monotonic_and_normalized_by_capacity() {
        let (_, a) = aggregate(&[1], &[r(1, 1, 10)]).unwrap();
        let (_, b) = aggregate(&[1], &[r(1, 1, 110)]).unwrap();
        assert_eq!(normalized_cpu(&a, &b, 100, 4), Some(25.));
        assert!(normalized_cpu(&b, &a, 100, 4).is_none());
        let mut reused = b.clone();
        let value = reused.remove(&Identity { pid: 1, created: 1 }).unwrap();
        reused.insert(Identity { pid: 1, created: 2 }, value);
        assert!(normalized_cpu(&a, &reused, 100, 4).is_none());
        assert!(normalized_cpu(&a, &BTreeMap::new(), 100, 4).is_none());
    }

    #[test]
    fn exited_owned_children_remain_in_job_cpu_without_resetting_provider_identity() {
        let none = BTreeMap::new();
        assert_eq!(
            normalized_with_job(100, 500, &none, &none, 1000, 4),
            Some(10.)
        );
        assert!(normalized_with_job(500, 100, &none, &none, 1000, 4).is_none());
    }
}
