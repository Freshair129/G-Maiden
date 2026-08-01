import { check, type Update } from "@tauri-apps/plugin-updater";

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
 * Uses Tauri's updater plugin so the embedded public key and mandatory updater
 * signature verification remain unchanged. `target` is deliberately limited to
 * the resolver output rather than accepting arbitrary UI input.
 */
export async function checkResolvedUpdate(
  resolved: ResolvedUpdateChannel,
): Promise<Update | null> {
  return check({ target: resolved.channel, timeout: 30_000 });
}
