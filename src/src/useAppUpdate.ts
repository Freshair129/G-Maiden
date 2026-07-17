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
import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

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
  const updRef = useRef<Update | null>(null);
  const [available, setAvailable] = useState<{ version: string; notes: string } | null>(null);
  const [phase, setPhase] = useState<UpdatePhase>("idle");

  // Launch auto-check. Ask-first: only surfaces the prompt, never installs.
  // Silent on failure (offline, or no release published yet).
  useEffect(() => {
    void (async () => {
      try {
        const u = await check();
        if (u?.available) {
          updRef.current = u;
          setAvailable({ version: u.version, notes: u.body ?? "" });
        }
      } catch {
        /* offline / no endpoint yet */
      }
    })();
  }, []);

  const checkNow = useCallback(async () => {
    setPhase("checking");
    try {
      const u = await check();
      if (u?.available) {
        updRef.current = u;
        setAvailable({ version: u.version, notes: u.body ?? "" });
        setPhase("idle");
      } else {
        setAvailable(null);
        setPhase("uptodate");
      }
    } catch {
      setPhase("error");
    }
  }, []);

  const install = useCallback(async () => {
    if (!updRef.current) return;
    setPhase("downloading");
    try {
      await updRef.current.downloadAndInstall();
      await relaunch();
    } catch {
      setPhase("error");
    }
  }, []);

  const dismiss = useCallback(() => setAvailable(null), []);

  return { available, phase, checkNow, install, dismiss };
}
