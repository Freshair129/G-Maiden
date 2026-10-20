import { invoke } from "@tauri-apps/api/core";

/** What the backend found on the stable manifest. */
export type UpdateOffer = {
  version: string;
  notes: string;
  channel: string;
};

/**
 * Ask the backend to check the stable manifest.
 *
 * This deliberately does NOT call the updater plugin's JS `check()`: its
 * `target` parameter is used both in the endpoint URL and as a manifest platform
 * key. The native command supplies the fixed stable URL and lets the plugin
 * resolve the actual platform key, including MSI vs NSIS installers.
 * The renderer does not select update channels; the backend owns the fixed
 * signed stable endpoint.
 */
export async function checkChannelUpdate(): Promise<UpdateOffer | null> {
  return invoke<UpdateOffer | null>("check_channel_update");
}

/** Download and install the update from the last successful check. */
export async function installPendingUpdate(): Promise<void> {
  await invoke("install_pending_update");
}
