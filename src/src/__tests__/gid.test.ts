import { describe, test, expect } from "vitest";
import {
  generateGid,
  parseGid,
  validateGid,
  GID_ALPHABET,
  GENERATIONS,
  type Generation,
} from "../gid";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);
const d = (days: number) => new Date(EPOCH + days * DAY);

describe("format", () => {
  test("prefix, single hyphen, uppercase alphabet only", () => {
    const gid = generateGid({ generation: "F", registeredAt: d(200), cohortSeq: 42 });
    expect(gid.startsWith("G-")).toBe(true);
    expect(gid.split("-").length).toBe(2);
    const body = gid.slice(2);
    for (const ch of body) expect(GID_ALPHABET.includes(ch)).toBe(true);
  });

  test("generation marker is the first char after the hyphen (Founder identifiable)", () => {
    expect(generateGid({ generation: "F", registeredAt: d(1), cohortSeq: 1 })[2]).toBe("F");
    expect(generateGid({ generation: "B", registeredAt: d(1), cohortSeq: 1 })[2]).toBe("B");
    expect(generateGid({ generation: "P", registeredAt: d(1), cohortSeq: 1 })[2]).toBe("P");
  });

  test("total length is within 8..12 for realistic data", () => {
    for (const seq of [1, 100, 9999, 5_000_000]) {
      for (const day of [0, 200, 3650, 36500]) {
        const gid = generateGid({ generation: "P", registeredAt: d(day), cohortSeq: seq });
        expect(gid.length).toBeGreaterThanOrEqual(8);
        expect(gid.length).toBeLessThanOrEqual(12);
      }
    }
  });

  test("payload padded to a minimum of 5 chars", () => {
    // gen(1) + payload(>=5) + checksum(1) => body >= 7 => gid >= 9
    const gid = generateGid({ generation: "F", registeredAt: d(0), cohortSeq: 1 });
    expect(gid.slice(2).length).toBeGreaterThanOrEqual(7);
  });
});

describe("round-trip parse", () => {
  test("recovers generation, day, and cohort sequence", () => {
    const cases: Array<[Generation, number, number]> = [
      ["F", 0, 1],
      ["F", 30, 7],
      ["B", 200, 1234],
      ["P", 3650, 999_999],
      ["P", 36500, 5_000_000],
    ];
    for (const [generation, day, cohortSeq] of cases) {
      const gid = generateGid({ generation, registeredAt: d(day), cohortSeq });
      const p = parseGid(gid);
      expect(p).not.toBeNull();
      expect(p!.generation).toBe(generation);
      expect(p!.generationName).toBe(GENERATIONS[generation]);
      expect(p!.cohortSeq).toBe(cohortSeq);
      expect(p!.registrationDay).toBe(day);
      expect(p!.registeredAt.getTime()).toBe(EPOCH + day * DAY);
      expect(p!.valid).toBe(true);
    }
  });

  test("accepts lowercase and surrounding whitespace", () => {
    const gid = generateGid({ generation: "F", registeredAt: d(12), cohortSeq: 88 });
    const p = parseGid(`  ${gid.toLowerCase()}  `);
    expect(p).not.toBeNull();
    expect(p!.cohortSeq).toBe(88);
    expect(p!.valid).toBe(true);
  });
});

describe("determinism", () => {
  test("same source always yields the same GID", () => {
    const src = { generation: "F" as const, registeredAt: d(365), cohortSeq: 501 };
    expect(generateGid(src)).toBe(generateGid({ ...src }));
    // stable regardless of time-of-day within the same UTC day
    const morning = generateGid({ generation: "F", registeredAt: EPOCH + 365 * DAY + 1000, cohortSeq: 501 });
    const evening = generateGid({ generation: "F", registeredAt: EPOCH + 365 * DAY + 80_000_000, cohortSeq: 501 });
    expect(morning).toBe(evening);
  });
});

