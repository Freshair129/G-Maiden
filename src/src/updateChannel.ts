import { invoke } from "@tauri-apps/api/core";

export type ReleaseChannel = "dev" | "closed-beta" | "stable";
export type ChannelSource = "account-entitlement" | "stable-fallback";

export type UpdateChannelDecision = {
  state?: string;
  update_channel?: string;
};

export type ResolvedUpdateChannel = {
  channel: ReleaseChannel;
  source: ChannelSource;
};

/** What the backend found on the channel's manifest. */
export type UpdateOffer = {
  version: string;
  notes: string;
  channel: string;
};

const CHANNELS = new Set<ReleaseChannel>(["dev", "closed-beta", "stable"]);

export function resolveUpdateChannel(
  decision: UpdateChannelDecision | null | undefined,
): ResolvedUpdateChannel {
  if (decision?.state === "eligible" && CHANNELS.has(decision.update_channel as ReleaseChannel)) {
    return {
      channel: decision.update_channel as ReleaseChannel,
      source: "account-entitlement",
    };
  }
  return { channel: "stable", source: "stable-fallback" };
}

/**
 * Ask the backend to check the channel's manifest.
 *
 * This deliberately does NOT call the updater plugin's `check()` from JS. That API
 * exposes only `target`, and the plugin uses one `target` string BOTH to fill
 * `{{target}}` in the endpoint template AND as the key it looks up in the manifest's
 * `platforms{}`. Overloading it to carry the channel is what broke every previous
 * attempt: bare `check()` requested a `release/channels/windows.json` that does not
 * exist, and `check({ target: "dev" })` fetched the right manifest and then looked for
 * a `platforms["dev"]` that manifests generated from Tauri's own `latest.json` never
 * contain. The Rust command builds the endpoint from a hardcoded per-channel URL and
 * passes no target, so the plugin's `{os}-{arch}-{installer}` fallback resolves the
 * real platform keys — and MSI vs NSIS installs still get their own artifact.
 *
 * Omit `channel` to use the channel the backend resolved from the entitlement (Stable
 * until one is verified). Passing one only narrows to a channel the backend already
 * accepts; the webview never supplies a URL.
 */
export async function checkChannelUpdate(channel?: ReleaseChannel): Promise<UpdateOffer | null> {
  return invoke<UpdateOffer | null>("check_channel_update", { channel: channel ?? null });
}

/** Download and install the update from the last successful check. */
export async function installPendingUpdate(): Promise<void> {
  await invoke("install_pending_update");
}
