import type { MinimapCv } from "./events";

export type PreviewStatus = "waiting" | "live" | "inactive" | "pressure" | "unavailable" | "stale";
export interface PreviewGeometry {
  streamId: bigint;
  epoch: bigint;
  generation: bigint;
  region: { x: number; y: number; side: number };
  map_crop: { left: number; top: number; right: number; bottom: number };
  screenWidth: number;
  screenHeight: number;
  displayIndex: number;
  displayFingerprint: bigint;
  desktopOrigin: readonly [number, number];
}
export interface PreviewFrame extends PreviewGeometry {
  status: number;
  width: number;
  height: number;
  frameId: bigint;
  acquiredUs: bigint;
  responseNativeUs: bigint;
  pixels: Uint8ClampedArray<ArrayBuffer> | null;
}
export interface PreviewSnapshot {
  status: PreviewStatus;
  geometry: PreviewGeometry | null;
  drawFps: number;
  rpcRttMs: number;
  estimatedDrawAgeMs: number;
  clockUncertaintyMs: number;
}

/** Validate the fixed native wire contract before allocating ImageData. */
export function parseMinimapPacket(input: unknown): PreviewFrame | null {
  // Tauri's postMessage transport represents binary IPC responses as JSON bytes.
  // Validate before converting so malformed values cannot wrap into valid headers.
  let buffer = input;
  if (Array.isArray(input)) {
    if (input.length < 144 || input.length > 144 + 320 * 320 * 4) return null;
    for (const byte of input) if (!Number.isInteger(byte) || byte < 0 || byte > 255) return null;
    buffer = new Uint8Array(input).buffer;
  }
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 144) return null;
  const d = new DataView(buffer);
  const u32 = (at: number) => d.getUint32(at, true);
  const u64 = (at: number) => d.getBigUint64(at, true);
  if (u32(0) !== 0x504d4d47 || u32(4) !== 2 || u32(120) !== 144 || u32(124) !== 0) return null;
  const status = u32(8), width = u32(12), height = u32(16), stride = u32(20), payload = u32(116);
  if (status > 5 || u32(112) > 1 || buffer.byteLength !== 144 + payload) return null;
  if (status === 1 && (u32(112) !== 1 || width < 1 || height < 1 || width > 320 || height > 320 || stride !== width * 4 || payload !== stride * height)) return null;
  if (status !== 1 && payload !== 0) return null;
  const region = { x: u32(64), y: u32(68), side: u32(72) };
  const map_crop = { left: d.getFloat32(76, true), top: d.getFloat32(80, true), right: d.getFloat32(84, true), bottom: d.getFloat32(88, true) };
  const screenWidth = u32(92), screenHeight = u32(96);
  if (status === 1 && (!region.side || !screenWidth || !screenHeight || region.x + region.side > screenWidth || region.y + region.side > screenHeight)) return null;
  if (status === 1 && (!Object.values(map_crop).every(Number.isFinite) || map_crop.left < 0 || map_crop.top < 0 || map_crop.right > 1 || map_crop.bottom > 1 || map_crop.right <= map_crop.left || map_crop.bottom <= map_crop.top)) return null;
  if (u64(24) === 0n || (status === 1 && (u64(40) === 0n || u64(104) === 0n || u64(128) === 0n || u64(56) < u64(48)))) return null;
  return { status, width, height, streamId: u64(24), epoch: u64(32), frameId: u64(40), acquiredUs: u64(48), responseNativeUs: u64(56), generation: u64(104), region, map_crop, screenWidth, screenHeight, displayIndex: u32(100), displayFingerprint: u64(128), desktopOrigin: [d.getInt32(136, true), d.getInt32(140, true)], pixels: status === 1 ? new Uint8ClampedArray(buffer, 144, payload) : null };
}

export function previewMatchesCv(geometry: PreviewGeometry | null, cv: MinimapCv | null): boolean {
  return !!geometry && !!cv && cv.session_epoch !== undefined && Number.isSafeInteger(cv.session_epoch) && BigInt(cv.session_epoch) === geometry.epoch &&
    cv.geometry_generation === geometry.generation.toString() && cv.display_index === geometry.displayIndex &&
    cv.display_fingerprint === geometry.displayFingerprint.toString() &&
    cv.desktop_origin?.[0] === geometry.desktopOrigin[0] && cv.desktop_origin?.[1] === geometry.desktopOrigin[1] &&
    cv.region.x === geometry.region.x && cv.region.y === geometry.region.y && cv.region.side === geometry.region.side;
}

