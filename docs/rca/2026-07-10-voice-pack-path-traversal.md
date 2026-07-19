# RCA — voice-pack manifest path traversal + archive zip-slip

- **Symptom:** [`src-tauri/src/voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api/mod.rs) joined three attacker-influenced
  `manifest.json` strings (`clips[]`, `bannerAsset`, `coverImage`) straight
  onto the pack directory with no containment check before either playing
  the result ([`audio::play_file`](file:///g:/G-Maiden/src-tauri/src/audio.rs#L145), via [`active_event_clips`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L124) /
  [`resolve_existing_clips`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L16)) or reading it into a base64 `data:` URL and
  broadcasting it on the Tauri event bus to the overlay renderer
  ([`fired_banner`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L47) → `announcer-banner`, and the pack-inventory cover/clip
  tiles built by [`build_pack`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L53), which runs on every [`state()`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L1) call — i.e.
  merely opening Audio Settings, not only on a fired event). Separately,
  [`voice_api::import_archive`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L139) shelled out to PowerShell `Expand-Archive` with
  no app-level validation of entry paths, so zip-slip safety depended
  entirely on the .NET implementation.
- **Evidence:**
  - [`resolve_existing_clips`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L16) (pre-fix): `clips.iter().map(|rel| dir.join(rel.replace('\\','/'))).filter(|p| p.is_file())`
    — a manifest `clips[]` entry of `../../../../Windows/System32/config/SAM`
    resolves and, if it happened to be a playable extension check elsewhere
    were bypassed, would be handed to [`audio::play_file`](file:///g:/G-Maiden/src-tauri/src/audio.rs#L145).
  - [`fired_banner_from`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L48) (pre-fix): `dir.join(mapping.banner_asset.replace('\\','/'))` fed
    directly into [`read_banner_data_url`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L80), which reads up to 3MB and
    base64-inlines it — no existence/containment check before the read.
  - [`build_pack`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L53)'s `manifest.cover_image` resolution had the identical
    unguarded join, and is reachable just by listing packs ([`state()`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L1)),
    confirmed by tracing [`voice_api::state()`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L1) → [`build_pack()`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L53) →
    [`read_banner_data_url()`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L80) with no caller-side gate.
  - This became reachable from the unauthenticated `:3000` GSI server the
    moment `POST /announcer/install` ([`gsi.rs::announcer_install`](file:///g:/G-Maiden/src-tauri/src/gsi.rs#L268), commit
    `b75944cd`) started auto-activating an existing pack — any local process
    (no auth) can now flip which pack's manifest is "active" and therefore
    which manifest strings get resolved on the hot path.
  - Full test suite added in this fix ([`src-tauri/src/voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api/mod.rs) `mod
    tests`) exercises all of the above directly: `..` traversal, absolute
    paths (`C:\...`, `/etc/passwd`), UNC/`\\?\` prefixes, a live symlink
    escape (created and rejected in this dev environment — Developer Mode was
    on, so `std::os::windows::fs::symlink_file` succeeded), a well-formed
    nested path (no false positive), and three [`extract_pack_zip`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L160) tests
    (traversal entry, absolute-path entry, clean archive) — all pass under
    `cargo test`; `cargo clippy --all-targets -- -D warnings` is clean.
- **Root Cause:** the codebase had one existing, well-tested sanitizer
  ([`sanitize_id`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L15), applied to `pack_id` and to *upload* file names via
  [`sanitize_file_name`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L13)) but no equivalent guard for strings that arrive
  through `manifest.json` content itself. The manifest was implicitly
  trusted as "our own file format" even though it ships inside user-imported
  `.zip` packs and, as of `b75944cd`, can be auto-activated by an
  unauthenticated local POST — the trust boundary moved (import + remote
  auto-activate) without the validation boundary moving with it.
- **Why it escaped detection:** `cargo test`/`cargo clippy` (the project's
  actual CI gate — this repo runs no `cargo test` in CI, only clippy) don't
  exercise adversarial manifest content, and there was no fuzzing or
  security-focused test for [`voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L3). The independent full-system audit
  ([[2026-07-07-independent-full-audit]] / `docs/audits/2026-07-07-independent-full-audit.md`) flagged this
  specifically as the top pre-marketplace security fix, naming all three
  fields (`clips[]`, `bannerAsset`, `coverImage`) and noting the read path is
  reachable just by opening Audio Settings ([`build_pack`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L53)/[`state()`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L1)), not only
  on a fired event — this RCA and fix directly close that finding.
- **Prevention:** one shared, unit-tested helper,
  [`voice_api::safe_pack_path(pack_dir: &Path, rel: &str) -> Option<PathBuf>`](file:///g:/G-Maiden/src-tauri/src/voice_api/path_safety.rs#L51),
  is now the single choke point for every manifest-derived path join in
  [`voice_api.rs`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L3) ([`resolve_existing_clips`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L16)/[`active_event_clips`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L124),
  [`fired_banner_from`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L48), [`preview_clip`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L100), [`install_report`](file:///g:/G-Maiden/src-tauri/src/voice_api/banner.rs#L128), and [`build_pack`](file:///g:/G-Maiden/src-tauri/src/voice_api/commands.rs#L53)'s
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
