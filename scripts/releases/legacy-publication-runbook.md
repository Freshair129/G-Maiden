# Publishing the legacy updater endpoint

G-Maiden 0.13.0 reads GitHub's `releases/latest/download/latest.json`; it does not read the channel manifest. The `publish-legacy-stable` workflow makes an already-approved candidate release available there after the stable manifest has been merged on `main`. It does not build, sign, or upload artifacts.

Before dispatch, complete the candidate and installed-update acceptance checks, merge the approved stable manifest, and establish an owner-coordinated release freeze: do not merge another stable manifest, retarget or delete the candidate tag, or edit any release assets until the publication checks finish. The Actions concurrency group serializes the promotion and legacy-publication jobs, but cannot prevent a person or unrelated workflow from making those changes.

Run the workflow from `main` with `dry_run=true` first. The production environment approval is required. It compares the approved stable manifest, release tag and candidate `latest.json`, downloads and hashes every artifact, verifies every platform signature with the same public-key algorithm as the packaged updater, checks the candidate and supported legacy keys, and rechecks the remote tag and `main`. A dry run does not edit the release.

After the owner accepts the release-freeze procedure and the remaining acceptance evidence, dispatch from the same `main` with `dry_run=false` and obtain production approval. The workflow rechecks immediately before publication and reads back the public legacy endpoint, release status, tag, `main`, downloaded artifact hashes, and signatures afterward.

These operations span GitHub Git and Releases APIs and are **not atomic**. A concurrent external change may become visible before a post-publication check detects it. If any post-publication check fails, stop other publication actions, notify the release owner, investigate the live endpoint and follow the approved rollback process; do not assume that the release stayed private or that an automatic rollback occurred. A successful check is not a substitute for a real installed updater test.