interface Transport {
  now: () => number;
  schedule: (callback: () => void) => number;
  cancel: (id: number) => void;
  start: () => Promise<{ leaseId: string }>;
  read: (leaseId: string, afterFrameId: string) => Promise<ArrayBuffer>;
  stop: (leaseId: string) => Promise<unknown>;
}
type Received = { frame: PreviewFrame; receivedAt: number; rtt: number; nativeAge: number };
const INTERVAL = 1000 / 60;
const STATUS: PreviewStatus[] = ["waiting", "live", "inactive", "pressure", "unavailable", "stale"];
const EMPTY: PreviewSnapshot = { status: "inactive", geometry: null, drawFps: 0, rpcRttMs: 0, estimatedDrawAgeMs: 0, clockUncertaintyMs: 0 };
function nextDeadline(previous: number, now: number, interval: number) {
  return previous + (Math.floor(Math.max(0, now - previous) / interval) + 1) * interval;
}
function sameGeometry(a: PreviewGeometry | null, b: PreviewGeometry | null): boolean {
  return a === b || !!a && !!b && a.streamId === b.streamId && a.epoch === b.epoch && a.generation === b.generation &&
    a.displayFingerprint === b.displayFingerprint && a.desktopOrigin[0] === b.desktopOrigin[0] && a.desktopOrigin[1] === b.desktopOrigin[1] &&
    a.displayIndex === b.displayIndex && a.screenWidth === b.screenWidth && a.screenHeight === b.screenHeight &&
    a.region.x === b.region.x && a.region.y === b.region.y && a.region.side === b.region.side &&
    a.map_crop.left === b.map_crop.left && a.map_crop.top === b.map_crop.top && a.map_crop.right === b.map_crop.right && a.map_crop.bottom === b.map_crop.bottom;
}
function geometryMetadata(geometry: PreviewGeometry): PreviewGeometry {
  return {
    streamId: geometry.streamId, epoch: geometry.epoch, generation: geometry.generation,
    region: geometry.region, map_crop: geometry.map_crop, screenWidth: geometry.screenWidth,
    screenHeight: geometry.screenHeight, displayIndex: geometry.displayIndex,
    displayFingerprint: geometry.displayFingerprint, desktopOrigin: geometry.desktopOrigin,
  };
}

/** One lease/RPC and two bounded pixel slots shared by all visible canvases. */
export class MinimapPreviewDriver {
  private interval = INTERVAL;
  setFrameRate(fps: number) {
    if (![15, 30, 60].includes(fps)) return;
    this.interval = 1000 / fps;
  }
  private frames = new Set<(frame: PreviewFrame | null) => void>();
  private metadata = new Set<() => void>();
  private snapshot: PreviewSnapshot = EMPTY;
  private epoch: bigint | null = null;
  private active = false;
  private visible = true;
  private lease: string | null = null;
  private revision = 0;
  private starting = false;
  private inFlight = false;
  private animation: number | null = null;
  private nextRead = 0;
  private nextDraw = 0;
  private retryAt = 0;
  private after = 0n;
  private generation = 0n;
  private source: PreviewGeometry | null = null;
  private pending: Received | null = null;
  private displayed: Received | null = null;
  private sampleAt = 0;
  private sampleDraws = 0;
  private timing = { rpcRttMs: 0, estimatedDrawAgeMs: 0, clockUncertaintyMs: 0 };

