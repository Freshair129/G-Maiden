// Doc: ADR-14 §4 · SEC-001 §2 Phase B — SYNCED COPY of src/src/gid.ts for Deno
// Edge Functions (they can't reach across the repo into src/). Source of truth is
// src/src/gid.ts; this file must stay byte-identical below the header. A guard
// (guard--gid-copy-sync / trace-lint) diffs them in CI so the GID algorithm is
// never forked — honoring ADR-14's "single-sourced codec, no duplication" rule.
// ---------------------------------------------------------------------------
// GID — Global Identity for the G-series ecosystem. Format: G-[Generation][Payload][Checksum].

export const GID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE = 31n;

export const GENERATIONS = { F: "Founder", B: "Close Beta", P: "Public" } as const;
export type Generation = keyof typeof GENERATIONS;

const EPOCH_MS = Date.UTC(2026, 0, 1); // 2026-01-01
const MS_PER_DAY = 86_400_000;
const COHORT_CAP = 10_000_000n;
const MIN_PAYLOAD = 5;

export interface GidSource {
  generation: Generation;
  registeredAt: Date | number;
  cohortSeq: number;
}

function encodeBase31(n: bigint): string {
  if (n < 0n) throw new RangeError("GID payload must be non-negative");
  if (n === 0n) return GID_ALPHABET[0];
  let out = "";
  let v = n;
  while (v > 0n) {
    out = GID_ALPHABET[Number(v % BASE)] + out;
    v /= BASE;
  }
  return out;
}

function checksumChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const val = GID_ALPHABET.indexOf(body[i]);
    if (val < 0) throw new RangeError(`invalid GID character: ${body[i]}`);
    sum += (i + 1) * val;
  }
  return GID_ALPHABET[((sum % 31) + 31) % 31];
}

function dayOf(registeredAt: Date | number): number {
  const ms = typeof registeredAt === "number" ? registeredAt : registeredAt.getTime();
  const day = Math.floor((ms - EPOCH_MS) / MS_PER_DAY);
  if (day < 0) throw new RangeError("registeredAt is before the ecosystem epoch");
  return day;
}

/** Deterministically build the GID string from source data. Same as src/src/gid.ts. */
export function generateGid(source: GidSource): string {
  const { generation, registeredAt, cohortSeq } = source;
  if (!(generation in GENERATIONS)) throw new RangeError(`unknown generation: ${generation}`);
  if (!Number.isInteger(cohortSeq) || cohortSeq < 1) {
    throw new RangeError("cohortSeq must be a positive integer (1-based)");
  }
  if (BigInt(cohortSeq) >= COHORT_CAP) {
    throw new RangeError(`cohortSeq exceeds cohort capacity (${COHORT_CAP})`);
  }
  const day = dayOf(registeredAt);
  const payloadNum = BigInt(day) * COHORT_CAP + BigInt(cohortSeq);
  const payload = encodeBase31(payloadNum).padStart(MIN_PAYLOAD, GID_ALPHABET[0]);
  const body = generation + payload;
  return `G-${body}${checksumChar(body)}`;
}
