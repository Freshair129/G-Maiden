import { describe, expect, it } from "vitest";
import { parseMinimapPacket, previewMatchesCv, MinimapPreviewDriver, type PreviewFrame } from "./minimapPreview";

function packet({ status = 1, frame = 1n, epoch = 7n, generation = 1n, acquired = 1000n, response = 2000n, stream = 9007199254740993n, fingerprint = 9007199254740995n, originX = -1920, originY = 0 } = {}) {
  const buffer = new ArrayBuffer(status === 1 ? 160 : 144);
  const d = new DataView(buffer);
  new Uint8Array(buffer).set([71, 77, 77, 80]);
  for (const [offset, value] of [[4, 2], [8, status], [12, 2], [16, 2], [20, 8], [64, 0], [68, 756], [72, 324], [92, 1920], [96, 1080], [100, 0], [112, 1], [116, status === 1 ? 16 : 0], [120, 144]]) d.setUint32(offset, value, true);
  for (const [offset, value] of [[24, stream], [32, epoch], [40, frame], [48, acquired], [56, response], [104, generation], [128, fingerprint]] as const) d.setBigUint64(offset, value, true);
  d.setInt32(136, originX, true); d.setInt32(140, originY, true);
  for (const [offset, value] of [[76, 0.031], [80, 0.064], [84, 0.932], [88, 0.961]]) d.setFloat32(offset, value, true);
  if (status === 1) new Uint8Array(buffer, 144).fill(123);
  return buffer;
}

