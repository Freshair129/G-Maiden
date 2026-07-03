import { describe, it, expect } from "vitest";
import { buildHistory, type MatchLog } from "../buildHistory";
import { MOCK } from "../../companion";

const fallback = MOCK.history;

const logs: MatchLog[] = [
  { name: "match-1720000000.jsonl", size: 1024 * 42, modified_ms: 1720000000000 },
  { name: "match-1719990000.jsonl", size: 900, modified_ms: 1719990000000 }
];

describe("buildHistory", () => {
  it("logs=null returns MOCK unchanged", () => {
    expect(buildHistory(null, fallback)).toBe(fallback);
  });

  it("empty list returns MOCK unchanged", () => {
    expect(buildHistory([], fallback)).toBe(fallback);
  });

  it("maps real files: size in KB, filename as id, honest labels", () => {
    const rows = buildHistory(logs, fallback);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe("match-1720000000.jsonl");
    expect(rows[0].kda).toBe("42 KB");
    expect(rows[0].result).toBe("Recorded");
    // sub-1KB file still shows at least 1 KB
    expect(rows[1].kda).toBe("1 KB");
  });

  it("caps at 12 rows", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `match-${i}.jsonl`,
      size: 1000,
      modified_ms: 1720000000000 + i
    }));
    expect(buildHistory(many, fallback)).toHaveLength(12);
  });
});
