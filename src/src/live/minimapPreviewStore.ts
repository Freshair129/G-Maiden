import { invoke } from "@tauri-apps/api/core";
import { MinimapPreviewDriver, type PreviewFrame } from "./minimapPreview";
export const minimapPreview = new MinimapPreviewDriver({
  now: () => performance.now(),
  schedule: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
  start: () => invoke<{ leaseId: string }>("start_minimap_preview"),
  read: (leaseId, afterFrameId) => invoke<ArrayBuffer>("read_minimap_preview", { leaseId, afterFrameId }),
  stop: (leaseId) => invoke("stop_minimap_preview", { leaseId }),
});

let viewers = 0;
function visibilityChanged() { minimapPreview.setVisible(document.visibilityState !== "hidden"); }
export function attachMinimapCanvas(callback: (frame: PreviewFrame | null) => void) {
  if (viewers++ === 0) {
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
  }
  const unsubscribe = minimapPreview.subscribeFrames(callback);
  return () => {
    unsubscribe();
    if (--viewers === 0) document.removeEventListener("visibilitychange", visibilityChanged);
  };
}
