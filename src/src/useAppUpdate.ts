// CR-013 W2 gate fix (Opus F1): the in-app updater is G-Maiden's PRIMARY
// distribution mechanism (CLAUDE.md "Release & update workflow"), so the
// launch auto-check and the "มีเวอร์ชันใหม่" banner must be reachable no matter
// where the user is. Before this hook the whole feature lived inside the legacy
// `Control` component, which — after the CR-013 W2 split view — only mounts when
// a NON-"general" settings category is open. Net effect: a user who launched the
// app and never opened Settings → (a non-general category) never triggered the
// check and never saw the banner. Lifting it into this hook lets CommandDeck
// (always mounted for the control window) own it: the check fires once on mount,
// and the banner renders in the settings shell regardless of category.
//
// This hook used to call the updater plugin's `check()` with no arguments, which
// made it CHANNEL-BLIND and, worse, inert: with no target the plugin substitutes
// `updater_os()` = "windows" into the endpoint template and requested a
// `release/channels/windows.json` that has never existed, so the launch check threw
// on every run and the banner could never appear. It now goes through the Rust
// `check_channel_update` command, which owns the per-channel URL and the resolved
// channel (see updateChannel.ts for why the channel cannot ride on `target`).
import { useCallback, useEffect, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import { checkChannelUpdate, installPendingUpdate, type UpdateOffer } from "./updateChannel";

export type UpdatePhase = "idle" | "checking" | "downloading" | "uptodate" | "error";

export interface AppUpdate {
  /** The available update (version + notes), or null when none is pending. */
  available: { version: string; notes: string } | null;
  phase: UpdatePhase;
  /** Manual "ตรวจหาอัปเดต" trigger. */
  checkNow: () => Promise<void>;
  /** Download + install the pending update, then relaunch. */
  install: () => Promise<void>;
  /** Dismiss the banner ("ภายหลัง") without installing. */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdate {
  const pending = useRef<UpdateOffer | null>(null);
  const [available, setAvailable] = useState<{ version: string; notes: string } | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");

  // Launch auto-check. Ask-first: only surfaces the prompt, never installs.
  // Silent on failure (offline, or nothing published on this channel yet).
  useEffect(() => {
    void (async () => {
      try {
        const offer = await checkChannelUpdate();
        if (offer) {
          pending.current = offer;
          setAvailable({ version: offer.version, notes: offer.notes });
        }
      } catch {
        /* offline / nothing published on this channel */
      }
    })();
  }, []);

  const checkNow = useCallback(async () => {
    setPhase("checking");
    try {
      const offer = await checkChannelUpdate();
      if (offer) {
        pending.current = offer;
        setAvailable({ version: offer.version, notes: offer.notes });
        setPhase("idle");
      } else {
        pending.current = null;
        setAvailable(null);
        setPhase("uptodate");
      }
    } catch {
      setPhase("error");
    }
  }, []);

  const install = useCallback(async () => {
    if (!pending.current) return;
    setPhase("downloading");
    try {
      await installPendingUpdate();
      await relaunch();
    } catch {
      setPhase("error");
    }
  }, []);

  const dismiss = useCallback(() => setAvailable(null), []);

  return { available, phase, checkNow, install, dismiss };
}
