import { assertEquals } from "jsr:@std/assert@1";
import {
  decideGmadEntitlement,
  isGoogleIdentity,
  shouldAutoGrant,
  resolveDownloadChannel,
  deriveTermsState,
  type DistributionPolicy,
  type DownloadChannel,
  type TermsState,
} from "./entitlement.ts";

const currentTerms = {
  document_id: "closed-beta-terms-of-use",
  version: "1.0.0-beta",
  document_sha256: "a".repeat(64),
  effective_at: "2026-07-21T16:05:06Z",
};

Deno.test("entitlement fails closed when the authenticated UUID has no GID", () => {
  assertEquals(decideGmadEntitlement({ gid: null, currentTerms, receipt: null, activeGrant: false }), {
    state: "account_not_eligible",
  });
});

Deno.test("entitlement requires the exact current Terms version and hash", () => {
  assertEquals(decideGmadEntitlement({
    gid: "G-F234567",
    currentTerms,
    receipt: { document_id: currentTerms.document_id, document_version: "0.9.0-beta", document_sha256: currentTerms.document_sha256 },
    activeGrant: true,
  }), {
    state: "terms_required",
    gid: "G-F234567",
    terms: currentTerms,
  });
});

Deno.test("entitlement rejects an absent, paused, or revoked grant", () => {
  assertEquals(decideGmadEntitlement({
    gid: "G-F234567",
    currentTerms,
    receipt: { document_id: currentTerms.document_id, document_version: currentTerms.version, document_sha256: currentTerms.document_sha256 },
    activeGrant: false,
  }).state, "no_active_entitlement");
});

Deno.test("entitlement succeeds only for server-derived GID, current receipt, and active grant", () => {
  assertEquals(decideGmadEntitlement({
    gid: "G-F234567",
    currentTerms,
    receipt: { document_id: currentTerms.document_id, document_version: currentTerms.version, document_sha256: currentTerms.document_sha256 },
    activeGrant: true,
  }), {
    state: "eligible",
    gid: "G-F234567",
    terms: currentTerms,
  });
});

Deno.test("GMAD access accepts Google identities and rejects email-only identities", () => {
  assertEquals(isGoogleIdentity({ app_metadata: { provider: "google", providers: ["google"] } }), true);
  assertEquals(isGoogleIdentity({ app_metadata: { provider: "email", providers: ["email"] } }), false);
  assertEquals(isGoogleIdentity(null), false);
});

Deno.test("shouldAutoGrant: only when enabled + batch id set + batch published", () => {
  const on = { open_beta_enabled: true, open_beta_batch_id: "b1", github_release_url: null };
  assertEquals(shouldAutoGrant(on, "published"), true);
  assertEquals(shouldAutoGrant(on, "paused"), false);
  assertEquals(shouldAutoGrant(on, null), false);
  assertEquals(shouldAutoGrant({ ...on, open_beta_batch_id: null }, "published"), false);
  assertEquals(shouldAutoGrant({ ...on, open_beta_enabled: false }, "published"), false);
  assertEquals(shouldAutoGrant(null, "published"), false);
});

Deno.test("resolveDownloadChannel: github only for the open-beta batch with a URL", () => {
  const url = "https://github.com/Freshair129/G-Maiden/releases/latest";
  const policy = { open_beta_enabled: true, open_beta_batch_id: "b1", github_release_url: url };
  assertEquals(resolveDownloadChannel(policy, "b1"), { channel: "github", download_url: url });
  assertEquals(resolveDownloadChannel(policy, "b2"), { channel: "gated" });
  assertEquals(resolveDownloadChannel({ ...policy, github_release_url: null }, "b1"), { channel: "gated" });
  assertEquals(resolveDownloadChannel({ ...policy, open_beta_enabled: false }, "b1"), { channel: "gated" });
  assertEquals(resolveDownloadChannel(null, "b1"), { channel: "gated" });
});

Deno.test("deriveTermsState: accepted / required / outdated / unavailable", () => {
  const current = { document_id: "t", version: "1.0.0", document_sha256: "a".repeat(64), effective_at: "2026-01-01T00:00:00Z" };
  const match = { document_id: "t", document_version: "1.0.0", document_sha256: "a".repeat(64) };
  assertEquals(deriveTermsState(current, match), "accepted");
  assertEquals(deriveTermsState(current, null), "required");
  assertEquals(deriveTermsState(current, { ...match, document_version: "0.9.0" }), "outdated");
  assertEquals(deriveTermsState(current, { ...match, document_sha256: "b".repeat(64) }), "outdated");
  assertEquals(deriveTermsState(null, match), "unavailable");
});
