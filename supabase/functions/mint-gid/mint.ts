// Doc: SEC-001 §2 Phase B step 1 (feature--ef-mint-gid) — pure mint decision.
// Separated from IO so it is unit-testable without a DB/HTTP mock.
import { generateGid, GENERATIONS, type Generation } from "../_shared/gid.ts";

export interface MintProfile {
  gid_code: string | null;
  generation: string | null;
  cohort_seq: number | null;
  created_at: string | null;
}

export type MintResult =
  | { action: "noop"; gid_code: string }        // already minted — return existing
  | { action: "mint"; gid_code: string }        // freshly computed, caller persists
  | { action: "error"; reason: string };        // profile not ready to mint

/** Decide the GID for a profile. Pure: never touches the DB. */
export function decideMint(p: MintProfile): MintResult {
  if (p.gid_code) return { action: "noop", gid_code: p.gid_code };
  const gen = p.generation;
  if (!gen || !(gen in GENERATIONS)) return { action: "error", reason: "bad or missing generation" };
  if (!p.cohort_seq) return { action: "error", reason: "missing cohort_seq" };
  if (!p.created_at) return { action: "error", reason: "missing created_at" };
  try {
    const gid_code = generateGid({
      generation: gen as Generation,
      registeredAt: new Date(p.created_at),
      cohortSeq: p.cohort_seq,
    });
    return { action: "mint", gid_code };
  } catch (e) {
    return { action: "error", reason: String((e as Error)?.message ?? e) };
  }
}
