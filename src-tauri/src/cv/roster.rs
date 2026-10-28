//! G-Sentry identity admission: portrait evidence is independent of minimap classification.
use super::identity::HeroId;

#[derive(Default)]
struct Slot {
    accepted: Option<HeroId>,
    candidate: Option<HeroId>,
    hits: u8,
    since: u64,
}

#[derive(Default)]
pub struct RosterVotes {
    slots: [Slot; 10],
    last_sample: Option<u64>,
}

impl RosterVotes {
    /// Unknown pixels (including dead portraits) do not erase identity. A
    /// conflicting positive read revokes it immediately until reconfirmed.
    pub fn observe(&mut self, samples: &[Option<String>], now: u64) -> Vec<Option<String>> {
        if samples.len() == 10
            && self
                .last_sample
                .is_none_or(|last| now.saturating_sub(last) >= 400)
        {
            let gap = self
                .last_sample
                .is_some_and(|last| now.saturating_sub(last) > 2500);
            self.last_sample = Some(now);
            for (slot, sample) in self.slots.iter_mut().zip(samples) {
                let Some(name) = sample.as_deref().and_then(HeroId::from_label) else {
                    slot.hits = 0;
                    slot.candidate = None;
                    continue;
                };
                if slot.accepted.is_some_and(|old| old != name) {
                    slot.accepted = None;
                }
                if gap || slot.candidate != Some(name) {
                    slot.candidate = Some(name);
                    slot.hits = 1;
                    slot.since = now;
                } else {
                    slot.hits = slot.hits.saturating_add(1);
                }
                if slot.hits >= 3 && now.saturating_sub(slot.since) >= 1500 {
                    slot.accepted = Some(name);
                }
            }
        }
        let mut names: Vec<_> = self
            .slots
            .iter()
            .map(|slot| slot.accepted.map(|id| id.label().to_string()))
            .collect();
        let duplicate: Vec<_> = names
            .iter()
            .flatten()
            .filter(|name| names.iter().flatten().filter(|other| other == name).count() > 1)
            .cloned()
            .collect();
        for name in &mut names {
            if name.as_ref().is_some_and(|name| duplicate.contains(name)) {
                *name = None;
            }
        }
        names
    }
}

/// Preserve slots, reject conflicts across both teams, and never fall back to
/// all classifier labels when team or roster is unknown.
pub fn enemy_labels(radiant: &[String], dire: &[String], team: u8) -> Vec<String> {
    if radiant.len() != 5 || dire.len() != 5 {
        return Vec::new();
    }
    let enemies = match team {
        1 => dire,
        2 => radiant,
        _ => return Vec::new(),
    };
    enemies
        .iter()
        .filter(|name| {
            HeroId::from_label(name).is_some()
                && radiant
                    .iter()
                    .chain(dire)
                    .filter(|other| *other == *name)
                    .count()
                    == 1
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn an_unregistered_portrait_name_never_becomes_a_match_identity() {
        let mut votes = RosterVotes::default();
        for now in [0, 1000, 2000, 3000] {
            assert_eq!(votes.observe(&sample("made_up_hero"), now)[5], None);
        }
        let own = vec![String::new(); 5];
        let enemy = ["made_up_hero", "", "", "", ""].map(str::to_string);
        assert!(enemy_labels(&own, &enemy, 1).is_empty());
    }
    fn sample(name: &str) -> Vec<Option<String>> {
        let mut values = vec![None; 10];
        values[5] = Some(name.into());
        values
    }
    #[test]
    fn requires_separate_sustained_portrait_frames() {
        let mut votes = RosterVotes::default();
        for _ in 0..10 {
            assert_eq!(votes.observe(&sample("axe"), 0)[5], None);
        }
        assert_eq!(votes.observe(&sample("axe"), 1000)[5], None);
        assert_eq!(
            votes.observe(&sample("axe"), 2000)[5].as_deref(),
            Some("axe")
        );
        assert_eq!(
            votes.observe(&vec![None; 10], 3000)[5].as_deref(),
            Some("axe")
        );
        assert_eq!(votes.observe(&sample("lina"), 4000)[5], None);
    }
    #[test]
    fn conflicting_slots_are_both_unknown() {
        let mut votes = RosterVotes::default();
        let mut values = sample("axe");
        values[0] = Some("axe".into());
        for now in [0, 1000, 2000] {
            assert!(votes.observe(&values, now).iter().all(Option::is_none));
        }
    }
    #[test]
    fn partial_roster_only_admits_unique_enemy_identities() {
        let own = ["crystal_maiden", "", "", "", ""].map(str::to_string);
        let enemy = ["axe", "crystal_maiden", "", "", ""].map(str::to_string);
        assert_eq!(enemy_labels(&own, &enemy, 1), vec!["axe"]);
        assert!(enemy_labels(&own, &enemy, 0).is_empty());
        assert!(enemy_labels(&[], &[], 1).is_empty());
    }
}
