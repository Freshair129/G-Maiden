# GID-Central Pipeline — Phase 2 (AnnStudio identity + authorGid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec deltas #5–#6 of `docs/superpowers/specs/2026-08-09-gid-central-pipeline-design.md` (as amended 2026-08-09): G-AnnStudio signs in with Google against gstore and shows the creator's GID, exported packs carry an optional `authorGid`, and G-Maiden reads and displays it without breaking any existing pack.

**Architecture:** AnnStudio (Tauri v2, repo `G:\G-Suite\packages\ann-studio`) gets a supabase-js PKCE sign-in whose OAuth callback lands on a one-shot Rust loopback listener at `127.0.0.1:3210/auth/callback`; the signed-in GID/display-name live in the zustand store and are stamped into the pack manifest by the existing install commands. G-Maiden (repo `G:\G-Maiden`) adds `author_gid: Option<String>` through `Manifest` → `VoicePack` and shows a read-only unverified chip in the Voice UI.

**Tech Stack:** Tauri v2 + Rust (both repos), supabase-js 2 (new dep in ann-studio frontend), React/zustand (AnnStudio), React (G-Maiden deck).

## Global Constraints

- `authorGid` is unsigned display metadata — never rendered as "verified", never used for any authorization. No GID typed input anywhere; the value comes only from the authenticated profile row.
- Sign-in is OPTIONAL and additive: every AnnStudio flow (import, map, export, install) must work signed-out exactly as today; signed-out packs simply omit `authorGid`.
- Backward compatibility is absolute: `author` stays a plain string in every schema/struct/manifest; packs WITHOUT `authorGid` must parse and function identically in G-Maiden (serde `default` + `skip_serializing_if`), and `update_pack` must not drop the field.
- `:3000/announcer/install` gains NO auth (stays low-trust per CLAUDE.md); the new `:3210` listener serves exactly one OAuth callback per explicit user click, is armed only after the click, and never logs the authorization code.
- gstore URL + publishable key are the same public constants the landing uses (`landing/src/beta.ts`); no service keys, no tokens on disk beyond what supabase-js already persists in webview localStorage.
- Commits: conventional, no tags, no `git add -A`; G-Suite commits in `G:\G-Suite`, G-Maiden commits in `G:\G-Maiden` — never mix repos in one commit.
- OPS (owner-gated, NOT a coding task): add `http://127.0.0.1:3210/auth/callback` to the gstore Supabase Auth redirect allowlist before sign-in can complete.

## File Structure

| Repo | File | Responsibility |
| --- | --- | --- |
| G-Suite | ~~`schemas/announcer-manifest.schema.json` (modify)~~ → `schemas/pack-manifest.schema.json` (create) | canonical schema: optional `authorGid` — see the Task 1 correction below |
| G-Suite | ~~`packages/ann-studio/src-tauri/src/announcer-manifest.schema.json` (modify)~~ | **does not exist** — no mirror copy in the repo |
| G-Suite | `packages/ann-studio/src-tauri/src/lib.rs` (modify) | `author_gid` in both install commands + `gid_oauth_listen` command |
| G-Suite | `packages/ann-studio/src/src/lib/gidAuth.ts` (create) | supabase client, sign-in/out, profile fetch |
| G-Suite | `packages/ann-studio/src/src/store/useStudioStore.ts` (modify) | `gidAuth` state slice |
| G-Suite | `packages/ann-studio/src/src/components/Header.tsx` (modify) | GID chip + sign-in/out button |
| G-Suite | `packages/ann-studio/src/src/lib/exportGmaidenPack.ts` (modify) | stamp `authorGid` + default author name from profile |
| G-Suite | `packages/ann-studio/src/package.json` (modify) | add `@supabase/supabase-js` |
| G-Maiden | `src-tauri/src/voice_api/pack_io.rs` (modify) | `Manifest.author_gid` + map into `VoicePack` |
| G-Maiden | `src-tauri/src/voice_api/types.rs` (modify) | `VoicePack.author_gid` |
| G-Maiden | `src-tauri/src/voice_api/tests.rs` (modify) | parse/preserve tests |
| G-Maiden | `src/src/AudioSettings.tsx` (modify) | read-only unverified chip |