describe("uniqueness", () => {
  test("distinct (generation, day, seq) never collide", () => {
    const seen = new Set<string>();
    let count = 0;
    for (const generation of ["F", "B", "P"] as Generation[]) {
      for (let day = 0; day < 40; day += 3) {
        for (let seq = 1; seq <= 400; seq += 7) {
          seen.add(generateGid({ generation, registeredAt: d(day), cohortSeq: seq }));
          count++;
        }
      }
    }
    expect(seen.size).toBe(count);
  });

  test("same day+seq but different generation are different GIDs", () => {
    const f = generateGid({ generation: "F", registeredAt: d(10), cohortSeq: 5 });
    const b = generateGid({ generation: "B", registeredAt: d(10), cohortSeq: 5 });
    const p = generateGid({ generation: "P", registeredAt: d(10), cohortSeq: 5 });
    expect(new Set([f, b, p]).size).toBe(3);
  });
});

describe("checksum / validation", () => {
  const base = generateGid({ generation: "P", registeredAt: d(500), cohortSeq: 4242 });

  test("valid GID passes", () => {
    expect(validateGid(base)).toBe(true);
  });

  test("single-character substitution is caught", () => {
    // flip the char at index 3 (inside the payload) to a different alphabet char
    const chars = base.split("");
    const i = 4;
    const cur = chars[i];
    const repl = GID_ALPHABET[(GID_ALPHABET.indexOf(cur) + 1) % GID_ALPHABET.length];
    chars[i] = repl;
    const mutated = chars.join("");
    expect(mutated).not.toBe(base);
    expect(validateGid(mutated)).toBe(false);
  });

  test("adjacent transposition is caught", () => {
    // find two adjacent, differing chars in the body (after "G-") and swap them
    const body = base.slice(2);
    let swapped: string | null = null;
    for (let i = 0; i < body.length - 2; i++) {
      if (body[i] !== body[i + 1]) {
        const arr = body.split("");
        [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        swapped = "G-" + arr.join("");
        break;
      }
    }
    expect(swapped).not.toBeNull();
    expect(swapped).not.toBe(base);
    expect(validateGid(swapped!)).toBe(false);
  });
});

describe("rejects malformed input", () => {
  test("missing prefix / wrong prefix", () => {
    expect(parseGid("F7M2X8K")).toBeNull();
    expect(parseGid("X-F7M2X8K")).toBeNull();
    expect(parseGid("GF7M2X8K")).toBeNull(); // no hyphen
    expect(validateGid("")).toBe(false);
  });

  test("unknown generation letter", () => {
    expect(parseGid("G-Z34567A")).toBeNull(); // Z is not F/B/P
  });

  test("ambiguous characters are not part of the alphabet", () => {
    for (const bad of ["0", "1", "O", "I", "L"]) {
      expect(GID_ALPHABET.includes(bad)).toBe(false);
    }
    // a GID-looking string containing an ambiguous char fails to parse
    expect(parseGid("G-F0M2X8K")).toBeNull(); // contains 0
    expect(parseGid("G-FIM2X8K")).toBeNull(); // contains I
  });

  test("too-short payload", () => {
    expect(parseGid("G-F2A")).toBeNull(); // payload < 5
  });
});

describe("generate guards", () => {
  test("rejects unknown generation", () => {
    // @ts-expect-error intentionally bad generation
    expect(() => generateGid({ generation: "X", registeredAt: d(1), cohortSeq: 1 })).toThrow();
  });
  test("rejects non-positive / non-integer sequence", () => {
    expect(() => generateGid({ generation: "F", registeredAt: d(1), cohortSeq: 0 })).toThrow();
    expect(() => generateGid({ generation: "F", registeredAt: d(1), cohortSeq: -5 })).toThrow();
    expect(() => generateGid({ generation: "F", registeredAt: d(1), cohortSeq: 1.5 })).toThrow();
  });
  test("rejects registration before the epoch", () => {
    expect(() => generateGid({ generation: "F", registeredAt: EPOCH - DAY, cohortSeq: 1 })).toThrow();
  });
  test("rejects sequence at/over cohort capacity", () => {
    expect(() => generateGid({ generation: "P", registeredAt: d(1), cohortSeq: 10_000_000 })).toThrow();
    expect(validateGid(generateGid({ generation: "P", registeredAt: d(1), cohortSeq: 9_999_999 }))).toBe(true);
  });
});