  constructor(private transport: Transport) {}
  getSnapshot = (): PreviewSnapshot => this.snapshot;
  subscribeMetadata = (callback: () => void) => { this.metadata.add(callback); return () => { this.metadata.delete(callback); }; };
  subscribeFrames = (callback: (frame: PreviewFrame | null) => void) => {
    if (this.displayed && this.ageUpper(this.displayed, this.transport.now()) > 250) this.clear("stale");
    this.frames.add(callback);
    callback(this.displayed?.frame ?? null);
    this.reconcile();
    return () => { this.frames.delete(callback); this.reconcile(); };
  };
  setSession(epoch: bigint | null, active: boolean) {
    if (this.epoch !== null && epoch !== null && epoch < this.epoch) return;
    if (epoch === this.epoch && active === this.active) return;
    this.epoch = epoch; this.active = active;
    this.revision += 1;
    this.after = 0n; this.generation = 0n;
    this.source = null;
    this.clear(active ? "waiting" : "inactive");
    this.reconcile();
  }
  setVisible(visible: boolean) { if (visible !== this.visible) { this.visible = visible; this.reconcile(); } }
  private wanted() { return this.frames.size > 0 && this.visible && this.active && this.epoch !== null; }
  private notify(status: PreviewStatus, geometry: PreviewGeometry | null, force = false) {
    const old = this.snapshot.geometry;
    const changed = !sameGeometry(old, geometry);
    if (!force && this.snapshot.status === status && !changed) return;
    const source = changed && geometry ? geometryMetadata(geometry) : geometry ? old : null;
    this.snapshot = { ...this.snapshot, ...this.timing, status, geometry: source };
    for (const callback of this.metadata) callback();
  }
  private clear(status: PreviewStatus) {
    this.pending = null; this.displayed = null;
    for (const callback of this.frames) callback(null);
    this.notify(status, null);
  }
  private reconcile() {
    if (!this.wanted()) {
      this.revision += 1;
      if (this.animation !== null) this.transport.cancel(this.animation);
      this.animation = null;
      const lease = this.lease; this.lease = null;
      if (lease) void this.transport.stop(lease).catch(() => {});
      this.after = 0n; this.generation = 0n;
      this.source = null;
      this.clear("inactive");
      return;
    }
    if (!this.lease && !this.starting && this.transport.now() >= this.retryAt) {
      this.starting = true;
      const revision = this.revision;
      void this.transport.start().then((result) => {
        if (!/^\d+$/.test(result.leaseId) || BigInt(result.leaseId) === 0n) throw new Error("Invalid preview lease");
        if (revision !== this.revision || !this.wanted()) { void this.transport.stop(result.leaseId).catch(() => {}); return; }
        this.lease = result.leaseId;
        this.after = 0n; this.generation = 0n;
        this.source = null;
        this.nextRead = this.nextDraw = this.sampleAt = this.transport.now();
        this.sampleDraws = 0;
        this.notify("waiting", null);
      }).catch(() => { if (revision === this.revision) { this.retryAt = this.transport.now() + 500; this.clear("unavailable"); } }).finally(() => {
        this.starting = false;
        if (revision !== this.revision && this.wanted()) this.reconcile();
      });
    }
    if (this.animation === null) this.animation = this.transport.schedule(this.tick);
  }
  private tick = () => {
    this.animation = null;
    if (!this.wanted()) return;
    const now = this.transport.now();
    if (this.pending && now >= this.nextDraw) {
      const received = this.pending; this.pending = null;
      if (this.ageUpper(received, now) > 250) this.clear("stale");
      else {
        this.displayed = received;
        for (const callback of this.frames) callback(received.frame);
        this.sampleDraws += 1;
        this.timing = { rpcRttMs: received.rtt, estimatedDrawAgeMs: received.nativeAge + received.rtt / 2 + now - received.receivedAt, clockUncertaintyMs: received.rtt / 2 };
        this.notify("live", received.frame);
      }
      this.nextDraw = nextDeadline(this.nextDraw, now, this.interval);
    }
    if (this.displayed && this.ageUpper(this.displayed, now) > 250) this.clear("stale");
    if (now - this.sampleAt >= 1000) {
      this.snapshot = { ...this.snapshot, drawFps: this.sampleDraws * 1000 / (now - this.sampleAt) };
      this.sampleDraws = 0; this.sampleAt = now;
      this.notify(this.snapshot.status, this.snapshot.geometry, true);
    }
    if (this.lease && !this.inFlight && now >= this.nextRead) this.read(now);
    this.reconcile();
  };
  private ageUpper(received: Received, now: number) { return received.nativeAge + received.rtt + now - received.receivedAt; }
  private retire(status: PreviewStatus, delay: number) {
    const lease = this.lease;
    this.lease = null; this.revision += 1;
    this.after = 0n; this.generation = 0n;
    this.source = null;
    this.retryAt = this.transport.now() + delay;
    if (lease) void this.transport.stop(lease).catch(() => {});
    this.clear(status);
  }
  private read(sentAt: number) {
    const lease = this.lease!, revision = this.revision;
    this.inFlight = true;
    this.nextRead = nextDeadline(this.nextRead, sentAt, this.interval);
    void this.transport.read(lease, this.after.toString()).then((buffer) => {
      if (!this.wanted() || revision !== this.revision || lease !== this.lease) return;
      const frame = parseMinimapPacket(buffer);
      if (!frame) { this.clear("unavailable"); this.nextRead = this.transport.now() + 250; return; }
      if (frame.streamId !== BigInt(lease)) return;
      if (frame.status === 2 && frame.epoch === 0n) { this.retire("inactive", 250); return; }
      if (frame.epoch !== this.epoch || frame.generation < this.generation) return;
      if (frame.generation === this.generation && this.source && !sameGeometry(this.source, frame)) return;
      if (frame.status === 2) { this.retire("inactive", 250); return; }
      if (frame.generation > this.generation) {
        this.generation = frame.generation; this.after = 0n;
        this.source = null;
        this.clear("waiting");
      }
      if (frame.status === 0) { if (!this.displayed) this.notify("waiting", null); return; }
      if (frame.status !== 1) { this.clear(STATUS[frame.status]); this.nextRead = this.transport.now() + 250; return; }
      if (frame.frameId <= this.after) return;
      const receivedAt = this.transport.now(), rtt = Math.max(0, receivedAt - sentAt);
      const nativeAgeUs = frame.responseNativeUs - frame.acquiredUs;
      if (nativeAgeUs > 250000n || Number(nativeAgeUs) / 1000 + rtt > 250) { this.clear("stale"); return; }
      this.after = frame.frameId;
      if (!this.source) this.source = geometryMetadata(frame);
      this.pending = { frame, receivedAt, rtt, nativeAge: Number(nativeAgeUs) / 1000 };
    }).catch(() => { if (revision === this.revision && lease === this.lease && this.wanted()) this.retire("unavailable", 500); }).finally(() => { this.inFlight = false; });
  }
}
