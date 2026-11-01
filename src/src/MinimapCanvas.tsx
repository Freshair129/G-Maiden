import { useEffect, useRef } from "react";
import { attachMinimapCanvas } from "./live/minimapPreviewStore";
import { useMinimapPreview } from "./live/useMinimapPreview";
import type { PreviewStatus } from "./live/minimapPreview";

const LABEL: Record<PreviewStatus, string> = {
  waiting: "รอภาพสด", live: "ภาพสด", inactive: "ยังไม่เห็นแมพ",
  pressure: "พักภาพ · ทรัพยากรไม่พร้อม", unavailable: "จับภาพไม่ได้", stale: "ภาพล้าสมัย",
};
/** Pixels bypass React; only source/status and the one-second summary notify it. */
export function MinimapCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const snapshot = useMinimapPreview();
  const live = snapshot.status === "live";
  useEffect(() => attachMinimapCanvas((frame) => {
    const target = canvas.current;
    if (!target) return;
    const context = target.getContext("2d");
    if (!context) return;
    if (!frame?.pixels) { context.clearRect(0, 0, target.width, target.height); return; }
    if (target.width !== frame.width) target.width = frame.width;
    if (target.height !== frame.height) target.height = frame.height;
    context.putImageData(new ImageData(frame.pixels, frame.width, frame.height), 0, 0);
  }), []);
  return <>
    <img className="gm-minimap-img" src="/dota-minimap-reference.webp" alt="" draggable={false}
      style={{ display: live ? "none" : "block", opacity: 0.32, filter: "saturate(0.55)" }} />
    <canvas ref={canvas} className="gm-minimap-img" width={1} height={1}
      aria-label="ภาพมินิแมปสดจาก DXGI" style={{ display: live ? "block" : "none" }}
      title={`เฟรมใหม่ที่สั่งวาด ${snapshot.drawFps.toFixed(1)}/s · RPC ${snapshot.rpcRttMs.toFixed(1)} ms · อายุภาพประมาณ ${snapshot.estimatedDrawAgeMs.toFixed(1)} ±${snapshot.clockUncertaintyMs.toFixed(1)} ms · ยังไม่ใช่ผลวัดการนำเสนอภาพจริง`} />
    {!live && <span className="gm-minimap-ref-badge">{LABEL[snapshot.status]} · ภาพอ้างอิง</span>}
  </>;
}
