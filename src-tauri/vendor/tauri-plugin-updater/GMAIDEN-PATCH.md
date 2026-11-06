# G-Maiden updater patch

Vendored tauri-plugin-updater 2.10.1 (Apache-2.0 OR MIT), from the locally resolved Cargo registry source.

Upstream VCS: {"git": {"sha1": "d6a3898001a4bcc659e045f9501498751b77dbe6"}, "path_in_vcs": "plugins/updater"}

Only behavioral patch: Windows `Update::install_guarded` runs a fallible host guard after extraction and immediately before exit cleanup / ShellExecuteW. Download and minisign verification stay upstream. Raw updater JS permissions are removed; G-Maiden uses its guarded Rust command.

Pure guard regression includes a match starting during preparation. No test invokes a real installer. Remove this fork when upstream exposes an equivalent cancellable pre-commit hook.

Original file SHA-256:
- `src/lib.rs`: `dd914a66c150f3bb6f5e8e8bbdc46b1ded00bda351279ecfe1e55491ff429351`
- `src/updater.rs`: `d754b8887ad79c5155e4186e758529b320f4a404cbe5c32247e62f33e1fe5a05`
- `Cargo.toml`: `8f8e401f030dab5e5155eeabca65afe6ac1fa0a8f3e1a0114bdd4a66601e948a`