describe("binary minimap contract", () => {
  it("reads Tauri JSON byte responses with the same validated frame identity", () => {
    const bytes = Array.from(new Uint8Array(packet()));
    expect(parseMinimapPacket(bytes as unknown as ArrayBuffer)?.pixels?.[0]).toBe(123);
    for (const invalid of [-1, 256, 1.5, NaN, "71", null]) {
      expect(parseMinimapPacket([invalid, ...bytes.slice(1)] as unknown as ArrayBuffer)).toBeNull();
    }
    expect(parseMinimapPacket(new Array(409745).fill(0) as unknown as ArrayBuffer)).toBeNull();
  });
  it("preserves full u64 identity and validates before exposing RGBA", () => {
    const result = parseMinimapPacket(packet());
    expect(result?.streamId).toBe(9007199254740993n);
    expect(result?.displayFingerprint).toBe(9007199254740995n);
    expect(result?.desktopOrigin).toEqual([-1920, 0]);
    expect(result?.pixels?.length).toBe(16);
    expect(result?.pixels?.[0]).toBe(123);
  });
  it("rejects malformed headers, oversized/strided pixels and impossible clock/crop geometry", () => {
    const cases = [[4, 1], [8, 6], [12, 321], [16, 0], [20, 12], [72, 0], [92, 2], [112, 0], [116, 15], [120, 128], [124, 1]];
    for (const [offset, value] of cases) {
      const buffer = packet();
      new DataView(buffer).setUint32(offset, value, true);
      expect(parseMinimapPacket(buffer), `offset ${offset}`).toBeNull();
    }
    const crop = packet();
    new DataView(crop).setFloat32(76, NaN, true);
    expect(parseMinimapPacket(crop)).toBeNull();
    expect(parseMinimapPacket(packet({ acquired: 3000n, response: 2000n }))).toBeNull();
    expect(parseMinimapPacket(packet({ fingerprint: 0n }))).toBeNull();
    expect(parseMinimapPacket(packet().slice(0, 159))).toBeNull();
    expect(parseMinimapPacket(packet().slice(0, 143))).toBeNull();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function rig() {
  let time = 0;
  let scheduled: (() => void) | null = null;
  const reads: Array<{ after: string; result: ReturnType<typeof deferred<ArrayBuffer>> }> = [];
  const starts: Array<ReturnType<typeof deferred<{ leaseId: string }>>> = [];
  const stopped: string[] = [];
  const drawn: Array<PreviewFrame | null> = [];
  const driver = new MinimapPreviewDriver({
    now: () => time,
    schedule: (callback) => { scheduled = callback; return 1; },
    cancel: () => { scheduled = null; },
    start: () => { const result = deferred<{ leaseId: string }>(); starts.push(result); return result.promise; },
    read: (_lease, after) => { const result = deferred<ArrayBuffer>(); reads.push({ after, result }); return result.promise; },
    stop: async (lease) => { stopped.push(lease); },
  });
  driver.setSession(7n, true);
  return { driver, reads, starts, stopped, drawn,
    subscribe: () => driver.subscribeFrames((frame) => drawn.push(frame)),
    jump: (at: number) => { time = at; },
    step: (at: number) => { time = at; const callback = scheduled; scheduled = null; callback?.(); },
  };
}

describe("latest-only preview lifecycle", () => {
  it("uses 200ms RPC cadence at five FPS and restores cadence on the same lease", async () => {
    const r = rig(); r.driver.setFrameRate(5); r.subscribe();
    r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.step(67); r.step(199); expect(r.reads).toHaveLength(1);
    r.step(200); expect(r.reads).toHaveLength(2);
    r.reads[1].result.resolve(packet({ frame: 2n, acquired: 200000n, response: 200001n })); await settle();
    r.driver.setFrameRate(15);
    r.step(267); expect(r.reads).toHaveLength(3);
    expect(r.starts).toHaveLength(1); expect(r.stopped).toHaveLength(0);
  });
  it("reduces both RPC and drawing cadence without replacing the lease or freshness fence", async () => {
    const r = rig(); r.driver.setFrameRate(15); r.subscribe();
    r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    r.step(34); r.step(50); expect(r.reads).toHaveLength(1);
    r.step(67); expect(r.reads).toHaveLength(2);
    expect(r.starts).toHaveLength(1); expect(r.stopped).toHaveLength(0);
    r.step(251); expect(r.driver.getSnapshot().status).toBe("stale");
  });
  it("shares one lease, allows one RPC in flight and counts/draws unique frames only at <=60Hz", async () => {
    const r = rig();
    const off = r.subscribe(); const off2 = r.driver.subscribeFrames(() => {});
    expect(r.starts).toHaveLength(1);
    r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.step(17); r.step(34);
    expect(r.reads).toHaveLength(1);
    r.reads[0].result.resolve(packet()); await settle();
    r.step(35);
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    expect(r.reads).toHaveLength(2);
    expect(r.reads[1].after).toBe("1");
    r.reads[1].result.resolve(packet()); await settle();
    r.step(40); r.step(52);
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    off(); expect(r.stopped).toHaveLength(0);
    off2(); expect(r.stopped).toEqual(["9007199254740993"]);
  });
  it("expires waiting/duplicate frames after acquisition freshness without renewing their age", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.reads[1].result.resolve(packet({ status: 0 })); await settle(); r.step(34);
    expect(r.driver.getSnapshot().status).toBe("live");
    r.step(251);
    expect(r.drawn[r.drawn.length - 1]).toBeNull();
    expect(r.driver.getSnapshot().status).toBe("stale");
  });
  it("fences old geometry statuses and frame IDs without blanking a newer map", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet({ generation: 2n, frame: 8n })); await settle(); r.step(17);
    r.reads[1].result.resolve(packet({ generation: 1n, status: 5 })); await settle(); r.step(34);
    expect(r.driver.getSnapshot().status).toBe("live");
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    r.reads[2].result.resolve(packet({ frame: 9n, epoch: 6n })); await settle(); r.step(51);
    expect(r.driver.getSnapshot().status).toBe("live");
  });
  it("clears on pressure and does not paint a response after session replacement or hiding", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.reads[1].result.resolve(packet({ status: 3 })); await settle(); r.step(34);
    expect(r.drawn[r.drawn.length - 1]).toBeNull(); expect(r.driver.getSnapshot().status).toBe("pressure");
    expect(r.reads).toHaveLength(2);
    r.step(284);
    r.driver.setSession(8n, true);
    r.reads[2].result.resolve(packet()); await settle(); r.step(301);
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    r.driver.setVisible(false);
    expect(r.stopped).toEqual(["9007199254740993"]);
  });
  it("stops an async start invalidated by StrictMode and starts only one replacement lease", async () => {
    const r = rig(); const off = r.subscribe(); off(); r.subscribe();
    expect(r.starts).toHaveLength(1);
    r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    expect(r.stopped).toEqual(["9007199254740993"]);
    expect(r.starts).toHaveLength(2);
    r.starts[1].resolve({ leaseId: "9007199254740994" }); await settle(); r.step(0);
    r.reads[0].result.resolve(packet({ stream: 9007199254740993n })); await settle(); r.step(17);
    expect(r.drawn.filter(Boolean)).toHaveLength(0);
  });
  it("paces by deadlines on a 144Hz UI without collapsing to 48FPS or React fan-out", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    let notifications = 0, answered = 0;
    r.driver.subscribeMetadata(() => notifications++);
    for (let i = 0; i < 144; i++) {
      r.step(i * 1000 / 144);
      if (answered < r.reads.length) { r.reads[answered++].result.resolve(packet({ frame: BigInt(answered) })); await settle(); }
    }
    expect(r.drawn.filter(Boolean).length).toBeGreaterThanOrEqual(59);
    expect(r.reads.length).toBeLessThanOrEqual(60);
    expect(notifications).toBeLessThanOrEqual(3);
  });
  it("matches markers only to the same session and native CV ROI", () => {
    const geometry = parseMinimapPacket(packet());
    const cv = { session_epoch: 7, geometry_generation: "1", display_index: 0, display_fingerprint: "9007199254740995", desktop_origin: [-1920, 0] as [number, number], region: { x: 0, y: 756, side: 324 }, icon: 10, count: 0, candidates: [], detections: [], classifier: true };
    expect(previewMatchesCv(geometry, cv)).toBe(true);
    expect(previewMatchesCv(geometry, { ...cv, session_epoch: 8 })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, region: { ...cv.region, side: 325 } })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, session_epoch: undefined })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, geometry_generation: "2" })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, display_index: 1 })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, display_fingerprint: "9007199254740996" })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, desktop_origin: [0, 0] })).toBe(false);
    expect(previewMatchesCv(geometry, { ...cv, desktop_origin: [-1920, -1080] })).toBe(false);
  });
  it("clears a same-size output replacement with the same index and fences the old physical source", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    const oldSource = r.driver.getSnapshot().geometry;
    r.reads[1].result.resolve(packet({ generation: 2n, frame: 2n, fingerprint: 9007199254740996n, originX: 0 })); await settle();
    expect(r.drawn[r.drawn.length - 1]).toBeNull();
    expect(r.driver.getSnapshot().status).toBe("waiting");
    r.step(34);
    const source = r.driver.getSnapshot().geometry;
    expect(source?.displayIndex).toBe(oldSource?.displayIndex);
    expect(source?.screenWidth).toBe(oldSource?.screenWidth);
    expect(source?.displayFingerprint).toBe(9007199254740996n);
    expect(source?.desktopOrigin).toEqual([0, 0]);
    r.reads[2].result.resolve(packet({ status: 4 })); await settle(); r.step(51);
    expect(r.driver.getSnapshot().status).toBe("live");
    expect(r.driver.getSnapshot().geometry).toBe(source);
  });
  it.each([
    { fingerprint: 9007199254740996n }, { originX: 0 }, { originY: -1080 },
  ])("rejects conflicting physical metadata without a canonical generation advance: %o", async (change) => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    const source = r.driver.getSnapshot().geometry;
    r.reads[1].result.resolve(packet({ ...change, frame: 2n })); await settle(); r.step(34);
    expect(r.drawn.filter(Boolean)).toHaveLength(1);
    expect(r.driver.getSnapshot().geometry).toBe(source);
    r.reads[2].result.resolve(packet({ ...change, generation: 2n, frame: 2n })); await settle(); r.step(51);
    expect(r.drawn.filter(Boolean)).toHaveLength(2);
  });
  it("retires an expired lease on native inactive and reacquires without reviving its token", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.reads[1].result.resolve(packet({ status: 2, epoch: 0n, generation: 0n })); await settle();
    expect(r.driver.getSnapshot().status).toBe("inactive");
    expect(r.drawn[r.drawn.length - 1]).toBeNull();
    expect(r.stopped).toEqual(["9007199254740993"]);
    r.step(266); expect(r.starts).toHaveLength(1);
    r.step(267); expect(r.starts).toHaveLength(2);
    r.starts[1].resolve({ leaseId: "9007199254740994" }); await settle(); r.step(284);
    r.reads[2].result.resolve(packet({ stream: 9007199254740994n, frame: 1n })); await settle(); r.step(301);
    expect(r.drawn.filter(Boolean)).toHaveLength(2);
  });
  it("draws a fresh pending frame when the previously displayed frame expires on that same tick", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.step(249); r.reads[1].result.resolve(packet({ frame: 2n })); await settle();
    r.step(251);
    expect(r.drawn.filter(Boolean).map((frame) => frame!.frameId)).toEqual([1n, 2n]);
    expect(r.driver.getSnapshot().status).toBe("live");
  });
  it("never replays an expired cached frame to a newly mounted canvas between animation ticks", async () => {
    const r = rig(); r.subscribe(); r.starts[0].resolve({ leaseId: "9007199254740993" }); await settle();
    r.step(0); r.reads[0].result.resolve(packet()); await settle(); r.step(17);
    r.jump(251);
    const replayed: Array<PreviewFrame | null> = [];
    r.driver.subscribeFrames((frame) => replayed.push(frame));
    expect(replayed).toEqual([null]);
    expect(r.driver.getSnapshot().status).toBe("stale");
  });
});