---

### Task 1 (G-Suite): `authorGid` in schema + both install commands

> **CORRECTION (2026-08-09, after execution).** This task targeted the wrong schema file, and the
> `lib.rs` half was correct and is unaffected.
>
> - `schemas/announcer-manifest.schema.json` is **not** the install contract. It accurately describes
>   the flat sidecar `announcer-manifest.json` that the plain export (`export_all`) writes next to raw
>   WAVs — a file G-Maiden never reads. Only its `title`/`description` were wrong, claiming to be the
>   G-AnnStudio→G-Maiden contract. The `authorGid` added here by this task has been **removed**:
>   `export_all` never writes it.
> - The real contract — the installed `voice-cache/packs/<id>/manifest.json` written by
>   `install_gmaiden_pack`/`install_library_pack` and parsed by G-Maiden's `voice_api/pack_io.rs`
>   `Manifest` — had **no schema at all**. It now lives in `schemas/pack-manifest.schema.json`, with
>   `authorGid` optional (same pattern), grounded in `pack_io.rs` as source of truth.
> - `packages/ann-studio/src-tauri/src/announcer-manifest.schema.json` does not exist and never did;
>   there is no mirror copy. Ignore Step 1's two-file instruction and its validation command.
> - `pack-transfer.schema.json` is a design sketch for an unimplemented HTTP protocol, not this contract.

**Files:**
- Modify: `G:\G-Suite\schemas\announcer-manifest.schema.json`
- Modify: `G:\G-Suite\packages\ann-studio\src-tauri\src\announcer-manifest.schema.json`
- Modify: `G:\G-Suite\packages\ann-studio\src-tauri\src\lib.rs`

**Interfaces:**
- Produces: both Tauri commands `install_gmaiden_pack` / `install_library_pack` accept a new optional arg `authorGid` (JS camelCase → Rust `author_gid: Option<String>`); when it is `Some` and non-empty, the written `manifest.json` contains `"authorGid": "<value>"`; otherwise the key is absent. Task 3 passes the arg; Task 4 (G-Maiden) reads the key.

- [ ] **Step 1: Schema — add the property (both copies, identical edit)**

In each schema file, inside the top-level `properties` object (next to the existing `author` property), add:

```json
"authorGid": {
  "type": "string",
  "pattern": "^G-[FBP][23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,10}$",
  "description": "Optional GID of the creator (unsigned display metadata, not identity proof)"
}
```

Do NOT add it to any `required` array. Validate both files parse: `python -c "import json;json.load(open(r'G:\G-Suite\schemas\announcer-manifest.schema.json'));json.load(open(r'G:\G-Suite\packages\ann-studio\src-tauri\src\announcer-manifest.schema.json'))"`.

- [ ] **Step 2: lib.rs — accept and write the field**

In `install_gmaiden_pack` (≈line 822) and `install_library_pack` (≈line 988), add the parameter after `author: String`:

```rust
    #[allow(unused_variables)] author_gid: Option<String>,
```

(then remove the `#[allow]` once used below — Tauri v2 maps the JS arg `authorGid` to this snake_case param automatically). In BOTH manifest `json!` blocks (≈line 939 and ≈line 1067), after building the base manifest object, insert the key conditionally. Replace the direct `let manifest = json!({ ... });` with:

```rust
    let mut manifest = json!({
        "id": id,
        "name": pack_name,
        "version": "0.1.0",
        "locale": "th",
        "author": author,
        "description": "",
        "coverImage": cover,
        "mappings": Value::Object(mappings.clone()),
    });
    if let Some(gid) = author_gid.as_deref().filter(|g| !g.is_empty()) {
        manifest["authorGid"] = json!(gid);
    }
```

