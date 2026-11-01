import { useSyncExternalStore } from "react";
import { minimapPreview } from "./minimapPreviewStore";

export function useMinimapPreview() {
  return useSyncExternalStore(minimapPreview.subscribeMetadata, minimapPreview.getSnapshot, minimapPreview.getSnapshot);
}
