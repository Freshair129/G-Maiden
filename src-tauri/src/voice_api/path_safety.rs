//! Path-traversal hardening for manifest-relative asset paths. Split out of
//! the original `voice_api.rs` monolith (facade refactor, no behavior
//! change). `safe_pack_path` is cited by name in CLAUDE.md and an RCA doc —
//! keep the fn name + doc comments intact.

use std::fs;
use std::path::{Component, Path, PathBuf};

/// Safely resolve a manifest-relative asset path — a `clips[]` entry,
/// `bannerAsset`, or `coverImage` — against `pack_dir`.
///
/// `manifest.json` is attacker-influenced: it ships inside imported `.zip`
/// packs, and `POST /announcer/install` on the unauthenticated `:3000` GSI
/// server can auto-activate any pack already on disk. Joining a raw manifest
/// string onto a directory with no validation is a path-traversal /
/// arbitrary-local-file primitive — the resolved path gets **played**
/// (`audio::play_file`) or **base64-inlined onto the Tauri event bus**
/// (`fired_banner` -> `announcer-banner`, and the pack inventory's cover /
/// clip tiles), so this one helper is the single choke point every call site
/// below must go through.
///
/// Returns `None` for anything unsafe; the caller treats that exactly like a
/// missing clip (skips the entry — the existing missing/fallback handling
/// covers it, nothing new to plumb through). Returns `Some(path)` only when
/// the path is safe AND currently resolves to a regular file:
///
/// - Rejects (before touching the filesystem) any relative string whose
///   *parsed* `Path::components()` contain a `Prefix` (drive letter `C:\`,
///   UNC `\\server\share`, verbatim `\\?\`), a `RootDir` (leading `/` or
///   `\`), or a `ParentDir` (`..`) anywhere. Checked on both the raw string
///   and the `\`->`/`-normalized form (matching the existing normalization
///   convention used elsewhere in this file), so this is structural —
///   immune to separator-mixing tricks — not a substring match. Zero
///   syscalls.
/// - A path that clears the structural check but doesn't exist as a file
///   (missing, or resolves to a directory) also returns `None` — same
///   "missing" bucket, no special-case needed by callers.
/// - Only when the target DOES exist as a file do we pay for
///   `fs::canonicalize` on both `pack_dir` and the candidate and require the
///   candidate's canonical form to sit inside the canonical pack dir. This
///   is what catches a symlink planted inside the pack whose target escapes
///   it — the structural component check alone can't see through a symlink.
///   This is the only extra cost versus the pre-fix code path (which was a
///   single `is_file()` stat): one stat (unchanged) + two canonicalize calls,
///   paid only for entries that actually exist.
///
/// Rejections are logged once via `eprintln!` with the pack id (from
/// `pack_dir`'s file name) and the *relative* string only — never an
/// absolute path. `:3000` has no auth, so error/log detail must not leak the
/// install directory (same precedent as `gsi.rs run_announcer_install`).
pub(crate) fn safe_pack_path(pack_dir: &Path, rel: &str) -> Option<PathBuf> {
    safe_pack_path_canon(pack_dir, None, rel)
}

/// Like [`safe_pack_path`] but accepts a pre-canonicalized `pack_dir`, so a
/// caller resolving many clips at once (the G-Signal gank path via
/// [`resolve_existing_clips`], which has a ≤300ms budget) pays the pack-dir
/// `canonicalize` once per call instead of once per clip. `None` = canonicalize
/// it here (single-shot callers).
pub(crate) fn safe_pack_path_canon(
    pack_dir: &Path,
    canon_dir: Option<&Path>,
    rel: &str,
) -> Option<PathBuf> {
    let normalized = rel.replace('\\', "/");
    if has_unsafe_component(rel) || has_unsafe_component(&normalized) {
        eprintln!(
            "[G-Maiden] voice pack '{}': rejected unsafe manifest path '{normalized}'",
            pack_id_for_log(pack_dir)
        );
        return None;
    }
    if normalized.trim().is_empty() {
        return None;
    }

    let candidate = pack_dir.join(&normalized);
    match fs::metadata(&candidate) {
        Ok(meta) if meta.is_file() => {
            // Resolve the containment base once (reuse the caller's if given).
            let canon_dir_owned;
            let base = match canon_dir {
                Some(d) => d,
                None => match fs::canonicalize(pack_dir) {
                    Ok(d) => {
                        canon_dir_owned = d;
                        canon_dir_owned.as_path()
                    }
                    // canonicalize erroring on a dir we're serving from is
                    // exotic (a race); fail closed rather than trust it.
                    Err(_) => return None,
                },
            };
            match fs::canonicalize(&candidate) {
                Ok(canon_candidate) if canon_candidate.starts_with(base) => Some(candidate),
                Ok(_) => {
                    eprintln!(
                        "[G-Maiden] voice pack '{}': rejected symlink escape at '{normalized}'",
                        pack_id_for_log(pack_dir)
                    );
                    None
                }
                Err(_) => None,
            }
        }
        // Exists but isn't a regular file (a directory, e.g. an empty/`.`
        // manifest entry), or doesn't exist at all — either way, "missing".
        _ => None,
    }
}

/// Structural traversal/absolute-path check shared by both the raw and
/// normalized forms of a manifest string in [`safe_pack_path`]. Operates on
/// parsed `Path::components()`, not substring matching, so it's immune to
/// `foo/../bar` tricks and mixed `/`/`\` separators.
pub(crate) fn has_unsafe_component(s: &str) -> bool {
    Path::new(s).components().any(|c| {
        matches!(
            c,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

pub(crate) fn pack_id_for_log(pack_dir: &Path) -> String {
    pack_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "?".to_string())
}

/// Resolve a manifest mapping's `clips` (paths relative to the pack dir) to
/// absolute paths, keeping only the ones that are safe AND actually exist on
/// disk. Shared by live playback (`active_event_clips`) and `install_report`
/// below so both always agree on what counts as "this event has a clip".
pub(crate) fn resolve_existing_clips(dir: &Path, clips: &[String]) -> Vec<PathBuf> {
    // Canonicalize the pack dir once for the whole clip list — this runs on the
    // ≤300ms gank path, so we don't repeat it per clip (gate WARN 2026-07-10).
    let canon_dir = fs::canonicalize(dir).ok();
    clips
        .iter()
        .filter_map(|rel| safe_pack_path_canon(dir, canon_dir.as_deref(), rel))
        .collect()
}
