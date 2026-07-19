import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
// Type-only — erased at compile time, so this does NOT create a runtime
// import cycle with App.tsx (which imports CommandDeck as a value).
import type { SettingsCat } from "./App";
import VoicePacksPage from "./VoicePacksPage";
import {
  BuildAdvisorPage,
  HistoryPage,
  InsightsPage,
  LiveMatchPage
} from "./CompanionPages";
import { useCompanionData } from "./companion";
import AccountPage from "./AccountPage";
import StorePage from "./StorePage";
import WalletTab from "./WalletTab";
import InventoryTab from "./InventoryTab";
import LedgerTab from "./LedgerTab";
import { useProfile } from "./profile";
import { useAppUpdate } from "./useAppUpdate";
import type { VoiceState } from "./voice-types";
import MaidenLine from "./MaidenLine";
import { buildRegistry, matchCombo, type DeckActions, type DeckQuality } from "./shortcuts";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { IconVoice, IconSettings, IconAccount } from "./DeckIcons";
import "./styles.css";
import {
  DECK_PREFS_KEY,
  FUNG_PANEL_PATH,
  FUNG_PANEL_PATH_SIGNALS,
  loadDeckPrefs,
  snapScaleDown,
  snapScaleUp,
  type DeckPrefs
} from "./deck/prefs";
import { NAV, SETTINGS_CATS, WINDOW_SIZE_PRESETS } from "./deck/nav";
import { ShortcutSheet } from "./deck/ShortcutSheet";
import { DeckPrefsCard } from "./deck/DeckPrefsCard";
import { DeckTabs, FeedAgePill, PhaseChip } from "./deck/onair";
import { GMaidenFungDashboard, VolumeRail } from "./deck/FungDashboard";
import { SignalGrid } from "./deck/SignalGrid";

