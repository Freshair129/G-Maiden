import { describe, it, expect } from "vitest";
import { buildUtterances, MAX_UTTERANCES, type Utterance } from "../utterances";
import type { UtteranceEvent } from "../events";

function makeEvent(overrides: Partial<UtteranceEvent> = {}): UtteranceEvent {
  return {
    atMs: 1_000,
    source: "signal",
    kind: "line",
    text: "ระวังนะคะ Pudge หายจากแมพ",
    ...overrides
  };
}

describe("buildUtterances", () => {
  it("prepends the new event so it becomes index 0", () => {
    const prev: Utterance[] = [
      {
        id: "utt-0-signal",
        atMs: 0,
        timeLabel: "00:00:00",
        source: "signal",
        kind: "line",
        text: "seed",
        retracted: null,
        meta: null
      }
    ];
    const result = buildUtterances(prev, makeEvent({ atMs: 1_000, text: "new line" }));
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("new line");
    expect(result[1].text).toBe("seed");
  });

  it("caps the ledger at MAX_UTTERANCES entries", () => {
    let log: Utterance[] = [];
    for (let i = 0; i < MAX_UTTERANCES + 5; i++) {
      // source "signal" — announcer text goes through announcerLabel() mapping
      log = buildUtterances(log, makeEvent({ atMs: i, source: "signal", text: `line ${i}` }));
    }
    expect(log).toHaveLength(MAX_UTTERANCES);
    // most recent stays at the front, oldest entries fall off the back
    expect(log[0].text).toBe(`line ${MAX_UTTERANCES + 4}`);
  });

  it("maps announcer enum ids to human labels; other sources pass through raw", () => {
    const ann = buildUtterances([], makeEvent({ source: "announcer", text: "double_kill" }));
    expect(ann[0].text).toBe("DOUBLE KILL");
    const annThai = buildUtterances([], makeEvent({ source: "announcer", text: "respawn" }));
    expect(annThai[0].text).toBe("เกิดใหม่");
    // unknown ids: prettified caps, never raw snake_case
    const unknown = buildUtterances([], makeEvent({ source: "announcer", text: "mega_ultra_combo" }));
    expect(unknown[0].text).toBe("MEGA ULTRA COMBO");
    // non-announcer text is what was actually voiced — untouched
    const sig = buildUtterances([], makeEvent({ source: "signal", text: "double_kill" }));
    expect(sig[0].text).toBe("double_kill");
  });

  it("kind='revision' with a retracted value passes it through unchanged", () => {
    const result = buildUtterances(
      [],
      makeEvent({ kind: "revision", text: "เอ๊ะ! เดี๋ยวก่อน", retracted: "เลนบนปลอดภัย" })
    );
    expect(result[0].kind).toBe("revision");
    expect(result[0].retracted).toBe("เลนบนปลอดภัย");
  });

  it("kind='revision' with no retracted field still renders (retracted null)", () => {
    const result = buildUtterances([], makeEvent({ kind: "revision" }));
    expect(result[0].kind).toBe("revision");
    expect(result[0].retracted).toBeNull();
  });

  it("a plain kind='line' event has retracted=null", () => {
    const result = buildUtterances([], makeEvent({ kind: "line" }));
    expect(result[0].retracted).toBeNull();
  });

  it("passes meta through unchanged (e.g. master backend tag)", () => {
    const result = buildUtterances([], makeEvent({ source: "master", meta: "ollama" }));
    expect(result[0].meta).toBe("ollama");
  });

  it("defaults meta to null when absent", () => {
    const result = buildUtterances([], makeEvent());
    expect(result[0].meta).toBeNull();
  });

  it("ids are stable/deterministic from atMs+source for a given call", () => {
    const a = buildUtterances([], makeEvent({ atMs: 5_000, source: "master" }));
    const b = buildUtterances([], makeEvent({ atMs: 5_000, source: "master" }));
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toBe("utt-5000-master");
  });

  it("different atMs or source produce different ids", () => {
    const a = buildUtterances([], makeEvent({ atMs: 1_000, source: "signal" }));
    const b = buildUtterances([], makeEvent({ atMs: 2_000, source: "signal" }));
    const c = buildUtterances([], makeEvent({ atMs: 1_000, source: "master" }));
    expect(a[0].id).not.toBe(b[0].id);
    expect(a[0].id).not.toBe(c[0].id);
  });

  it("disambiguates a genuine atMs+source collision using nowMs", () => {
    const first = buildUtterances([], makeEvent({ atMs: 1_000, source: "signal" }), 1_000);
    const second = buildUtterances(first, makeEvent({ atMs: 1_000, source: "signal" }), 1_500);
    expect(second[0].id).not.toBe(second[1].id);
    expect(second[0].id).toBe("utt-1000-signal-1500");
  });

  it("formats timeLabel as HH:MM:SS local time from atMs", () => {
    const d = new Date(2026, 6, 9, 21, 5, 3);
    const result = buildUtterances([], makeEvent({ atMs: d.getTime() }));
    expect(result[0].timeLabel).toBe("21:05:03");
  });

  it("timeLabel pads single-digit hours/minutes/seconds", () => {
    const d = new Date(2026, 6, 9, 3, 4, 5);
    const result = buildUtterances([], makeEvent({ atMs: d.getTime() }));
    expect(result[0].timeLabel).toBe("03:04:05");
  });
});
