import { assertEquals } from "jsr:@std/assert@1";
import { decideGmadEntitlement, isGoogleIdentity } from "./entitlement.ts";

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