export default function CommandDeck({ renderSettings }: { renderSettings?: (cat: SettingsCat) => ReactNode } = {}) {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState(78);
  const [annEnabled, setAnnEnabled] = useState(true);
  const [signalEnabled, setSignalEnabled] = useState(true);
  const [voicePackName, setVoicePackName] = useState<string | null>(null);
  // CR-013 W1-01: in-page tabs — Live folds in Build, Insights folds in
  // History. Local to CommandDeck (same "single owner" shape as `tab` above);
  // no persistence, no URL sync — a page switch always lands on the default sub-tab.
  const [liveTab, setLiveTab] = useState("live"); // "live" | "build"
  const [insightsTab, setInsightsTab] = useState("overview"); // "overview" | "history"
  // CR-013 W4-01: G-Store's own in-page tabs (§5.1) — shop/wallet/inventory/
  // ledger, same "single local owner, no persistence" shape as liveTab/
  // insightsTab above. StorePage's internal "เติมเลย"/"แชร์แมตช์เพื่อได้ Shard
  // เพิ่ม" affordances now switch THIS tab (via onNavigateToWallet below)
  // instead of leaving the page to Account's Wallet/Ledger sub-tabs.
  const [storeTab, setStoreTab] = useState("shop"); // shop | wallet | inventory | ledger
  // CR-013 W2 (§4 iOS-style Settings split view): which category rail entry
  // is selected. "general" is CommandDeck-owned (deck prefs + window size —
  // never routed through Control); every other value is handed to
  // `renderSettings` so the legacy Control panel renders just that category.
  const [settingsCat, setSettingsCat] = useState<SettingsCat | "general">("general");
  // "ทั่วไป" window-size presets — same setSize(LogicalSize) pattern as
  // CompanionPages.tsx SettingsPage's applySize (that page is the pre-CR-013
  // fallback and is no longer reachable from the deck's Settings tab, but the
  // pattern is kept identical so behavior doesn't drift).
  const [activeWindowSize, setActiveWindowSize] = useState<string | null>(null);
  const applyWindowSize = async (preset: { label: string; w: number; h: number }) => {
    try {
      await getCurrentWindow().setSize(new LogicalSize(preset.w, preset.h));
      setActiveWindowSize(preset.label);
    } catch {
      /* not running under Tauri (browser dev) — nothing to resize */
    }
  };

  // CR-013 W2 gate fix (Opus F1): the in-app updater is owned here now (not the
  // per-category Control), so the launch auto-check fires and the banner shows
  // regardless of which settings category — or tab — the user is on.
  const update = useAppUpdate();
  const [appVersion, setAppVersion] = useState("");
  useEffect(() => {
    void (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        setAppVersion(await getVersion());
      } catch {
        /* browser dev — no Tauri app version */
      }
    })();
  }, []);
  const volumeDebounceRef = useRef<number | null>(null);
  // CR011-P4a-01: Maiden Line (Ctrl+K) + the shortcut sheet (Ctrl+Shift+/ / ?).
  // State lives here (CommandDeck is the single owner of tab/palette/sheet),
  // the components themselves are mounted as stage SIBLINGS below (window
  // space, never inside the scaled/clipped `.g-deck-stage`).
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // CR011-P4b-01: one shared context-menu instance for the whole deck — the
  // hero seat / utterance row / annunciator targets all open through it (see
  // ContextMenu.tsx), same "single owner" shape as palette/sheet above.
  const menu = useContextMenu();
  // CR011-P5 gate fix: account sub-tab deep-link (Store "เติมเหรียญ" -> Wallet).
  const [accountEntry, setAccountEntry] = useState<{ mode: "account" | "wallet" | "ledger"; n: number }>({ mode: "account", n: 0 });
  const navigateTo = (t: string, sub?: string) => {
    if (t === "account" && (sub === "wallet" || sub === "ledger" || sub === "account")) {
      setAccountEntry((prev) => ({ mode: sub, n: prev.n + 1 }));
    }
    setTab(t);
  };
  const { data } = useCompanionData();
  const { displayName, email } = useProfile();
  const gName = displayName || (email ? email.split("@")[0] : "Guest");
  const gSub = email || data.agentSector.title;

  // CR011-P6-01: deck comfort prefs (quality/density/crisp) — lazy-seeded from
  // localStorage once on mount (gm-deck-audio-rail pattern), persisted below.
  const [deckPrefs, setDeckPrefs] = useState<DeckPrefs>(loadDeckPrefs);
  useEffect(() => {
    try {
      localStorage.setItem(DECK_PREFS_KEY, JSON.stringify(deckPrefs));
    } catch {
      /* noop */
    }
  }, [deckPrefs]);

  // quality → gq-* class on <html>. Cinematic IS the :root default (owner
  // decision 2026-07-14) so it maps to NO class — this effect only ever
  // touches the gq-* names, preserving every other class on <html>
  // (.is-dragging lives there too).
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("gq-cinematic", "gq-balanced", "gq-eco");
    if (deckPrefs.quality === "balanced") root.classList.add("gq-balanced");
    else if (deckPrefs.quality === "eco") root.classList.add("gq-eco");
  }, [deckPrefs.quality]);

  // CR-011 §J glance mode ("house lights"): live match + window unfocused
  // >10s → `gm-glance` on the .g-deck root; any focus/input clears it
  // instantly. One timeout armed on blur — nothing ticks while focused (no
  // interval churn), and the effect tears its own timer down on phase change
  // or unmount.
  const [glance, setGlance] = useState(false);
  const matchPhase = data.match.matchPhase;
  useEffect(() => {
    if (matchPhase !== "live") {
      setGlance(false);
      return;
    }
    let timer: number | null = null;
    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
    const arm = () => {
      clearTimer();
      timer = window.setTimeout(() => setGlance(true), 10_000);
    };
    const disarm = () => {
      clearTimer();
      setGlance(false);
    };
    window.addEventListener("blur", arm);
    window.addEventListener("focus", disarm);
    // "remove instantly on input": pointer/keys reaching the webview count as
    // the user being back at the deck even if a focus event is swallowed.
    window.addEventListener("pointerdown", disarm);
    window.addEventListener("keydown", disarm);
    if (!document.hasFocus()) arm();
    return () => {
      window.removeEventListener("blur", arm);
      window.removeEventListener("focus", disarm);
      window.removeEventListener("pointerdown", disarm);
      window.removeEventListener("keydown", disarm);
      clearTimer();
    };
  }, [matchPhase]);

  // fixed 1420×760 stage (SSOT 03-layout.md) scaled to fill any window + rounded-fillet Subtract clip
  const stageRef = useRef<HTMLDivElement>(null);
  const crisp = deckPrefs.crisp;
  const bigMode = deckPrefs.bigMode;
  useEffect(() => {
    const apply = () => {
      const stage = stageRef.current;
      if (stage) {
        let s: number;
        const fit = Math.min(window.innerWidth / 1420, window.innerHeight / 760);
        if (bigMode && fit > 1.0) {
          // Boss 2026-07-16 "big mode": deliberate, explicit opt-out of the
          // CR-007 "never upscale" lock below — snaps UP to a fixed crisp
          // step instead of the locked 1.0 ceiling. ONLY takes this branch
          // when the window is actually bigger than the authored 1420×760
          // (fit > 1.0); a window smaller than that falls through to the
          // exact same downscale path as bigMode=false below — big mode
          // grows the deck when there's room, it doesn't change how a small
          // window behaves. snapScaleUp only ever returns a step <= fit, so
          // this can never overflow the window on any monitor.
          s = snapScaleUp(fit);
        } else {
          // CR-007 follow-up: never upscale past authored 1420×760 size — a >1.0
          // scale factor blows up 1px rims/text into fat blurry lines ("chunky"
          // feedback). Downscale for small windows still applies via the min().
          s = Math.min(fit, 1.0);
          // CR-011 §N crisp-text snap (opt-in): quantize the downscale to
          // 1.0/0.875/0.75/0.5 (letterboxing the remainder) so 1px lines stay
          // crisp — never snapping above the fit value.
          if (crisp) s = snapScaleDown(s);
        }
        stage.style.transform = `translate(-50%, -50%) scale(${s})`;
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [crisp, bigMode]);

  // CR-007 WP-4 Fix 1: the deck's audio rail is the SINGLE owner of volume,
  // signalEnabled, and announcerEnabled. It persists all three under one
  // localStorage key and pushes all three to the backend once on mount — the
  // persisted value is the seed (no `get_volume` round-trip needed, and it
  // fixes a real bug: a saved volume never used to reach the backend on a
  // cold start unless the user opened Settings, since Control's set_volume
  // effect only fired if/when its component mounted).
  useEffect(() => {
    let volume = 78;
    let ann = true;
    let signal = true;
    try {
      const raw = localStorage.getItem("gm-deck-audio-rail");
      if (raw) {
        const parsed = JSON.parse(raw) as { volume?: number; master?: number; annEnabled?: boolean; signalEnabled?: boolean };
        // `master` is the pre-WP-4 key name — read it so an upgrading user keeps their volume.
        const saved = typeof parsed.volume === "number" ? parsed.volume : parsed.master;
        if (typeof saved === "number") volume = saved;
        if (typeof parsed.annEnabled === "boolean") ann = parsed.annEnabled;
        if (typeof parsed.signalEnabled === "boolean") signal = parsed.signalEnabled;
      }
    } catch {
      /* noop */
    }
    setMasterVolume(volume);
    setAnnEnabled(ann);
    setSignalEnabled(signal);
    // Push the persisted values to the backend once on mount — the backend
    // has no way to recall a prior session's choice on its own (volume aside,
    // there is no get_announcer_enabled / get_cv_signal_enabled query command).
    void invoke("set_volume", { vol: volume }).catch(() => {});
    void invoke("set_announcer_enabled", { enabled: ann }).catch(() => {});
    void invoke("set_cv_signal_enabled", { enabled: signal }).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("gm-deck-audio-rail", JSON.stringify({ volume: masterVolume, annEnabled, signalEnabled }));
    } catch {
      /* noop */
    }
  }, [masterVolume, annEnabled, signalEnabled]);

  // Stay in sync when any OTHER surface (e.g. the legacy Control panel under
  // Settings, or the Alt+↑/↓/M global hotkeys) changes one of these three —
  // the backend emits *-change events for all three (main.rs) precisely so
  // no single owner can be silently desynced by another writer.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<number>("volume-change", (e) => setMasterVolume(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>("signal-change", (e) => setSignalEnabled(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<boolean>("announcer-change", (e) => setAnnEnabled(e.payload))
      .then((fn) => { unlisten = fn; })
      .catch(() => {
        /* not running under Tauri — ignore */
      });
    return () => unlisten?.();
  }, []);

  // CR-007 WP-4 Fix 5: clear any in-flight volume debounce on unmount so a
  // stale timer never fires `set_volume` against an unmounted deck.
  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current !== null) window.clearTimeout(volumeDebounceRef.current);
    };
  }, []);

  // Companion State "Voice" tile — active announcer pack name, fetched once.
  useEffect(() => {
    invoke<VoiceState>("voice_api_state")
      .then((s) => setVoicePackName(s.activePack?.name ?? null))
      .catch(() => setVoicePackName(null));
  }, []);

  const handleVolumeChange = (value: number) => {
    setMasterVolume(value);
    if (volumeDebounceRef.current !== null) window.clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = window.setTimeout(() => {
      void invoke("set_volume", { vol: value }).catch(() => {});
    }, 80);
  };

  const handleAnnToggle = () => {
    setAnnEnabled((prev) => {
      const next = !prev;
      void invoke("set_announcer_enabled", { enabled: next }).catch(() => {});
      return next;
    });
  };

  const handleSignalToggle = () => {
    setSignalEnabled((prev) => {
      const next = !prev;
      void invoke("set_cv_signal_enabled", { enabled: next }).catch(() => {});
      return next;
    });
  };

  // CR011-P4a-01: DeckActions bridges the shortcuts.ts registry + Maiden Line
  // to this component's existing state/handlers — reused, never duplicated.
  const deckActions: DeckActions = {
    setTab,
    openPalette: () => setPaletteOpen(true),
    openSheet: () => {
      setPaletteOpen(false);
      setSheetOpen(true);
    },
    closeOverlays: () => {
      setPaletteOpen(false);
      setSheetOpen(false);
      // Catch-all: a menu whose focus never entered it (all-disabled items, or
      // the focused row churned away) can't see its own Esc — the global Esc
      // must be able to kill it (Opus gate, CR011-P4b).
      menu.close();
    },
    toggleAnn: handleAnnToggle,
    toggleSignal: handleSignalToggle,
    // CR011-P4b-01: F6/Shift+F6 seat cycling — walks the `[data-seat]`
    // sections in DOM order (they only exist while tab === "dashboard", so
    // this safely no-ops with zero matches on every other page).
    focusSeat: (dir) => {
      const seats = Array.from(document.querySelectorAll<HTMLElement>("[data-seat]"));
      if (seats.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? seats.indexOf(active) : -1;
      const next = idx === -1 ? (dir === 1 ? 0 : seats.length - 1) : (idx + dir + seats.length) % seats.length;
      seats[next]?.focus();
    },
    // CR011-P4b-01: intentionally a no-op — see the DeckActions doc comment
    // in shortcuts.ts. The three real menu targets already open their menu
    // the instant Shift+F10 fires while THEY have focus (ContextMenu.tsx's
    // `openFromKeyboard` stops propagation before this global listener ever
    // sees the keystroke), so this only runs when focus is somewhere with no
    // menu wired — where doing nothing is the honest behavior, not a stub.
    openContextMenuAtFocus: () => {},
    // CR011-P6-01: gm-deck-prefs writers — the palette (quality entries) and
    // Ctrl+D (density) route through the same single prefs store as the
    // Settings deck card, so no surface can desync another.
    setQuality: (q: DeckQuality) => setDeckPrefs((p) => (p.quality === q ? p : { ...p, quality: q })),
    toggleDensity: () =>
      setDeckPrefs((p) => ({ ...p, density: p.density === "compact" ? "comfortable" : "compact" })),
  };

  // The registry itself is static (no closures over component state — see
  // shortcuts.ts), so it's built once. The single window keydown listener
  // below reads the LATEST deckActions/paletteOpen via refs instead of
  // depending on them, so it can be registered once and cleaned up once
  // (never re-added on every render/state change).
  const registry = useMemo(() => buildRegistry(), []);

  const deckActionsRef = useRef<DeckActions>(deckActions);
  useEffect(() => {
    deckActionsRef.current = deckActions;
  });

  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => {
    paletteOpenRef.current = paletteOpen;
  }, [paletteOpen]);

  // CR011-P4a-01: ONE window keydown listener, registered once and cleaned
  // up on unmount — routes every keystroke through the single-source
  // registry. Ignores keystrokes while focus sits in an
  // input/textarea/contenteditable EXCEPT Ctrl-combos, so typing (e.g. the
  // Steam-link field, or Maiden Line's own filter input) never fires a
  // page-switch shortcut by accident, while Ctrl+1..8/Ctrl+K/Ctrl+Shift+/
  // still work everywhere. Esc is deliberately NOT routed here when a
  // component with input focus wants it first (MaidenLine's arm/disarm
  // nuance) — that component calls stopPropagation on its own Escape
  // handling; this listener is what closes the shortcut sheet (no input to
  // steal focus) and acts as the Esc fallback everywhere else.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isEditable =
        !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isEditable && !e.ctrlKey && !e.metaKey) return;
      for (const def of registry) {
        if (def.when === "palette-closed" && paletteOpenRef.current) continue;
        if (matchCombo(e, def.combo)) {
          e.preventDefault();
          def.run(deckActionsRef.current);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [registry]);

  const error: string | null = null;
  const trayWindow = () => { try { void getCurrentWindow().hide(); } catch { /* noop */ } };
  const quitWindow = () => { void invoke("quit_application").catch(() => {}); };
  // CR-007 WP-2: suppress backdrop-filter/box-shadow while the native drag is in
  // flight (see .is-dragging in styles.css) — WebView2 recomposites those large
  // translucent/shadowed layers on every window-move tick, which is the drag lag.
  // Native window-drag swallows the mouse, so `mouseup` frequently never reaches
  // the webview; blur->focus and an 8s safety timeout are both needed as backstops
  // so the class can never get stuck on.
  const startWindowDrag = () => {
    const root = document.documentElement;
    root.classList.add("is-dragging");

    let cleaned = false;

    const onFocusAfterBlur = () => {
      window.removeEventListener("focus", onFocusAfterBlur);
      cleanup();
    };
    const onBlur = () => {
      window.addEventListener("focus", onFocusAfterBlur);
    };
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      root.classList.remove("is-dragging");
      window.removeEventListener("mouseup", cleanup);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocusAfterBlur);
      window.clearTimeout(safetyTimer);
    };

    window.addEventListener("mouseup", cleanup);
    window.addEventListener("blur", onBlur);
    const safetyTimer = window.setTimeout(cleanup, 8000);

    try {
      void getCurrentWindow().startDragging();
    } catch {
      cleanup();
    }
  };
  const dragFromSurface = (event: React.MouseEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, [data-no-drag='true']")) return;
    startWindowDrag();
  };

  return (
    <div
      className={`app deck-v3 g-deck${deckPrefs.density === "compact" ? " gm-compact" : ""}${glance ? " gm-glance" : ""}`}
    >
      <div className="g-deck-bg" />

      <div className="g-deck-stage" ref={stageRef}>
      <div className="g-l1-white-glass" aria-hidden="true" />
      <svg className="g-clip-defs" width="0" height="0" viewBox="0 0 1280 720" aria-hidden="true" focusable="false">
        <defs>
          <path id="gSubtractPanelPath" d={tab === "dashboard" ? FUNG_PANEL_PATH_SIGNALS : FUNG_PANEL_PATH} />
          <clipPath id="gPanelClip" clipPathUnits="userSpaceOnUse">
            <use href="#gSubtractPanelPath" />
          </clipPath>
        </defs>
      </svg>
      {/* sidebar FAB — icon nav */}
      <aside className="g-sidebar-fab" onMouseDown={dragFromSurface}>
        <div className="g-brand" title="G-Maiden">G</div>
        <nav>
          {NAV.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`g-nav-item${tab === key ? " active" : ""}`}
              title={label}
              aria-label={label}
              onClick={() => setTab(key)}
            >
              <Icon size={20} />
            </button>
          ))}
        </nav>
      </aside>

      <div className={`g-power-radial${powerOpen ? " open" : ""}`}>
        <button
          type="button"
          className="g-power-main"
          aria-label="Power menu"
          title="Power menu"
          onClick={() => setPowerOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3v8" />
            <path d="M6.3 7.8a8 8 0 1 0 11.4 0" />
          </svg>
        </button>
        <div className="g-power-menu" aria-hidden={!powerOpen}>
          <button type="button" className="g-power-action tray" title="Tray mode" aria-label="Tray mode" onClick={trayWindow}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 7.5h14v7H5z" />
              <path d="M9 11h6" />
              <path d="M8 17h8" />
            </svg>
          </button>
          <button type="button" className="g-power-action quit" title="Quit application" aria-label="Quit application" onClick={quitWindow}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <button
            type="button"
            className="g-power-action drag"
            title="Hold and drag window"
            aria-label="Hold and drag window"
            onMouseDown={(event) => {
              event.preventDefault();
              if (event.button !== 0) return;
              startWindowDrag();
            }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 4v16M16 4v16" />
              <path d="M4 8h16M4 16h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* topbar FAB — brand + telemetry + profile + window controls */}
      <header className="g-topbar-fab" data-tauri-drag-region="" onMouseDown={dragFromSurface}>
        <span className="g-logo">G-MAIDEN</span>

        <div className="g-topbar-status">
          <div className={`g-status-pill${data.match.gsiOnline ? " online" : ""}`}>
            <span className="dot" />
            <strong>{data.match.gsiOnline ? "GSI Online" : "GSI Offline"}</strong>
          </div>
          <FeedAgePill updatedAt={data.updatedAt} online={data.match.gsiOnline} />
        </div>

        <div className={`profile-wrap${profileOpen ? " open" : ""}`}>
          <button className="profile-trigger" type="button" onClick={() => setProfileOpen((o) => !o)}>
            <span className="profile-core">{gName.charAt(0).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{gName}</strong>
              <small>{gSub}</small>
            </span>
            <span className="profile-caret">▾</span>
          </button>
          {profileOpen ? (
            <div className="profile-dropdown">
              <button type="button" onClick={() => { setTab("account"); setProfileOpen(false); }}><span className="dd-icon"><IconAccount size={14} /></span>Account &amp; Steam</button>
              <button type="button" onClick={() => { setTab("voice"); setProfileOpen(false); }}><span className="dd-icon"><IconVoice size={14} /></span>Voice Packs</button>
              <div className="dd-sep" />
              <button type="button" onClick={() => { setTab("settings"); setProfileOpen(false); }}><span className="dd-icon"><IconSettings size={14} /></span>Settings</button>
            </div>
          ) : null}
        </div>

      </header>

      {/* Audio rail replaces the old P-section. The match-phase badge rides
          just above it (Boss 2026-07-14 — moved out of the score header). */}
      {tab === "dashboard" && (
        <div className="g-audio-rail" onMouseDown={dragFromSurface}>
          <PhaseChip phase={data.match.matchPhase} />
          <VolumeRail
            value={masterVolume}
            annEnabled={annEnabled}
            signalEnabled={signalEnabled}
            onVolumeChange={handleVolumeChange}
            onAnnToggle={handleAnnToggle}
            onSignalToggle={handleSignalToggle}
          />
        </div>
      )}

      {/* glass panel — hosts the active tab (rich, live-wired content preserved) */}
      <main className="g-deck-panel">
        {error ? <div className="banner err">engine offline ({error})</div> : null}
        <div className={`surface page-${tab}${tab === "settings" ? " settings-split-mode" : ""}`}>
          {tab === "dashboard" && (
            <GMaidenFungDashboard
              data={data}
              voicePackName={voicePackName}
              signalEnabled={signalEnabled}
              annEnabled={annEnabled}
              masterVolume={masterVolume}
              menu={menu}
            />
          )}
          {tab === "live" && (
            <div className="deck-tabbed">
              <DeckTabs
                tabs={[
                  { key: "live", label: "สด" },
                  { key: "build", label: "บิลด์" }
                ]}
                active={liveTab}
                onChange={setLiveTab}
              />
              <div className="deck-tabbed-body">
                {liveTab === "live" ? <LiveMatchPage /> : <BuildAdvisorPage />}
              </div>
            </div>
          )}
          {tab === "voice" && <VoicePacksPage onNavigate={navigateTo} />}
          {tab === "store" && (
            <div className="deck-tabbed">
              <DeckTabs
                tabs={[
                  { key: "shop", label: "ร้านค้า" },
                  { key: "wallet", label: "กระเป๋า" },
                  { key: "inventory", label: "คลัง" },
                  { key: "ledger", label: "บันทึก" }
                ]}
                active={storeTab}
                onChange={setStoreTab}
              />
              <div className="deck-tabbed-body">
                {storeTab === "shop" && (
                  <StorePage
                    onNavigateToWallet={() => setStoreTab("wallet")}
                    onRequestSignIn={() => navigateTo("account", "account")}
                  />
                )}
                {storeTab === "wallet" && <WalletTab onViewAllTransactions={() => setStoreTab("ledger")} />}
                {storeTab === "inventory" && <InventoryTab onActivated={() => navigateTo("voice")} />}
                {storeTab === "ledger" && <LedgerTab />}
              </div>
            </div>
          )}
          {tab === "insights" && (
            <div className="deck-tabbed">
              {/* CR-013 W1 gate fix (Opus): InsightsPage already renders the
                  weekly-report section inline, so a separate "รายสัปดาห์" tab
                  showed byte-identical content — a dead pill. Dropped until a
                  distinct weekly view exists (buildWeekly.ts is scaffolded).
                  Tabs are ภาพรวม / ประวัติ only. */}
              <DeckTabs
                tabs={[
                  { key: "overview", label: "ภาพรวม" },
                  { key: "history", label: "ประวัติ" }
                ]}
                active={insightsTab}
                onChange={setInsightsTab}
              />
              <div className="deck-tabbed-body">
                {insightsTab === "history" ? <HistoryPage /> : <InsightsPage />}
              </div>
            </div>
          )}
          {tab === "account" && <AccountPage entryMode={accountEntry.mode} entryNonce={accountEntry.n} />}
          {tab === "settings" && (
            <div className="settings-split">
              <nav className="settings-cats" aria-label="หมวดตั้งค่า">
                {SETTINGS_CATS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className={`settings-cat${settingsCat === c.key ? " on" : ""}`}
                    aria-pressed={settingsCat === c.key}
                    onClick={() => setSettingsCat(c.key)}
                  >
                    <span className="settings-cat-glyph" aria-hidden="true">{c.glyph}</span>
                    <span className="settings-cat-copy">
                      <span className="settings-cat-label">{c.label}</span>
                      <span className="settings-cat-sub">{c.sub}</span>
                    </span>
                  </button>
                ))}
              </nav>
              <div className="settings-detail">
                {/* CR-013 W2 gate fix (Opus F1): the update banner is app-level,
                    not per-category — it renders at the top of the detail pane on
                    EVERY settings category (and the launch auto-check in
                    useAppUpdate fires regardless of where the user is). */}
                {update.available && (
                  <div className="settings-update-banner" role="status">
                    <span className="settings-update-spark" aria-hidden="true">✨</span>
                    <div className="settings-update-copy">
                      <strong>มีเวอร์ชันใหม่ {update.available.version}</strong>
                      <span>
                        {update.phase === "downloading"
                          ? "กำลังดาวน์โหลดและติดตั้ง… แอปจะรีสตาร์ทเอง"
                          : update.available.notes || "อัปเดตแล้วแอปจะรีสตาร์ทให้อัตโนมัติ"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="settings-update-install"
                      onClick={() => void update.install()}
                      disabled={update.phase === "downloading"}
                    >
                      {update.phase === "downloading" ? "กำลังอัปเดต…" : "อัปเดตเลย"}
                    </button>
                    <button
                      type="button"
                      className="settings-update-later"
                      onClick={update.dismiss}
                      disabled={update.phase === "downloading"}
                    >
                      ภายหลัง
                    </button>
                  </div>
                )}
                {settingsCat === "general" ? (
                  <div className="settings-detail-body">
                    {/* CR011-P6-01: quality/density/crisp/big-mode live with the
                        deck, not the legacy Control panel — unchanged handlers,
                        just re-homed from "always visible above Settings" into
                        the "ทั่วไป" category (CR-013 W2 §4.3). */}
                    <DeckPrefsCard
                      prefs={deckPrefs}
                      onQuality={(q) => deckActions.setQuality(q)}
                      onDensity={(d) => setDeckPrefs((p) => (p.density === d ? p : { ...p, density: d }))}
                      onCrispToggle={() => setDeckPrefs((p) => ({ ...p, crisp: !p.crisp }))}
                      onBigModeToggle={() => setDeckPrefs((p) => ({ ...p, bigMode: !p.bigMode }))}
                    />
                    <section className="settings-group">
                      <div className="settings-group-head">ขนาดหน้าต่าง</div>
                      <div className="settings-row">
                        <span className="settings-row-label">พรีเซ็ต</span>
                        <div className="settings-winpresets" role="group" aria-label="ขนาดหน้าต่าง">
                          {WINDOW_SIZE_PRESETS.map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              className={`settings-winpreset${activeWindowSize === p.label ? " active" : ""}`}
                              onClick={() => void applyWindowSize(p)}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="settings-foot">ปรับขนาดหน้าต่างจริงของแอป (ไม่ใช่การซูมภายในเดค)</p>
                    </section>
                    {/* CR-013 W2 gate fix (Opus F1): version + manual update check
                        re-homed from Control's "system" category into ทั่วไป (the
                        iOS "General/About" grouping), so it lives with the always-
                        visible banner above rather than being buried. */}
                    <section className="settings-group">
                      <div className="settings-group-head">เวอร์ชัน &amp; อัปเดต</div>
                      <div className="settings-row">
                        <span className="settings-row-label">เวอร์ชันปัจจุบัน</span>
                        <span className="settings-row-value">{appVersion ? `v${appVersion}` : "—"}</span>
                      </div>
                      <div className="settings-row">
                        <span className="settings-row-label">ตรวจหาอัปเดต</span>
                        <button
                          type="button"
                          className="settings-winpreset"
                          onClick={() => void update.checkNow()}
                          disabled={update.phase === "checking" || update.phase === "downloading"}
                        >
                          {update.phase === "checking"
                            ? "กำลังตรวจ…"
                            : update.phase === "uptodate"
                              ? "เป็นเวอร์ชันล่าสุด ✓"
                              : update.phase === "error"
                                ? "ตรวจไม่สำเร็จ"
                                : "ตรวจหาอัปเดต"}
                        </button>
                      </div>
                      <p className="settings-foot">อัปเดตผ่านตัวติดตั้งที่เซ็นแล้วจาก GitHub Releases โดยอัตโนมัติ</p>
                    </section>
                  </div>
                ) : (
                  renderSettings?.(settingsCat) ?? (
                    <div className="settings-detail-body">
                      <p className="settings-foot">หมวดนี้ยังไม่พร้อมใช้งาน</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Panel rim — g-deck-stage sibling of g-deck-panel, NOT a child. .g-deck-panel has
          overflow:hidden + contain:paint + clip-path, so a filter/drop-shadow on a child
          of it is clipped to the panel silhouette and never reaches the background. As a
          stage sibling positioned to exactly overlay the panel (same box, same shared
          #gSubtractPanelPath def above), its drop-shadow feathers outward past the
          notches instead of being clipped away with the panel. Same escape pattern as
          SignalGrid below. */}
      <svg className="g-panel-rim" viewBox="0 0 1280 720" aria-hidden="true" focusable="false">
        <use href="#gSubtractPanelPath" />
      </svg>

      {/* G-Signal cluster (D/E/F/G) — stage-level sibling of g-deck-panel, NOT a child.
          It must live outside the clipped panel so it renders inside the bottom-right
          subtract notch (FUNG_PANEL_PATH_SIGNALS) instead of being clipped away with it. */}
      {tab === "dashboard" && <SignalGrid signals={data.signals} menu={menu} />}
      </div>{/* /g-deck-stage */}

      {/* CR011-P4b-01: the context-menu primitive floats in WINDOW space too
          (see ContextMenu.tsx doc comment) — mounted here as a stage sibling,
          same convention as Maiden Line / the shortcut sheet just below. */}
      <ContextMenu state={menu.state} onClose={menu.close} />

      {/* CR-011 §M/§L — Maiden Line + the shortcut sheet float in WINDOW space:
          mounted here as siblings of .g-deck-stage (which carries the scale
          transform), never inside it, so they never shrink/shift with the
          1420×760 authored stage. */}
      <MaidenLine
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpenSheet={() => {
          setPaletteOpen(false);
          setSheetOpen(true);
        }}
        actions={deckActions}
        matchPhase={data.match.matchPhase}
        quality={deckPrefs.quality}
      />
      <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} registry={registry} />
    </div>
  );
}
