import { afterEach, describe, it, expect, vi } from "vitest";
import { buildHistory, type MatchLog } from "../buildHistory";
import { MOCK } from "../../companion";

const fallback = MOCK.history;

const logs: MatchLog[] = [
  { name: "match-1720000000.jsonl", size: 1024 * 42, modified_ms: 1720000000000 },
  { name: "match-1719990000.jsonl", size: 900, modified_ms: 1719990000000 }
];

const displayOptions: Intl.DateTimeFormatOptions = {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
};

function trackFormatCalls(locale?: () => string) {
  const NativeFormatter = Intl.DateTimeFormat;
  const calls = vi.fn();
  const constructor = vi.spyOn(Intl, "DateTimeFormat").mockImplementation((...args) => {
    const formatter = new NativeFormatter(locale?.() ?? args[0], args[1]);
    const nativeFormat = formatter.format;
    Object.defineProperty(formatter, "format", {
      value: (date?: Date | number) => { calls(date); return nativeFormat(date); }
    });
    return formatter;
  });
  return { calls, constructor };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

  it("reuses one formatter across rows and unchanged resource publication pulses", async () => {
    vi.resetModules();
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    const legacyFormat = vi.spyOn(Date.prototype, "toLocaleString");
    const { buildHistory: build } = await import("../buildHistory");
    const many = Array.from({ length: 12 }, (_, i) => ({ ...logs[0], name: `match-${i}`, modified_ms: logs[0].modified_ms + i * 86400000 }));
    for (let pulse = 0; pulse < 10; pulse++) expect(build(many, fallback)).toHaveLength(12);
    expect(legacyFormat.mock.calls.length).toBe(0);
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it("formats each semantic label once across ten unchanged resource-like pulses with legacy row parity", async () => {
    vi.resetModules();
    const { calls, constructor } = trackFormatCalls();
    const { buildHistory: build } = await import("../buildHistory");
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...logs[0], name: `match-${i}`, modified_ms: logs[0].modified_ms + i * 86400000
    }));
    const expected = many.map((log) => ({
      id: log.name, result: "Recorded", hero: new Date(log.modified_ms).toLocaleString([], displayOptions),
      kda: "42 KB", note: "Local match log — replay to tune predictions (no win/loss stored)."
    }));
    for (let pulse = 0; pulse < 10; pulse++) {
      expect(build(many.map((log) => ({ ...log })), fallback)).toEqual(expected);
    }
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledTimes(12);
  });

  it("reuses displayed minutes while reflecting changed files, sizes and new civil fields", async () => {
    vi.resetModules();
    const { calls } = trackFormatCalls();
    const { buildHistory: build } = await import("../buildHistory");
    const modified_ms = Date.parse("2024-07-03T12:00:01.000Z");
    const first = { ...logs[0], modified_ms };
    const initial = build([first], fallback)[0];
    const changed = { name: "fresh-file", size: 1024 * 99, modified_ms: modified_ms + 1_234 };
    const fresh = build([changed], fallback)[0];
    expect(fresh).toEqual({ ...initial, id: "fresh-file", kda: "99 KB" });
    expect(calls).toHaveBeenCalledTimes(1);
    for (const timestamp of [modified_ms + 60_000, Date.parse("0000-07-03T12:00:01Z"), Date.parse("0042-07-03T12:00:01Z"), Date.parse("-000001-07-03T12:00:01Z")]) {
      expect(build([{ ...changed, modified_ms: timestamp }], fallback)[0].hero)
        .toBe(new Date(timestamp).toLocaleString([], displayOptions));
    }
    expect(calls).toHaveBeenCalledTimes(5);
  });

  it("retains at most 64 inserted semantic labels and recomputes evicted labels", async () => {
    vi.resetModules();
    const { calls } = trackFormatCalls();
    const { buildHistory: build } = await import("../buildHistory");
    const entries = Array.from({ length: 65 }, (_, i) => ({
      ...logs[0], modified_ms: logs[0].modified_ms + i * 86400000
    }));
    for (const entry of entries) {
      expect(build([entry], fallback)[0].hero).toBe(new Date(entry.modified_ms).toLocaleString([], displayOptions));
    }
    expect(calls).toHaveBeenCalledTimes(65);
    build([entries[64]], fallback);
    expect(calls).toHaveBeenCalledTimes(65);
    expect(build([entries[0]], fallback)[0].hero).toBe(new Date(entries[0].modified_ms).toLocaleString([], displayOptions));
    expect(calls).toHaveBeenCalledTimes(66);
    build([entries[1]], fallback);
    expect(calls).toHaveBeenCalledTimes(67);
  });

  it("discards semantic labels with a changed language environment", async () => {
    vi.resetModules();
    let locale = "en-US";
    const { calls, constructor } = trackFormatCalls(() => locale);
    const { buildHistory: build } = await import("../buildHistory");
    for (locale of ["en-US", "th-TH", "en-US"]) {
      vi.stubGlobal("navigator", { language: locale, languages: [locale] });
      const expected = new Date(logs[0].modified_ms).toLocaleString(locale, displayOptions);
      for (let pulse = 0; pulse < 3; pulse++) expect(build([logs[0]], fallback)[0].hero).toBe(expected);
    }
    expect(constructor).toHaveBeenCalledTimes(3);
    expect(calls).toHaveBeenCalledTimes(3);
  });

  it("uses current local civil fields across DST folds, gaps and timezone date boundaries", async () => {
    vi.resetModules();
    const steps = [
      ["2024-11-03T05:30:00Z", "America/New_York"],
      ["2024-11-03T06:30:00Z", "America/New_York"],
      ["2024-03-10T06:59:00Z", "America/New_York"],
      ["2024-03-10T07:00:00Z", "America/New_York"],
      ["2024-01-01T23:30:00Z", "UTC"],
      ["2024-01-01T23:30:00Z", "Asia/Tokyo"],
      ["2024-01-01T23:30:00Z", "Pacific/Honolulu"],
      ["2024-01-01T23:30:00Z", "UTC"]
    ].map(([iso, timeZone]) => {
      const timestamp = Date.parse(iso);
      const original = new Date(timestamp);
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(original);
      const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === name)?.value);
      return { timestamp, year: part("year"), month: part("month") - 1, day: part("day"), hour: part("hour"), minute: part("minute"), expected: original.toLocaleString([], { ...displayOptions, timeZone }) };
    });
    let environment = steps[0];
    vi.spyOn(Date.prototype, "getFullYear").mockImplementation(() => environment.year);
    vi.spyOn(Date.prototype, "getMonth").mockImplementation(() => environment.month);
    vi.spyOn(Date.prototype, "getDate").mockImplementation(() => environment.day);
    vi.spyOn(Date.prototype, "getHours").mockImplementation(() => environment.hour);
    vi.spyOn(Date.prototype, "getMinutes").mockImplementation(() => environment.minute);
    const { calls, constructor } = trackFormatCalls();
    const { buildHistory: build } = await import("../buildHistory");
    for (environment of steps) {
      expect(build([{ ...logs[0], modified_ms: environment.timestamp }], fallback)[0].hero).toBe(environment.expected);
    }
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(calls).toHaveBeenCalledTimes(6);
  });

  it("keeps invalid and out-of-range civil projections on the uncached native fallback", async () => {
    vi.resetModules();
    const timestamps = [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number];
    const expected = timestamps.map((timestamp) => new Date(timestamp).toLocaleString([], displayOptions));
    const extreme = 8640000000000000;
    const extremeExpected = new Date(extreme).toLocaleString([], displayOptions);
    const legacy = vi.spyOn(Date.prototype, "toLocaleString");
    const { calls } = trackFormatCalls();
    const { buildHistory: build } = await import("../buildHistory");
    for (let pulse = 0; pulse < 2; pulse++) {
      expect(build(timestamps.map((modified_ms) => ({ ...logs[0], modified_ms })), fallback).map((row) => row.hero)).toEqual(expected);
    }
    // Date's finite maximum can project out of range under changed local fields.
    vi.spyOn(Date.prototype, "getFullYear").mockReturnValue(275760);
    vi.spyOn(Date.prototype, "getMonth").mockReturnValue(8);
    vi.spyOn(Date.prototype, "getDate").mockReturnValue(13);
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(23);
    vi.spyOn(Date.prototype, "getMinutes").mockReturnValue(59);
    for (let pulse = 0; pulse < 2; pulse++) expect(build([{ ...logs[0], modified_ms: extreme }], fallback)[0].hero).toBe(extremeExpected);
    expect(calls).not.toHaveBeenCalled();
    expect(legacy).toHaveBeenCalledTimes(8);
  });

  it("preserves native local formatting for historical, transition, year0-99 and extreme timestamps", async () => {
    vi.resetModules();
    const timestamps = [
      Date.parse("2024-03-10T06:59:59Z"), Date.parse("2024-03-10T07:00:00Z"),
      Date.parse("1890-01-01T12:00:00Z"), Date.parse("0000-06-15T12:00:00Z"),
      Date.parse("0042-01-01T00:00:00Z"), Date.parse("-000001-06-15T12:00:00Z"),
      -8640000000000000, 8640000000000000,
    ];
    const expected = timestamps.map((timestamp) => new Date(timestamp).toLocaleString([], displayOptions));
    const { buildHistory: build } = await import("../buildHistory");
    const rows = build(timestamps.map((modified_ms, i) => ({ ...logs[0], name: `match-${i}`, modified_ms })), fallback);
    expect(rows.map((row) => row.hero)).toEqual(expected);
  });

  it("retains native invalid and unavailable timestamp behavior without throwing", async () => {
    vi.resetModules();
    const timestamps = [Number.NaN, Number.POSITIVE_INFINITY, undefined as unknown as number];
    const expected = timestamps.map((timestamp) => new Date(timestamp).toLocaleString([], displayOptions));
    const { buildHistory: build } = await import("../buildHistory");
    expect(build(timestamps.map((modified_ms) => ({ ...logs[0], modified_ms })), fallback).map((row) => row.hero)).toEqual(expected);
  });

  it("follows changed local civil time including fractional historical offsets with the same cached formatter", async () => {
    vi.resetModules();
    const timestamp = Date.parse("1890-01-01T12:00:00Z");
    const originalDate = new Date(timestamp);
    const environments = ["America/New_York", "Asia/Kolkata", "Europe/Paris"].map((timeZone) => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(originalDate);
      const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === name)?.value);
      return { year: part("year"), month: part("month") - 1, day: part("day"), hour: part("hour"), minute: part("minute"), expected: originalDate.toLocaleString([], { ...displayOptions, timeZone }) };
    });
    let environment = environments[0];
    vi.spyOn(Date.prototype, "getFullYear").mockImplementation(() => environment.year);
    vi.spyOn(Date.prototype, "getMonth").mockImplementation(() => environment.month);
    vi.spyOn(Date.prototype, "getDate").mockImplementation(() => environment.day);
    vi.spyOn(Date.prototype, "getHours").mockImplementation(() => environment.hour);
    vi.spyOn(Date.prototype, "getMinutes").mockImplementation(() => environment.minute);
    const constructor = vi.spyOn(Intl, "DateTimeFormat");
    const { buildHistory: build } = await import("../buildHistory");
    for (environment of environments) expect(build([{ ...logs[0], modified_ms: timestamp }], fallback)[0].hero).toBe(environment.expected);
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it("replaces the single cached formatter when the browser language environment changes", async () => {
    vi.resetModules();
    const nativeFormatter = Intl.DateTimeFormat;
    let locale = "en-US";
    const constructor = vi.spyOn(Intl, "DateTimeFormat").mockImplementation((...args) => new nativeFormatter(locale, args[1]));
    const { buildHistory: build } = await import("../buildHistory");
    for (locale of ["en-US", "th-TH", "ar-EG"]) {
      vi.stubGlobal("navigator", { language: locale, languages: [locale] });
      const expected = logs.map((log) => new Date(log.modified_ms).toLocaleString(locale, displayOptions));
      expect(build(logs, fallback).map((row) => row.hero)).toEqual(expected);
      expect(build(logs, fallback).map((row) => row.hero)).toEqual(expected);
    }
    expect(constructor).toHaveBeenCalledTimes(3);
  });
});
