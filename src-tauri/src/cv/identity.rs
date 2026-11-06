//! Stable Valve identity; ONNX output indices are never hero IDs.
use std::sync::LazyLock;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(transparent)]
pub struct HeroId(u32);

#[derive(serde::Deserialize)]
struct Hero {
    id: HeroId,
    label: String,
}

static HEROES: LazyLock<Vec<Hero>> = LazyLock::new(|| {
    #[derive(serde::Deserialize)]
    struct Catalog {
        heroes: Vec<Hero>,
    }
    serde_json::from_str::<Catalog>(include_str!("../../data/hero-identities.json"))
        .expect("bundled Valve identity catalog must be valid")
        .heroes
});

impl HeroId {
    pub fn from_label(label: &str) -> Option<Self> {
        HEROES
            .iter()
            .find(|hero| hero.label == label)
            .map(|hero| hero.id)
    }

    pub fn label(self) -> &'static str {
        HEROES
            .iter()
            .find(|hero| hero.id == self)
            .map_or("", |hero| hero.label.as_str())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn valve_ids_are_unique_and_not_classifier_indices() {
        let mut ids = std::collections::HashSet::new();
        let mut labels = std::collections::HashSet::new();
        for hero in HEROES.iter() {
            assert!(hero.id.0 > 0 && ids.insert(hero.id));
            assert!(labels.insert(&hero.label));
            assert_eq!(hero.id.label(), hero.label);
        }
        assert_eq!(HeroId::from_label("axe"), Some(HeroId(2)));
        assert_eq!(HeroId::from_label("crystal_maiden"), Some(HeroId(5)));
        assert_eq!(HeroId::from_label("__negative__"), None);
        assert_eq!(HeroId::from_label("CM"), None);
    }
}
