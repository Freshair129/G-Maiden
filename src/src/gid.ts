// GID — Global Identity for the G-series ecosystem (G-Maiden, G-Suite, G-Link,
// G-Market, …). Human-facing, permanent, immutable. The internal key stays the
// Supabase UUID; the GID is the memorable, brandable handle users recognize.
//
// Format:  G-[Generation][Payload][Checksum]
//   G-           literal prefix, exactly one hyphen right after G
//   Generation   one char cohort marker (permanent): F Founder · B Close Beta · P Public
//   Payload      base31 of (registration-day, cohort-sequence) — 5..8 chars, padded to 5
//   Checksum     1 char, weighted mod-31 over Generation+Payload — catches typos/transposes
//
// Examples: G-F7M2X8K  (Founder)   G-P9L4QT2  (Public)
//
// Design goals: deterministic + reproducible from source data, globally unique,
// stable forever, and optimized for human recognition — NOT cryptographic density.

// Unambiguous uppercase alphabet: 36 minus 0 1 O I L → 31 symbols (base 31).
export const GID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE = 31n;

// Cohort generations (permanent — represents the user's original entry cohort).
export const GENERATIONS = { F: "Founder", B: "Close Beta", P: "Public" } as const;
export type Generation = keyof typeof GENERATIONS;

// Ecosystem launch epoch; registration day = whole UTC days since this.
const EPOCH_MS = Date.UTC(2026, 0, 1); // 2026-01-01
const MS_PER_DAY = 86_400_000;

// Max registrations per generation before the payload structure needs revision.
// Guarantees uniqueness: payload = day*CAP + seq, so distinct (day, seq) never
// collide while seq < CAP. 10M is ample for Founder/Beta and years of Public.
const COHORT_CAP = 10_000_000n;

const MIN_PAYLOAD = 5; // pad short payloads for a consistent, premium look

export interface GidSource {
  generation: Generation;
  /** Registration instant — Date or epoch ms. Only the UTC day is encoded. */
  registeredAt: Date | number;
  /** 1-based sequential registration number within the generation cohort. */
  cohortSeq: number;
}

export interface ParsedGid {
  gid: string;
  generation: Generation;
  generationName: string;
  /** UTC midnight of the registration day decoded from the payload. */
  registeredAt: Date;
  registrationDay: number;
  cohortSeq: number;
  /** Checksum verification result. */
  valid: boolean;
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

function decodeBase31(s: string): bigint {
  let n = 0n;
  for (const ch of s) {
    const idx = GID_ALPHABET.indexOf(ch);
    if (idx < 0) throw new RangeError(`invalid GID character: ${ch}`);
    n = n * BASE + BigInt(idx);
  }
  return n;
}

/** Weighted mod-31 checksum over the Generation+Payload body → one char.
 *  Position weights make it sensitive to single substitutions and adjacent
 *  transpositions (a typo-detection aid, not a security mechanism). */
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

/** Deterministically build the GID string from source data. Same inputs always
 *  yield the same GID — this is how any G-app reproduces a user's identity. */
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

const GID_RE = new RegExp(`^G-([FBP])([${GID_ALPHABET}]{${MIN_PAYLOAD},})([${GID_ALPHABET}])$`);

/** Parse a GID into its components; returns null if it isn't structurally a GID.
 *  The returned `valid` reflects the checksum (structure can be fine yet mistyped). */
export function parseGid(raw: string): ParsedGid | null {
  if (typeof raw !== "string") return null;
  const gid = raw.trim().toUpperCase();
  const m = GID_RE.exec(gid);
  if (!m) return null;
  const generation = m[1] as Generation;
  const payload = m[2];
  const checksum = m[3];
  const valid = checksumChar(generation + payload) === checksum;
  const payloadNum = decodeBase31(payload);
  const cohortSeq = Number(payloadNum % COHORT_CAP);
  const registrationDay = Number(payloadNum / COHORT_CAP);
  return {
    gid,
    generation,
    generationName: GENERATIONS[generation],
    registeredAt: new Date(EPOCH_MS + registrationDay * MS_PER_DAY),
    registrationDay,
    cohortSeq,
    valid,
  };
}

/** True iff `raw` is a structurally valid GID with a matching checksum. */
export function validateGid(raw: string): boolean {
  const parsed = parseGid(raw);
  return parsed !== null && parsed.valid;
}
