// Doc: SEC-001 §2 Phase B step 1 — tests written BEFORE the IO wiring (TDD).
// Run: deno test supabase/functions/mint-gid/mint.test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { decideMint } from "./mint.ts";

Deno.test("noop when gid_code already present (idempotent second call)", () => {
  const r = decideMint({ gid_code: "G-F43KRAKGE", generation: "F", cohort_seq: 1, created_at: "2026-07-02T00:00:00Z" });
  assertEquals(r, { action: "noop", gid_code: "G-F43KRAKGE" });
});

Deno.test("mints a G-F… GID from valid Founder source", () => {
  const r = decideMint({ gid_code: null, generation: "F", cohort_seq: 1, created_at: "2026-07-02T00:00:00Z" });
  assertEquals(r.action, "mint");
  if (r.action === "mint") assertStringIncludes(r.gid_code, "G-F");
});

Deno.test("deterministic — same source yields same GID", () => {
  const src = { gid_code: null, generation: "F", cohort_seq: 42, created_at: "2026-07-02T00:00:00Z" };
  assertEquals(decideMint({ ...src }), decideMint({ ...src }));
});

Deno.test("error when cohort_seq missing", () => {
  const r = decideMint({ gid_code: null, generation: "F", cohort_seq: null, created_at: "2026-07-02T00:00:00Z" });
  assertEquals(r.action, "error");
});

Deno.test("error on unknown generation", () => {
  const r = decideMint({ gid_code: null, generation: "Z", cohort_seq: 1, created_at: "2026-07-02T00:00:00Z" });
  assertEquals(r.action, "error");
});

Deno.test("error when created_at missing", () => {
  const r = decideMint({ gid_code: null, generation: "F", cohort_seq: 1, created_at: null });
  assertEquals(r.action, "error");
});
