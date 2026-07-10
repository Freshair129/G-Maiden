# RCA — voice-pack manifest path traversal + archive zip-slip

- **Symptom:** `src-tauri/src/voice_api.rs` joined three attacker-influenced
  `manifest.json` strings (`clips[]`, `bannerAsset`, `coverImage`) straight
  onto the pack directory with no containment check before either playing
  the result (`audio::play_file`, via `active_event_clips` /
  `resolve_existing_clips`) or reading it into a base64 `data:` URL and
  broadcasting it on the Tauri event bus to the overlay renderer
  (`fired_banner` → `announcer-banner`, and the pack-inventory cover/clip
  tiles built by `build_pack`, which runs on every `state()` call — i.e.
  merely opening Audio Settings, not only on a fired event). Separately,
  `voice_api::import_archive` shelled out to PowerShell `Expand-Archive` with
  no app-level validation of entry paths, so zip-slip safety depended
  entirely on the .NET implementation.
- **Evidence:**
  - `resolve_existing_clips` (pre-fix): `clips.iter().map(|rel| dir.join(rel.replace('\\','/'))).filter(|p| p.is_file())`
    — a manifest `clips[]` entry of `../../../../Windows/System32/config/SAM`
    resolves and, if it happened to be a playable extension check elsewhere
    were bypassed, would be handed to `audio::play_file`.
  - `fired_banner_from` (pre-fix): `dir.join(mapping.banner_asset.replace('\\','/'))` fed
    directly into `read_banner_data_url`, which reads up to 3MB and
    base64-inlines it — no existence/containment check before the read.
  - `build_pack`'s `manifest.cover_image` resolution had the identical
    unguarded join, and is reachable just by listing packs (`state()`),
    confirmed by tracing `voice_api::state()` → `build_pack()` →
    `read_banner_data_url()` with no caller-side gate.
  - This became reachable from the unauthenticated `:3000` GSI server the
    moment `POST /announcer/install` (`gsi.rs::announcer_install`, commit
    `b75944cd`) started auto-activating an existing pack — any local process
    (no auth) can now flip which pack's manifest is "active" and therefore
    which manifest strings get resolved on the hot path.
  - Full test suite added in this fix (`src-tauri/src/voice_api.rs` `mod
    tests`) exercises all of the above directly: `..` traversal, absolute
    paths (`C:\...`, `/etc/passwd`), UNC/`\\?\` prefixes, a live symlink
    escape (created and rejected in this dev environment — Developer Mode was
    on, so `std::os::windows::fs::symlink_file` succeeded), a well-formed
    nested path (no false positive), and three `extract_pack_zip` tests
    (traversal entry, absolute-path entry, clean archive) — all pass under
    `cargo test`; `cargo clippy --all-targets -- -D warnings` is clean.
- **Root Cause:** the codebase had one existing, well-tested sanitizer
  (`sanitize_id`, applied to `pack_id` and to *upload* file names via
  `sanitize_file_name`) but no equivalent guard for strings that arrive
  through `manifest.json` content itself. The manifest was implicitly
  trusted as "our own file format" even though it ships inside user-imported
  `.zip` packs and, as of `b75944cd`, can be auto-activated by an
  unauthenticated local POST — the trust boundary moved (import + remote
  auto-activate) without the validation boundary moving with it.
- **Why it escaped detection:** `cargo test`/`cargo clippy` (the project's
  actual CI gate — this repo runs no `cargo test` in CI, only clippy) don't
  exercise adversarial manifest content, and there was no fuzzing or
  security-focused test for `voice_api.rs`. The independent full-system audit
  (`docs/audits/2026-07-07-independent-full-audit.md`) flagged this
  specifically as the top pre-marketplace security fix, naming all three
  fields (`clips[]`, `bannerAsset`, `coverImage`) and noting the read path is
  reachable just by opening Audio Settings (`build_pack`/`state()`), not only
  on a fired event — this RCA and fix directly close that finding.
- **Prevention:** one shared, unit-tested helper,
  `voice_api::safe_pack_path(pack_dir: &Path, rel: &str) -> Option<PathBuf>`,
  is now the single choke point for every manifest-derived path join in
  `voice_api.rs` (`resolve_existing_clips`/`active_event_clips`,
  `fired_banner_from`, `preview_clip`, `install_report`, and `build_pack`'s
  `cover_image`/`clip_options`/`banner_url`). It rejects absolute/drive/
  UNC/verbatim paths and any `..` component via parsed `Path::components()`
  (structural, not substring matching) with zero syscalls, and only pays for
  `fs::canonicalize` + containment check when the target file actually
  exists (catching symlink escapes). Archive import now extracts in-process
  via the `zip` crate (already transitive via `tauri-plugin-updater`,
  `default-features = false, features = ["deflate"]`), validating every
  entry's `ZipFile::enclosed_name()` + `is_symlink()` in a full pass before
  writing anything, so a malicious archive is refused wholesale rather than
  partially extracted. Any future manifest-derived (or archive-entry-derived)
  path join must go through one of these two helpers — reviewers should treat
  a bare `dir.join(<manifest field>)` in this file as a rejected pattern.
