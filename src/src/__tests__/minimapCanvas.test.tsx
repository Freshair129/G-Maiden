// @vitest-environment jsdom
import { Profiler, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { MinimapCanvas } from "../MinimapCanvas";
import { minimapPreview } from "../live/minimapPreviewStore";

let frameId = 0n;
function response() {
  const buffer = new ArrayBuffer(160), d = new DataView(buffer);
  new Uint8Array(buffer).set([71, 77, 77, 80]);
  for (const [at, value] of [[4, 2], [8, 1], [12, 2], [16, 2], [20, 8], [64, 0], [68, 0], [72, 2], [92, 1920], [96, 1080], [112, 1], [116, 16], [120, 144]]) d.setUint32(at, value, true);
  for (const [at, value] of [[24, 1n], [32, 7n], [40, ++frameId], [48, 1000n], [56, 2000n], [104, 1n], [128, 3n]] as const) d.setBigUint64(at, value, true);
  for (const [at, value] of [[76, 0.031], [80, 0.064], [84, 0.932], [88, 0.961]]) d.setFloat32(at, value, true);
  new Uint8Array(buffer, 144).fill(123);
  return buffer;
}
vi.mock("@tauri-apps/api/core", () => ({ invoke: async (command: string) => {
  if (command === "start_minimap_preview") return { leaseId: "1" };
  if (command === "read_minimap_preview") return response();
} }));

it("paints raw pixels directly while React updates only source/status and clears immediately on hiding", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let now = 0, sequence = 0, renders = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callbacks.set(++sequence, callback); return sequence; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("ImageData", class { constructor(public data: Uint8ClampedArray, public width: number, public height: number) {} });
  const painted: number[][] = [];
  let clears = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
    putImageData: (image: ImageData) => painted.push([image.width, image.height, image.data[0]]),
    clearRect: () => { clears++; },
  }) as unknown as CanvasRenderingContext2D);
  const element = document.createElement("div"), root = createRoot(element);
  try {
    minimapPreview.setSession(7n, true);
    await act(async () => root.render(<Profiler id="map" onRender={() => { renders++; }}><MinimapCanvas /></Profiler>));
    expect(element.textContent).toContain("ภาพอ้างอิง");
    for (let i = 0; i < 25; i++) await act(async () => {
      now = i * 17;
      const pending = [...callbacks.values()]; callbacks.clear();
      pending.forEach((callback) => callback(now));
    });
    expect(painted.length).toBeGreaterThanOrEqual(20);
    expect(painted[0]).toEqual([2, 2, 123]);
    expect(renders).toBeLessThanOrEqual(4);
    expect(element.querySelector("canvas")?.getAttribute("aria-label")).toBe("ภาพมินิแมปสดจาก DXGI");
    const before = clears;
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(clears).toBeGreaterThan(before);
    expect(callbacks.size).toBe(0);
    expect(element.textContent).toContain("ภาพอ้างอิง");
  } finally {
    await act(async () => root.unmount());
    minimapPreview.setSession(null, false);
    delete (document as unknown as { visibilityState?: string }).visibilityState;
    vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