(keep each block's existing formatting/one-line style where it differs; the semantic change is identical in both commands).

- [ ] **Step 3: Verify**

Run from `G:\G-Suite\packages\ann-studio\src-tauri`: `cargo check`
Expected: clean (warnings unchanged).

- [ ] **Step 4: Commit (in G:\G-Suite)**

```bash
git -C /g/G-Suite add schemas/announcer-manifest.schema.json packages/ann-studio/src-tauri/src/announcer-manifest.schema.json packages/ann-studio/src-tauri/src/lib.rs
git -C /g/G-Suite commit -m "feat(ann-studio): optional authorGid stamped into exported pack manifests"
```

---

### Task 2 (G-Suite): Google PKCE sign-in with loopback callback

> **AS EXECUTED (G-Suite `59e1015`, corrected by `8cc8dd6`).** Landed, but Step 2's listener shipped
> with a bug **this plan introduced**, and two smaller details differed. Do not copy Step 2's snippet.
>
> - **Step 2's accept loop was wrong as written.** `for _ in 0..600` caps *connections*, not time,
>   despite the comment claiming "~180s worth of connections" — and `accept()` was blocking with no
>   timeout, so with no callback at all it blocked **forever** instead of giving up, while 600 quick
>   connections (favicon probes, preflights, any local scanner) could exhaust it in seconds. `8cc8dd6`
>   replaced it with a real deadline: `set_nonblocking(true)` (not the planned `false`), an
>   `Instant`-based 180s deadline checked each iteration, a 100ms sleep on `WouldBlock`, and a 2s
>   per-stream read timeout so one silent client cannot stall the loop.
> - **Opener plugin:** the app already ships `@tauri-apps/plugin-shell`, so `gidAuth.ts` uses its
>   `open`, not the `openUrl` from `@tauri-apps/plugin-opener` in Step 3's sample. Step 3's NOTE
>   anticipated exactly this; no Cargo or capability files were needed.
> - **Lockfile path:** Step 6 stages `packages/ann-studio/src/pnpm-lock.yaml`, which does not exist.
>   This is a pnpm workspace — the lockfile is the repo-root `pnpm-lock.yaml`, which is what the
>   commit actually staged.
>
> The PKCE reasoning in Step 2's doc comment still holds and is worth preserving on any future edit:
> the loopback authorization code is useless without the `code_verifier` held by supabase-js in the
> webview, so a rogue local request to `:3210` cannot hijack the session — it can only cause a failed
> exchange. The code is never logged.

**Files:**
- Create: `G:\G-Suite\packages\ann-studio\src\src\lib\gidAuth.ts`
- Modify: `G:\G-Suite\packages\ann-studio\src-tauri\src\lib.rs` (add `gid_oauth_listen` command + register it)
- Modify: `G:\G-Suite\packages\ann-studio\src\src\store\useStudioStore.ts` (state slice)
- Modify: `G:\G-Suite\packages\ann-studio\src\package.json` (dependency)

**Interfaces:**
- Consumes: gstore public constants (same as `G:\G-Maiden\landing\src\beta.ts`): URL `https://wsseitulmcgnolgsrxgh.supabase.co`, publishable key `sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ`.
- Produces (Task 3 consumes): store fields `gid: string`, `gidDisplayName: string`, `gidSignedIn: boolean`, `setGidAuth(p: { gid: string; displayName: string; signedIn: boolean }): void`; functions `signInWithGoogle(): Promise<string | null>` (returns error message or null), `signOutGid(): Promise<void>`, `restoreGidSession(): Promise<void>`.

- [ ] **Step 1: Add the dependency**

In `G:\G-Suite\packages\ann-studio\src\package.json` dependencies add `"@supabase/supabase-js": "2.110.7"` (same version as the landing), then run `pnpm -C /g/G-Suite/packages/ann-studio/src install`.

- [ ] **Step 2: Rust one-shot loopback listener**

Add to `G:\G-Suite\packages\ann-studio\src-tauri\src\lib.rs` (near the other commands) and register `gid_oauth_listen` in the `invoke_handler` list:

```rust
/// One-shot OAuth loopback: listens on 127.0.0.1:3210 for a single
/// GET /auth/callback?... request, replies with a tiny "return to app" page,
/// and returns the raw query string. Armed only when the user clicks sign-in;
/// the PKCE code is useless without the code_verifier held by supabase-js in
/// the webview, so a rogue local request cannot hijack the session. The
/// authorization code is never logged.
#[tauri::command]
async fn gid_oauth_listen() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:3210")
            .map_err(|e| format!("bind 127.0.0.1:3210: {e}"))?;
        listener
            .set_nonblocking(false)
            .map_err(|e| format!("listener mode: {e}"))?;
        // accept until we see the callback path or ~180s worth of connections
        for _ in 0..600 {
            let (mut stream, _) = listener.accept().map_err(|e| format!("accept: {e}"))?;
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let head = String::from_utf8_lossy(&buf[..n]).to_string();
            let first = head.lines().next().unwrap_or("");
            if let Some(path) = first.split_whitespace().nth(1) {
                if let Some(q) = path.strip_prefix("/auth/callback?") {
                    let body = "<html><body style=\"font-family:sans-serif;background:#0b0d12;color:#dfe7ff;display:grid;place-items:center;height:100vh\"><div>เข้าสู่ระบบสำเร็จ — กลับไปที่ G-AnnStudio ได้เลย</div></body></html>";
                    let _ = stream.write_all(
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                            body.len(), body
                        )
                        .as_bytes(),
                    );
                    return Ok(q.to_string());
                }
            }
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        }
        Err("no callback received".to_string())
    })
    .await
    .map_err(|e| format!("listener task: {e}"))?
}
```

- [ ] **Step 3: `gidAuth.ts`**

Create `G:\G-Suite\packages\ann-studio\src\src\lib\gidAuth.ts`:

```ts
// Optional Google sign-in against the shared gstore project (GID hub,
// SPEC-2026-08-09 §4). Signing in only fills authorGid/display-name for
// exported packs — every authoring flow works signed-out.
import { createClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStudioStore } from "../store/useStudioStore";

const GSTORE_URL = "https://wsseitulmcgnolgsrxgh.supabase.co";
const GSTORE_PUBLISHABLE_KEY = "sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ";
const OAUTH_REDIRECT = "http://127.0.0.1:3210/auth/callback";

export const gidSupabase = createClient(GSTORE_URL, GSTORE_PUBLISHABLE_KEY, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

async function loadProfileIntoStore(): Promise<void> {
  const { data: { user } } = await gidSupabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await gidSupabase
    .from("profiles")
    .select("gid_code, display_name")
    .eq("id", user.id)
    .maybeSingle<{ gid_code: string | null; display_name: string | null }>();
  useStudioStore.getState().setGidAuth({
    gid: profile?.gid_code ?? "",
    displayName: profile?.display_name ?? user.user_metadata?.full_name ?? "",
    signedIn: true,
  });
}

/** Restore a persisted session on app start (no network prompt). */
export async function restoreGidSession(): Promise<void> {
  const { data: { session } } = await gidSupabase.auth.getSession();
  if (session?.user) await loadProfileIntoStore();
}

/** Returns an error message, or null on success. */
export async function signInWithGoogle(): Promise<string | null> {
  try {
    const { data, error } = await gidSupabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error || !data?.url) return error?.message ?? "เริ่ม OAuth ไม่สำเร็จ";
    const listen = invoke<string>("gid_oauth_listen"); // arm listener BEFORE opening the browser
    await openUrl(data.url);
    const query = await listen;
    const code = new URLSearchParams(query).get("code");
    if (!code) return "callback ไม่มี authorization code";
    const { error: xErr } = await gidSupabase.auth.exchangeCodeForSession(code);
    if (xErr) return xErr.message;
    await loadProfileIntoStore();
    return null;
  } catch (e) {
    return (e as { message?: string })?.message ?? String(e);
  }
}

export async function signOutGid(): Promise<void> {
  await gidSupabase.auth.signOut();
  useStudioStore.getState().setGidAuth({ gid: "", displayName: "", signedIn: false });
}
```

NOTE for the implementer: check `G:\G-Suite\packages\ann-studio\src\package.json` / `src-tauri\Cargo.toml` for the opener plugin (`@tauri-apps/plugin-opener` / `tauri-plugin-opener`). If the app uses the older `@tauri-apps/plugin-shell` `open` instead, use that import; if neither is present, add `tauri-plugin-opener` (Rust + JS + capability permission) — pick whichever the app already ships to keep the diff minimal. Also confirm the `profiles` column for display name (`display_name`) by checking `G:\G-Maiden\src\src\profile.ts`; if the column differs, match it.

- [ ] **Step 4: Store slice**

In `useStudioStore.ts` add to the store state (match the file's existing slice style):

```ts
  gid: "",
  gidDisplayName: "",
  gidSignedIn: false,
  setGidAuth: (p: { gid: string; displayName: string; signedIn: boolean }) =>
    set({ gid: p.gid, gidDisplayName: p.displayName, gidSignedIn: p.signedIn }),
```

(and the corresponding fields in the store's TypeScript interface).

- [ ] **Step 5: Verify**

`pnpm -C /g/G-Suite/packages/ann-studio/src build` (tsc + vite) — clean. `cargo check` in `src-tauri` — clean.

- [ ] **Step 6: Commit (in G:\G-Suite)**

```bash
git -C /g/G-Suite add packages/ann-studio/src/package.json packages/ann-studio/src/pnpm-lock.yaml packages/ann-studio/src/src/lib/gidAuth.ts packages/ann-studio/src/src/store/useStudioStore.ts packages/ann-studio/src-tauri/src/lib.rs
git -C /g/G-Suite commit -m "feat(ann-studio): optional Google sign-in resolving the shared GID (gstore PKCE + loopback callback)"
```

(If the opener plugin had to be added, include its Cargo/capability files in the same commit.)

---

### Task 3 (G-Suite): Header chip + stamp on export

> **AS EXECUTED (G-Suite `7d11064`).** Landed as written; no corrections. Recorded here only to name
> the contract it writes against, which Task 1 originally mis-identified.
>
> This is the **producer** side of the installed-pack manifest (`voice-cache/packs/<id>/manifest.json`),
> now documented in `G-Suite/schemas/pack-manifest.schema.json` (added in `ea017fd`) — *not*
> `announcer-manifest.schema.json`, which describes the plain-export sidecar. See the Task 1 correction.
> Step 1's `undefined`-when-signed-out is what makes the key vanish entirely rather than serialize as
> `null`: `Option<String>` on the Rust side plus the installers' `.filter(|g| !g.is_empty())` guard.

**Files:**
- Modify: `G:\G-Suite\packages\ann-studio\src\src\components\Header.tsx`
- Modify: `G:\G-Suite\packages\ann-studio\src\src\lib\exportGmaidenPack.ts`
- Modify: `G:\G-Suite\packages\ann-studio\src\src\App.tsx` (call `restoreGidSession()` once on mount)

**Interfaces:**
- Consumes: Task 2's store fields + functions; Task 1's `authorGid` invoke arg.

- [ ] **Step 1: Stamp on export (no call-site churn)**

In `exportGmaidenPack.ts`, in BOTH `installGmaidenPack` and `installLibraryPack`, after `const s = useStudioStore.getState();` add:

```ts
  const authorGid = s.gidSignedIn && s.gid ? s.gid : undefined;
  const authorName = author || (s.gidSignedIn ? s.gidDisplayName : "");
```

then in each `invoke(...)` payload replace `author,` with `author: authorName,` and add `authorGid,` alongside it. Existing call sites keep passing `""` and are not modified.

- [ ] **Step 2: Header chip**

In `Header.tsx` add a compact right-side control following the component's existing styling patterns: when `gidSignedIn` show `GID {gid}` as a muted chip with a "ออกจากระบบ" action calling `signOutGid()`; when signed out show a "เชื่อม GID" button that calls `signInWithGoogle()` and surfaces a returned error string via the app's existing toast/alert style. Chip is display-only text — no input.

- [ ] **Step 3: Restore session on start**

In `App.tsx`, inside a `useEffect(() => { ... }, [])` on the root component, call `void restoreGidSession()`.

- [ ] **Step 4: Verify**

`pnpm -C /g/G-Suite/packages/ann-studio/src build` clean. Manual smoke if a display is available: `pnpm -C /g/G-Suite/packages/ann-studio dev`, confirm signed-out UI unchanged apart from the chip, and clicking sign-in opens the browser (completing sign-in requires the OPS allowlist entry — if not yet added, verify the flow reaches Google and note it).

- [ ] **Step 5: Commit (in G:\G-Suite)**

```bash
git -C /g/G-Suite add packages/ann-studio/src/src/components/Header.tsx packages/ann-studio/src/src/lib/exportGmaidenPack.ts packages/ann-studio/src/src/App.tsx
git -C /g/G-Suite commit -m "feat(ann-studio): GID chip in header and authorGid stamped on pack export"
```

---

### Task 4 (G-Maiden): read `authorGid` through Manifest → VoicePack + tests

> **AS EXECUTED (G-Maiden `847616e1`).** Landed as written; no corrections. Two things worth carrying
> forward, learned while writing the schema:
>
> - `pack_io.rs` `Manifest` is the **source of truth** for the pack-manifest contract —
>   `G-Suite/schemas/pack-manifest.schema.json` (`ea017fd`) was derived from this struct, so a change
>   here is a contract change and the schema must follow. This task is the **consumer** side; Task 3
>   is the producer.
> - Validating the schema against real on-disk packs surfaced two invariants this parser implies:
>   `mappings` may legitimately be `{}` (G-Maiden's own `create_template`/`create_pack_skeleton`
>   writes an empty-mappings skeleton, so *do not* assume a pack always has mappings), and all five
>   `ManifestMapping` keys are required — it declares no serde defaults, so one missing key fails the
>   parse of the **entire manifest**, not just that entry.

**Files:**
- Modify: `G:\G-Maiden\src-tauri\src\voice_api\pack_io.rs`
- Modify: `G:\G-Maiden\src-tauri\src\voice_api\types.rs`
- Test: `G:\G-Maiden\src-tauri\src\voice_api\tests.rs`

**Interfaces:**
- Produces (Task 5 consumes): `VoicePack` serializes an optional camelCase `authorGid` field to the frontend.

- [ ] **Step 1: Write the failing tests**

Add to `voice_api/tests.rs` (follow the file's existing test-fixture helpers for creating a temp pack dir + manifest; adapt names to the helpers that exist):

```rust
#[test]
fn manifest_author_gid_roundtrip() {
    // with the field
    let with: super::pack_io::Manifest = serde_json::from_str(
        r#"{"id":"p1","name":"n","version":"1","locale":"th","author":"a",
            "description":"","mappings":{},"authorGid":"G-F43KRAKGE"}"#,
    )
    .unwrap();
    assert_eq!(with.author_gid.as_deref(), Some("G-F43KRAKGE"));
    let out = serde_json::to_string(&with).unwrap();
    assert!(out.contains("\"authorGid\":\"G-F43KRAKGE\""));

    // without the field: parses, and does NOT serialize a null/empty key
    let without: super::pack_io::Manifest = serde_json::from_str(
        r#"{"id":"p2","name":"n","version":"1","locale":"th","author":"a",
            "description":"","mappings":{}}"#,
    )
    .unwrap();
    assert_eq!(without.author_gid, None);
    let out2 = serde_json::to_string(&without).unwrap();
    assert!(!out2.contains("authorGid"));
}
```

(If `Manifest` is not visible to tests.rs under `super::pack_io::`, adjust visibility the same way the existing tests reach other pack_io items.)

- [ ] **Step 2: Run to verify failure**

From `G:\G-Maiden\src-tauri`: `cargo test voice_api` — the new test fails to compile (no `author_gid` field). That counts as the red step.

- [ ] **Step 3: Implement**

`pack_io.rs` `Manifest` struct (line ≈28, after `author`):

```rust
    /// Optional creator GID (SPEC-2026-08-09 §4). Unsigned display metadata —
    /// never identity proof. Absent for packs made before Phase 2.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) author_gid: Option<String>,
```

`types.rs` `VoicePack` (after `author`):

```rust
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) author_gid: Option<String>,
```

`pack_io.rs` `build_pack` mapping (≈line 164, next to `author: manifest.author,`): add `author_gid: manifest.author_gid.clone(),` (place before `author` is moved, or reorder). The built-in default pack construction (≈line 253) gets `author_gid: None,`. Fix any other `VoicePack { .. }` constructor the compiler flags with `author_gid: None`. `update_pack` (`commands.rs` ≈272) needs NO change — it mutates named fields on the deserialized `Manifest`, so `author_gid` persists automatically; confirm the write path serializes the whole struct (pack_io.rs ≈62).

- [ ] **Step 4: Run to verify pass**

`cargo test voice_api` — all existing voice_api tests plus the new one pass.

- [ ] **Step 5: Commit (in G:\G-Maiden)**

```bash
git add src-tauri/src/voice_api/pack_io.rs src-tauri/src/voice_api/types.rs src-tauri/src/voice_api/tests.rs
git commit -m "feat(voice): read optional authorGid from pack manifests (backward compatible)"
```

---

### Task 5 (G-Maiden): unverified creator chip in Voice UI

> **AS EXECUTED (G-Maiden `b2f8b4c4`).** Shipped and working, with one deviation worth recording:
> `authorGid` went onto the **shared** `VoicePack` type in `src/src/voice-types.ts`, not onto a "local
> pack type/interface" inside `AudioSettings.tsx` as Step 1 assumed — no such local type exists. The
> Files list and Step 3's `git add` were therefore both one file short; the commit correctly staged
> `AudioSettings.tsx`, `styles.css` **and** `voice-types.ts`.
>
> Line hints drifted: the chip renders at `AudioSettings.tsx:481`, not ≈290. `.voice-author-gid` lives
> in `styles.css` and uses `--g-r-pill`, satisfying R3 (COLD BOOTH `--g-*` tokens only).
>
> It consumes Task 4's serialization and stays display-only — not editable, excluded from `update_pack`
> payloads, and explicitly not identity proof. That framing is load-bearing, not cosmetic: the value
> is copied verbatim out of a `manifest.json` that ships inside an importable `.zip`, so it is
> attacker-controlled (see `pack-manifest.schema.json`). Nothing may key trust or entitlement off it
> until cryptographic pack signing lands with the cloud registry.

**Files:**
- Modify: `G:\G-Maiden\src\src\AudioSettings.tsx`

**Interfaces:**
- Consumes: `selectedPack.authorGid?: string` from Task 4's serialization.

- [ ] **Step 1: Extend the pack type + render the chip**

In `AudioSettings.tsx`: add `authorGid?: string` to the local pack type/interface that already carries `author` (find it via the existing `selectedPack?.author` usage ≈line 325). Where the pack's author is displayed (near the `packAuthor` field, ≈line 290), render after it, display-only:

```tsx
{selectedPack?.authorGid ? (
  <span className="voice-author-gid" title="GID ที่ผู้ทำระบุไว้ในไฟล์ pack — ไม่ใช่การยืนยันตัวตน">
    by {selectedPack.authorGid} · ไม่ยืนยัน
  </span>
) : null}
```

Style `voice-author-gid` with the deck's existing muted-chip pattern (COLD BOOTH `--g-*` tokens only, per R3). No input, not editable, and `update_pack` payloads are unchanged.

- [ ] **Step 2: Verify**

From `G:\G-Maiden\src`: `npx tsc --noEmit` — clean.

- [ ] **Step 3: Commit (in G:\G-Maiden)**

```bash
git add src/src/AudioSettings.tsx src/src/styles.css
git commit -m "feat(voice): show unverified creator GID chip on packs that carry authorGid"
```

(Include `styles.css` only if the chip class was added there; if styled inline/module, stage that file instead.)

---

## Ops checklist (owner-gated — NOT part of coding tasks)

1. Supabase dashboard (gstore) → Auth → Redirect URLs: add `http://127.0.0.1:3210/auth/callback`. Sign-in cannot complete without it.
2. End-to-end UAT once allowlisted: sign in inside AnnStudio → chip shows the same GID as G-Maiden/landing → export a pack → `manifest.json` contains `authorGid` → G-Maiden Voice UI shows the chip; a pre-Phase-2 pack still loads with no chip.
3. Push both repos when Boss says (G-Suite and G-Maiden separately).
4. Future (unchanged from spec): cryptographic pack signing arrives only with the cloud pack registry; `authorGid` stays display-only until then.
