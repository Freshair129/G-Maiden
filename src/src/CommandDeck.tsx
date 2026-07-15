import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import VoicePacksPage from "./VoicePacksPage";
import QuotaCard from "./QuotaCard";
import {
  BuildAdvisorPage,
  HistoryPage,
  InsightsPage,
  LiveMatchPage,
  SettingsPage
} from "./CompanionPages";
import { useCompanionData, useMinimapImage, toneClass, formatKda, type CompanionData } from "./companion";
import type { MatchPhase } from "./live/phase";
import { heroPortraitUrl } from "./heroPortrait";
import AccountPage from "./AccountPage";
import { useProfile } from "./profile";
import type { VoiceState } from "./voice-types";
import MaidenLine from "./MaidenLine";
import { buildRegistry, matchCombo, PAGES, type DeckActions, type ShortcutDef } from "./shortcuts";
import {
  ContextMenu,
  useContextMenu,
  type ContextMenuController,
  type ContextMenuEntry
} from "./ContextMenu";
import {
  IconDashboard,
  IconLive,
  IconVoice,
  IconBuild,
  IconInsights,
  IconSettings,
  IconAccount
} from "./DeckIcons";
import "./styles.css";

/** CR-011 §L "Global (ทำงานแม้อยู่ในเกม)" table — the Rust-owned global
 *  shortcuts (tauri_plugin_global_shortcut, main.rs). These are NOT in the
 *  shortcuts.ts registry (that registry is in-app-only, routed through this
 *  component's own keydown listener) — they're listed here purely so the
 *  shortcut sheet can document them alongside the in-app ones, per CLAUDE.md's
 *  hotkey table. Never rebind these in-app. */
const GLOBAL_HOTKEYS: Array<{ combo: string; labelTh: string }> = [
  { combo: "Ctrl+Alt+S", labelTh: "ซ่อน/แสดง overlay" },
  { combo: "Alt+↑ / Alt+↓", labelTh: "เพิ่ม/ลดระดับเสียง ±10%" },
  { combo: "Alt+M", labelTh: "ปิด/เปิดเสียง (mute toggle)" },
];

const FUNG_PANEL_PATH =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";

// dashboard-only variant — CR-007 WP-1: adds the bottom-right subtract notch so the
// G-Signal cluster (D/E/F/G) sits in a real void instead of floating on solid glass.
// Same 12px-margin rhythm as the top-right topbar notch; 20px fillets throughout.
// Only used while tab === "dashboard" (the only tab that renders the signal cluster) —
// every other tab keeps the plain FUNG_PANEL_PATH so no stray hole appears.
const FUNG_PANEL_PATH_SIGNALS =
  "M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 488 A 20 20 0 0 1 1248,508 H 836 A 20 20 0 0 0 816,528 V 688 A 20 20 0 0 1 796,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z";

// history has no codex glyph — tiny inline fallback
function IconHistory({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 5v3.5H7" /><path d="M12 8v4l2.5 1.5" />
    </svg>
  );
}

// CR011-P5 gate fix: NAV is DERIVED from shortcuts.ts PAGES — the two arrays
// were hand-aligned duplicates and nothing guarded the alignment (the old
// comment claimed tests did; they did not). Now Ctrl+1..8, the palette, the
// sheet, and the rail literally cannot drift: one array, one icon map.
const NAV_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  dashboard: IconDashboard,
  live: IconLive,
  voice: IconVoice,
  build: IconBuild,
  insights: IconInsights,
  history: IconHistory,
  account: IconAccount,
  settings: IconSettings
};
const NAV: Array<{ key: string; label: string; Icon: (p: { size?: number }) => ReactNode }> =
  PAGES.map((p) => ({ key: p.key, label: p.label, Icon: NAV_ICONS[p.key] ?? IconDashboard }));

export default function CommandDeck({ settingsPanel }: { settingsPanel?: ReactNode } = {}) {
  const [tab, setTab] = useState("dashboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [powerOpen, setPowerOpen] = useState(false);
  const [masterVolume, setMasterVolume] = useState(78);
  const [annEnabled, setAnnEnabled] = useState(true);
  const [signalEnabled, setSignalEnabled] = useState(true);
  const [voicePackName, setVoicePackName] = useState<string | null>(null);
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

  // fixed 1420×760 stage (SSOT 03-layout.md) scaled to fill any window + rounded-fillet Subtract clip
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const apply = () => {
      const stage = stageRef.current;
      if (stage) {
        // CR-007 follow-up: never upscale past authored 1420×760 size — a >1.0
        // scale factor blows up 1px rims/text into fat blurry lines ("chunky"
        // feedback). Downscale for small windows still applies via the min().
        const s = Math.min(window.innerWidth / 1420, window.innerHeight / 760, 1.0);
        stage.style.transform = `translate(-50%, -50%) scale(${s})`;
      }
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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
    <div className="app deck-v3 g-deck">
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

      {/* Audio rail replaces the old P-section */}
      {tab === "dashboard" && (
        <div className="g-audio-rail" onMouseDown={dragFromSurface}>
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
        <div className={`surface page-${tab}`}>
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
          {tab === "live" && <LiveMatchPage />}
          {tab === "voice" && <VoicePacksPage onNavigate={navigateTo} />}
          {tab === "build" && <BuildAdvisorPage />}
          {tab === "insights" && <InsightsPage />}
          {tab === "history" && <HistoryPage />}
          {tab === "account" && <AccountPage entryMode={accountEntry.mode} entryNonce={accountEntry.n} />}
          {tab === "settings" && (
            settingsPanel ?? (
              <div style={{ display: "grid", gap: 16 }}>
                <SettingsPage />
                <QuotaCard />
              </div>
            )
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
      />
      <ShortcutSheet open={sheetOpen} onClose={() => setSheetOpen(false)} registry={registry} />
    </div>
  );
}

/** CR-011 §L: the shortcut sheet, generated FROM the shortcuts.ts registry
 *  (single source, no hand-copied list) plus the Rust-owned GLOBAL_HOTKEYS
 *  table above. Same console-glass material as Maiden Line; Esc closes it via
 *  CommandDeck's global keydown listener (registry's "close-overlay" entry —
 *  this component has no input to steal Escape, unlike MaidenLine). */
function ShortcutSheet({ open, onClose, registry }: { open: boolean; onClose: () => void; registry: ShortcutDef[] }) {
  // Take focus on open: an aria-modal dialog that never receives focus leaves
  // keyboard/screen-reader users interacting with a background the a11y tree
  // claims is inert (Opus gate, CR011-P4a). Full focus trap = later polish.
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) sheetRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="gm-sheet-backdrop" onClick={onClose}>
      <div ref={sheetRef} tabIndex={-1} className="gm-sheet" role="dialog" aria-modal="true" aria-label="Shortcuts" onClick={(e) => e.stopPropagation()}>
        <div className="gm-sheet-head">
          <span>คีย์ลัด (Shortcuts)</span>
          <button type="button" className="gm-sheet-close" onClick={onClose} aria-label="ปิด">×</button>
        </div>
        <div>
          <div className="gm-sheet-section-label">In-app</div>
          {registry.map((def) => (
            <div key={def.id} className="gm-sheet-row">
              <span>{def.labelTh}</span>
              <span className="gm-sheet-row-combo">{def.combo}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="gm-sheet-section-label">Global (ทำงานแม้อยู่ในเกม)</div>
          {GLOBAL_HOTKEYS.map((hk) => (
            <div key={hk.combo} className="gm-sheet-row">
              <span>{hk.labelTh}</span>
              <span className="gm-sheet-row-combo">{hk.combo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Honest replacement for the old permanent "—" ping readout: GSI has no ping
 *  field at all, so instead of faking one we show how stale the last data tick
 *  is. Ticks its own 1s interval locally (not from useCompanionData) so this
 *  is the only thing in the topbar re-rendering every second, not the whole
 *  deck. See CR-011 §B for the feed-age rationale. */
function FeedAgePill({ updatedAt, online }: { updatedAt: number; online: boolean }) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  let value = "—";
  if (online && updatedAt > 0) {
    const age = Date.now() - updatedAt;
    value = age < 1000 ? "<1s" : `${Math.min(99, Math.round(age / 1000))}s`;
  }

  return (
    // No text label: the topbar is a fixed 446px contain:paint box — a "FEED" span
    // (~40px) risks clipping the profile trigger (Opus gate, CR011-P1). Icon + value
    // only, like the old ping pill. Tooltip says "sync" not "GSI tick": updatedAt is
    // stamped on ANY snapshot rebuild (incl. resource-stats), not GSI ticks alone.
    <div className="g-ping-pill" title="เวลาตั้งแต่ sync ข้อมูลล่าสุดจาก backend (GSI ไม่มีค่า ping จริง)">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 18h2" />
        <path d="M9 14h2" />
        <path d="M13 10h2" />
        <path d="M17 6h2" />
      </svg>
      <strong>{value}</strong>
    </div>
  );
}

/** Game-momentum meter + laning/mid/late phase chip. Signed bar grows right
 *  (green, we're ahead) or left (red, behind) from centre; value is the proxy
 *  from companion.momentum (kill lead + teamfight swing). See buildMomentum.ts. */
function MomentumMeter({ momentum }: { momentum: CompanionData["momentum"] }) {
  const v = Math.max(-100, Math.min(100, momentum.value));
  const mag = Math.min(50, Math.abs(v) / 2); // % of the half-track
  const fill = v >= 0 ? { left: "50%", width: `${mag}%` } : { left: `${50 - mag}%`, width: `${mag}%` };
  return (
    <section className="gm-momentum" data-seat="momentum" tabIndex={-1}>
      <div className="gm-mom-head">
        <span className="gm-mom-phase">{momentum.phaseLabel}</span>
        <span className="gm-mom-title">MOMENTUM</span>
        <span className={`gm-mom-label ${toneClass(momentum.tone)}`}>{momentum.label}</span>
      </div>
      <div className="gm-mom-track">
        <span className="gm-mom-center" />
        <span className={`gm-mom-fill ${v >= 0 ? "pos" : "neg"}`} style={fill} />
      </div>
    </section>
  );
}

/** Live mirror of the real in-game minimap (captured + downscaled by the DXGI CV
 *  pipeline, arrives as a base64 PNG on `minimap-frame`). Falls back to the
 *  decorative grid before the first frame / when capture is in Lite mode. Its own
 *  hook keeps the ≈2 Hz image refresh from re-rendering the rest of the deck. */
function MinimapMirror() {
  const image = useMinimapImage();
  return (
    <div className={`gm-minimap${image ? " gm-minimap-live" : ""}`}>
      {image ? (
        <img className="gm-minimap-img" src={image} alt="In-game minimap" draggable={false} />
      ) : (
        <>
          <div className="gm-map-grid" />
          <div className="gm-river" />
          <span className="gm-orb orb-a" />
          <span className="gm-orb orb-b" />
          <span className="gm-orb orb-c" />
        </>
      )}
    </div>
  );
}

const UTT_SOURCE_LABEL: Record<"signal" | "master" | "announcer", string> = {
  signal: "SIGNAL",
  master: "MASTER",
  announcer: "ANN"
};

/** Text copied by the utterance row's "คัดลอกข้อความ" context-menu item —
 *  includes the retracted prefix when the line is a belief-revision, so the
 *  copy reflects what was actually said (both the retraction and the
 *  correction), not just the final text (CR011-P4b-01). */
function utteranceCopyText(u: CompanionData["utterances"][number]): string {
  if (u.kind === "revision" && u.retracted) return `${u.retracted} → ${u.text}`;
  return u.text;
}

function utteranceMenuItems(u: CompanionData["utterances"][number]): ContextMenuEntry[] {
  return [
    {
      id: "utt-copy",
      label: "คัดลอกข้อความ",
      run: () => {
        void navigator.clipboard?.writeText(utteranceCopyText(u)).catch(() => {});
      }
    }
  ];
}

/** CR-011 §B: the agent sector reborn as an utterance ledger — Maiden's
 *  presence as what she said, when, and where she corrected herself, instead
 *  of a static art block. Renders inside the frozen `.gm-agent-card` box
 *  (440x354, geometry untouched) via new `gm-onair-*` classes only. */
function OnAirConsole({ data, menu }: { data: CompanionData; menu: ContextMenuController }) {
  const list = data.utterances;
  const newest = list[0] ?? null;
  const rest = list.slice(1);
  // Backend chip: the newest MASTER-sourced line tells us which engine answered
  // ("ollama" = the local-SLM fallback, anything else = the cloud path).
  const latestMaster = list.find((u) => u.source === "master");
  const isLocalSlm = latestMaster?.meta === "ollama";
  const tallyOn = data.match.gsiOnline;

  return (
    <div className="gm-onair">
      <div className="gm-onair-head">
        <span className={`gm-tally${tallyOn ? " gm-tally-onair" : ""}`} />
        <b className="gm-onair-title">ON AIR — MAIDEN</b>
        <span className="gm-onair-end">
          <span className={`gm-onair-chip ${isLocalSlm ? "gm-onair-chip-local" : "gm-onair-chip-cloud"}`}>
            {isLocalSlm ? "LOCAL SLM" : "CLOUD"}
          </span>
          <span className="gm-onair-agent">{data.agentSector.name}</span>
        </span>
      </div>

      {newest ? (
        <div
          className="gm-onair-now"
          tabIndex={0}
          onContextMenu={(e) => menu.openFromMouseEvent(e, utteranceMenuItems(newest))}
          onKeyDown={(e) => menu.openFromKeyboard(e, utteranceMenuItems(newest))}
        >
          <span className="gm-onair-now-meta">{newest.timeLabel} · {UTT_SOURCE_LABEL[newest.source]}</span>
          <p className="gm-onair-now-text">
            {/* Belief revision is the headline signature — the strikethrough must
                show at the most prominent slot too, not only in the log rows
                (Opus gate, CR011-P2). */}
            {newest.kind === "revision" && newest.retracted ? (
              <>
                <s className="gm-onair-retract">{newest.retracted}</s> <b>{newest.text}</b>
              </>
            ) : (
              newest.text
            )}
            {newest.source === "announcer" && newest.meta ? (
              <span className="gm-onair-pack"> — แพ็ก {newest.meta}</span>
            ) : null}
          </p>
        </div>
      ) : (
        <div className="gm-onair-empty">
          ยังไม่มีเสียงพูดในเซสชันนี้ — เข้าเกมแล้ว Maiden จะเริ่มรายงานที่นี่
        </div>
      )}

      <div className="gm-onair-log">
        {rest.map((u) => (
          <div
            key={u.id}
            className="gm-onair-row"
            tabIndex={0}
            onContextMenu={(e) => menu.openFromMouseEvent(e, utteranceMenuItems(u))}
            onKeyDown={(e) => menu.openFromKeyboard(e, utteranceMenuItems(u))}
          >
            <span className="gm-onair-row-time">{u.timeLabel}</span>
            <span className={`gm-onair-row-chip gm-onair-row-chip-${u.source}`}>{UTT_SOURCE_LABEL[u.source]}</span>
            <p className="gm-onair-row-text">
              {u.kind === "revision" && u.retracted ? (
                <>
                  <s className="gm-onair-retract">{u.retracted}</s> <b>{u.text}</b>
                </>
              ) : (
                u.text
              )}
              {u.source === "announcer" && u.meta ? (
                <span className="gm-onair-pack"> — แพ็ก {u.meta}</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

const PHASE_LABEL: Record<MatchPhase, string> = {
  standby: "STANDBY",
  prep: "PREP",
  live: "LIVE",
  debrief: "DEBRIEF"
};

/** CR-011 §D/§E: the score header's phase axis chip — STANDBY/PREP/LIVE/DEBRIEF.
 *  `.gm-score-header` is a fixed 640x48 box laid out as a 3-column grid (left
 *  score / clock / right score) with almost no horizontal slack between the
 *  clock and the right-side score text, so this renders absolutely positioned
 *  (the header is itself `position:absolute`, i.e. already a containing block
 *  for this) along the header's bottom edge — clear of the horizontally-
 *  centered score/clock text above it, never shifting or wrapping them. */
function PhaseChip({ phase }: { phase: MatchPhase }) {
  return <span className={`gm-phase-chip gm-phase-chip-${phase}`}>{PHASE_LABEL[phase]}</span>;
}

/** CR-011 §E standby/prep seat content — replaces the hero columns + minimap
 *  with a readiness rundown built ONLY from data the deck genuinely has today
 *  (no fake "Dota detected" checks). Ready rows get an ice check glyph;
 *  not-ready rows render an honest "—" mute, never a fake pass. */
function ReadinessRundown({
  gsiOnline,
  voicePackName,
  signalEnabled,
  annEnabled,
  masterVolume,
  draftNote
}: {
  gsiOnline: boolean;
  voicePackName: string | null;
  signalEnabled: boolean;
  annEnabled: boolean;
  masterVolume: number;
  draftNote: boolean;
}) {
  // "ปิด"/"ปิดเสียง" for deliberately-toggled-off features — a user choice is not
  // the same state as a genuinely-absent capability ("—") (Opus gate, CR011-P3).
  const rows: Array<{ label: string; ready: boolean; value: string }> = [
    { label: "เชื่อมต่อ GSI", ready: gsiOnline, value: gsiOnline ? "ออนไลน์" : "—" },
    { label: "แพ็กเสียง", ready: voicePackName != null, value: voicePackName ?? "—" },
    { label: "G-Signal", ready: signalEnabled, value: signalEnabled ? "พร้อม" : "ปิด" },
    { label: "เสียงประกาศ ANN", ready: annEnabled, value: annEnabled ? "พร้อม" : "ปิด" },
    { label: "ระดับเสียง", ready: masterVolume > 0, value: masterVolume > 0 ? `${masterVolume}%` : "ปิดเสียง" }
  ];

  return (
    <div className="gm-battle-alt gm-rundown">
      {draftNote ? <div className="gm-rundown-note">กำลังดราฟต์ — รอเข้าเกม</div> : null}
      <div className="gm-rundown-list">
        {rows.map((row) => (
          <div key={row.label} className={`gm-rundown-row${row.ready ? " ready" : ""}`}>
            <span className="gm-rundown-glyph">{row.ready ? "✓" : "—"}</span>
            <span className="gm-rundown-label">{row.label}</span>
            <span className="gm-rundown-value">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Return shape of `list_match_logs` (log.rs MatchLog) — same fields buildHistory.ts
 *  already consumes; redeclared locally rather than importing a private helper type. */
type DebriefLogMeta = { name: string; size: number; modified_ms: number };

/** Return shape of `read_match_log` (log.rs TimelineEntry, camelCase per the
 *  CR011-P3 contract — see live/events.ts's comment on the `utterance` payload
 *  for why this one Rust struct breaks the snake_case wire convention). */
type DebriefEntry = { atMs: number; kind: string; text: string };

const DEBRIEF_KIND_LABEL: Record<string, string> = {
  gank_signal: "GANK",
  gank_revision: "แก้คำทำนาย",
  enemy_missing: "หาย",
  match_start: "เริ่ม"
};

function debriefKindLabel(kind: string): string {
  return DEBRIEF_KIND_LABEL[kind] ?? kind.replace(/_/g, " ").toUpperCase();
}

/** Modifier suffix for `.gm-debrief-row-chip-*` — a small fixed set of tone
 *  classes instead of interpolating the raw `kind` string directly into a
 *  class name (keeps the CSS surface finite and predictable). */
function debriefKindTone(kind: string): string {
  switch (kind) {
    case "gank_signal":
      return "gank";
    case "gank_revision":
      return "revision";
    case "enemy_missing":
      return "missing";
    case "match_start":
      return "start";
    default:
      return "other";
  }
}

function debriefTimeLabel(atMs: number): string {
  const d = new Date(atMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Cap on rows actually rendered (Opus/Rust already caps the parsed timeline
 *  at 500 — see log.rs TIMELINE_MAX_ENTRIES); the seat itself is a fixed box
 *  with `overflow:hidden`, so this is a data-size guard, not a scroll promise. */
const DEBRIEF_ROW_CAP = 200;

/** CR-011 §E debrief seat content: the timeline of the MOST RECENT archived
 *  match log (`list_match_logs` -> newest by modified time -> `read_match_log`).
 *  Renders inside the frozen `.gm-battle-grid` box in place of the hero
 *  columns + minimap. Every invoke is guarded — a failed/missing command
 *  renders an honest Thai notice, never a blank or fake row (house rule: every
 *  Tauri invoke in this codebase degrades to a stated fallback, never silence). */
function DebriefTimeline({ onBackToLive }: { onBackToLive: () => void }) {
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; entries: DebriefEntry[] }>({
    status: "loading",
    entries: []
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", entries: [] });
    (async () => {
      try {
        const logs = await invoke<DebriefLogMeta[]>("list_match_logs");
        if (cancelled) return;
        if (!logs || logs.length === 0) {
          setState({ status: "error", entries: [] });
          return;
        }
        const newest = logs.slice().sort((a, b) => b.modified_ms - a.modified_ms)[0];
        const entries = await invoke<DebriefEntry[]>("read_match_log", { name: newest.name });
        if (cancelled) return;
        // Most-recent-first, matching the ON AIR ledger's convention — the
        // seat is a fixed box (overflow:hidden, no scroll), so keeping the
        // newest events at the top is what actually stays visible.
        setState({ status: "ready", entries: entries.slice(-DEBRIEF_ROW_CAP).reverse() });
      } catch {
        if (!cancelled) setState({ status: "error", entries: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="gm-battle-alt gm-debrief">
      <div className="gm-debrief-head">
        <span className="gm-debrief-title">สรุปแมตช์ล่าสุด</span>
        <button type="button" className="gm-debrief-back" onClick={onBackToLive}>
          กลับไปดูสด
        </button>
      </div>
      {state.status === "loading" ? (
        <div className="gm-debrief-empty">กำลังโหลดสรุปแมตช์…</div>
      ) : state.status === "error" ? (
        <div className="gm-debrief-empty">ยังอ่านสรุปแมตช์ไม่ได้ — ดูที่หน้า History</div>
      ) : (
        <div className="gm-debrief-list">
          {state.entries.map((entry, i) => (
            <div key={`${entry.atMs}-${i}`} className="gm-debrief-row">
              <span className="gm-debrief-row-time">{debriefTimeLabel(entry.atMs)}</span>
              <span className={`gm-debrief-row-chip gm-debrief-row-chip-${debriefKindTone(entry.kind)}`}>
                {debriefKindLabel(entry.kind)}
              </span>
              <span className="gm-debrief-row-text">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GMaidenFungDashboard({
  data,
  voicePackName,
  signalEnabled,
  annEnabled,
  masterVolume,
  menu
}: {
  data: CompanionData;
  voicePackName: string | null;
  signalEnabled: boolean;
  annEnabled: boolean;
  masterVolume: number;
  menu: ContextMenuController;
}) {
  const allyHeroes = data.heroes.filter((hero) => hero.team === "ally");
  const enemyHeroes = data.heroes.filter((hero) => hero.team === "enemy");

  // CR-007 WP-4: real governor readings — NO_SENSOR (-1, see buildTelemetry.ts)
  // renders "—" instead of a fake 0.
  const cpuValue = data.telemetry.cpuLoad >= 0 ? `${data.telemetry.cpuLoad}%` : "—";
  const ramValue = data.telemetry.ramUsedGb >= 0 ? `${Math.round(data.telemetry.ramUsedGb * 1024)} MB` : "—";

  // CR-011 §E: the seat content follows the real phase axis, except a quiet
  // local override ("กลับไปดูสด" in the debrief timeline) can force the live
  // layout back on — it resets the instant the REAL phase actually changes
  // (a new prep/live/standby observation), never sticking across matches.
  const realPhase = data.match.matchPhase;
  const [forceLive, setForceLive] = useState(false);
  const prevPhaseRef = useRef(realPhase);
  useEffect(() => {
    if (prevPhaseRef.current !== realPhase) {
      prevPhaseRef.current = realPhase;
      setForceLive(false);
    }
  }, [realPhase]);
  const seatPhase: MatchPhase = forceLive ? "live" : realPhase;

  return (
    <div className="gm-fung-layout">
      <section className="gm-score-header" data-seat="score-header" tabIndex={-1}>
        <strong>{data.match.leftTeamName} {data.match.leftScore}</strong>
        <span className="gm-clock">{data.match.clock}</span>
        <strong>{data.match.rightScore} {data.match.rightTeamName}</strong>
        <PhaseChip phase={realPhase} />
      </section>

      <section className="gm-stats-bar" data-seat="stats" tabIndex={-1}>
        <MiniStat label="NW" value={String(data.match.player.nw)} sub="Local" />
        <MiniStat label="GPM" value={String(data.match.player.gpm)} sub="Farm" />
        <MiniStat label="XPM" value={String(data.match.player.xpm)} sub="Tempo" />
      </section>

      <MomentumMeter momentum={data.momentum} />

      <section className="gm-battle-grid" data-seat="battle-grid" tabIndex={-1}>
        {seatPhase === "live" ? (
          <>
            <div className="gm-slot-column">
              {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`a-${idx}`} id={idx + 1} hero={allyHeroes[idx]} menu={menu} />)}
            </div>
            <MinimapMirror />
            <div className="gm-slot-column">
              {[0, 1, 2, 3, 4].map((idx) => <HeroSlot key={`e-${idx}`} id={idx + 6} hero={enemyHeroes[idx]} menu={menu} />)}
            </div>
          </>
        ) : seatPhase === "debrief" ? (
          <DebriefTimeline onBackToLive={() => setForceLive(true)} />
        ) : (
          <ReadinessRundown
            gsiOnline={data.match.gsiOnline}
            voicePackName={voicePackName}
            signalEnabled={signalEnabled}
            annEnabled={annEnabled}
            masterVolume={masterVolume}
            draftNote={seatPhase === "prep"}
          />
        )}
      </section>

      <section className="gm-agent-card" data-seat="on-air" tabIndex={-1}>
        <OnAirConsole data={data} menu={menu} />
      </section>

      <section className="gm-sector-log" data-seat="sector-log" tabIndex={-1}>
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Alert Deck</h3>
          <div className="log-list">
            {data.activity.length === 0 ? (
              <div className="log-row">
                <span className="log-time">--:--:--</span>
                <span className="log-text">No alerts yet</span>
              </div>
            ) : (
              data.activity.map((item) => (
                <div key={item.id} className={`log-row ${toneClass(item.tone)}`}>
                  <span className="log-time">{item.at}</span>
                  <span className="log-text">{item.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div>
          <h3><span className={`gm-tally${data.match.gsiOnline ? " gm-tally-onair" : ""}`} />Companion State</h3>
          <div className="gm-state-grid">
            <MiniStat label="Voice" value={voicePackName ?? "—"} sub="Active pack" />
            <MiniStat label="Signal" value={signalEnabled ? "ON" : "OFF"} sub="G-Signal" />
            <MiniStat label="CPU" value={cpuValue} sub="Governor" />
            <MiniStat label="RAM" value={ramValue} sub="Governor" />
          </div>
        </div>
      </section>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="gm-mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}

function VolumeRail({
  value,
  annEnabled,
  signalEnabled,
  onVolumeChange,
  onAnnToggle,
  onSignalToggle
}: {
  value: number;
  annEnabled: boolean;
  signalEnabled: boolean;
  onVolumeChange: (value: number) => void;
  onAnnToggle: () => void;
  onSignalToggle: () => void;
}) {
  return (
    <div className="g-volume-rail" data-no-drag="true">
      <div className="g-volume-copy">
        <strong>VOLUME</strong>
        <span>{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        aria-label="Master volume"
      />
      <div className="g-volume-toggles">
        <button
          type="button"
          className={`g-volume-toggle${annEnabled ? " on" : ""}`}
          onClick={onAnnToggle}
          title="Mutes G-AnnStudio announcer-pack events only (kill/streak/death lines). Maiden's persona voice and G-Signal gank warnings are separate and stay on."
        >
          ANN
        </button>
        <button type="button" className={`g-volume-toggle signal${signalEnabled ? " on" : ""}`} onClick={onSignalToggle}>
          SIGNAL
        </button>
      </div>
    </div>
  );
}

/** CR011-P4b-01 honesty check: an OpenDota hero-profile link needs a numeric
 *  hero id, but the deck only ever has `hero.hero` = `prettyHeroName(npcShort)`
 *  (title-cased words, spaces — see live/events.ts), while heroNames.ts's
 *  HERO_NAMES is keyed id -> OpenDota's OWN localized spelling ("Anti-Mage",
 *  "Nature's Prophet", "Queen of Pain" — hyphens/apostrophes the npc-short
 *  reconstruction never produces, e.g. npc short "antimage" round-trips to
 *  "Antimage", not "Anti-Mage"). There is no npc-short -> id table anywhere in
 *  the repo, so a reverse-name lookup would silently fail for a large chunk of
 *  the roster. Per the task's honesty rule ("no menu item that can't truly
 *  act"), the OpenDota-profile item is OMITTED rather than wired to a lookup
 *  that would be wrong for names like Anti-Mage/Nature's Prophet/Queen of
 *  Pain — only the copy-name action is offered. */
function heroMenuItems(heroName: string, known: boolean): ContextMenuEntry[] {
  return [
    {
      id: "hero-copy-name",
      label: "คัดลอกชื่อฮีโร่",
      disabled: !known,
      run: () => {
        void navigator.clipboard?.writeText(heroName).catch(() => {});
      }
    }
  ];
}

function HeroSlot({ id, hero, menu }: { id: number; hero?: CompanionData["heroes"][number]; menu: ContextMenuController }) {
  const heroName = hero && hero.hero !== "—" ? hero.hero : "—";
  const known = heroName !== "—";
  const stateLabel = !hero || hero.state === "empty" ? "Waiting" : hero.state;
  const kda = hero ? formatKda(hero) : "—";
  // portrait art behind the card (CDN, dimmed); dead = fainter, missing = grey.
  const portrait = heroPortraitUrl(hero?.hero);
  const overlay = { position: "relative", zIndex: 1 } as const;
  return (
    <div
      className={`gm-hero-slot ${hero?.state ?? "empty"}`}
      style={portrait ? { position: "relative", overflow: "hidden" } : undefined}
      aria-label={`Hero slot ${id}`}
      tabIndex={0}
      // No menu at all for unknown slots — a popup whose only item is disabled
      // is keyboard-inert dead chrome (Opus gate, CR011-P4b).
      onContextMenu={(e) => { if (known) menu.openFromMouseEvent(e, heroMenuItems(heroName, known)); }}
      onKeyDown={(e) => { if (known) menu.openFromKeyboard(e, heroMenuItems(heroName, known)); }}
    >
      {portrait && (
        <img
          src={portrait}
          alt=""
          draggable={false}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: hero?.state === "dead" ? 0.12 : 0.3,
            filter: hero?.state === "missing" ? "grayscale(0.7)" : undefined,
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
      )}
      <strong style={portrait ? overlay : undefined}>{heroName}</strong>
      <span style={portrait ? overlay : undefined}>{stateLabel}</span>
      <em style={portrait ? overlay : undefined}>{kda}</em>
    </div>
  );
}

/** CR011-P4b-01: G-Signal sensitivity (Low/Med/High). `set_cv_signal_sensitivity`
 *  IS wired in main.rs (`level: signal::Sensitivity`, serde `rename_all =
 *  "lowercase"`), so the menu really can change it — verified by grep before
 *  wiring, per the task instruction. The legacy Control panel (App.tsx) stores
 *  the current choice under `localStorage['gm-settings'].signalSensitivity`
 *  ('low'|'med'|'high', default 'med') and pushes it to this exact command on
 *  change; there is no get_* query command, so this is the only place to read
 *  the current value from — a read (AND write-back, so the two surfaces never
 *  silently diverge) rather than a strict read-only peek, but still additive/
 *  local-storage-only, no new component wiring. */
type SigSensitivity = "low" | "med" | "high";
const SIG_SENSITIVITY_LABEL: Record<SigSensitivity, string> = { low: "Low", med: "Med", high: "High" };

function readSignalSensitivity(): SigSensitivity {
  try {
    const raw = JSON.parse(localStorage.getItem("gm-settings") ?? "{}") as Record<string, unknown>;
    const v = raw.signalSensitivity;
    if (v === "low" || v === "med" || v === "high") return v;
  } catch {
    /* noop — browser dev / no localStorage */
  }
  return "med";
}

// DEPENDENCY NOTE (Opus gate, CR011-P4b): no clobber race with the legacy
// Control panel today ONLY because the menu targets render dashboard-only
// while <Control embedded> mounts on the Settings tab and re-reads
// localStorage on each remount. If Control ever becomes persistently
// mounted, its whole-object settings write-back would silently revert this
// value on the next unrelated edit — revisit this seam then.
function writeSignalSensitivity(level: SigSensitivity) {
  try {
    const raw = JSON.parse(localStorage.getItem("gm-settings") ?? "{}") as Record<string, unknown>;
    raw.signalSensitivity = level;
    localStorage.setItem("gm-settings", JSON.stringify(raw));
  } catch {
    /* noop */
  }
}

function annunciatorMenuItems(): ContextMenuEntry[] {
  const current = readSignalSensitivity();
  const sensitivityItems: ContextMenuEntry[] = (Object.keys(SIG_SENSITIVITY_LABEL) as SigSensitivity[]).map((level) => ({
    id: `sig-sensitivity-${level}`,
    label: `ความไว G-Signal: ${SIG_SENSITIVITY_LABEL[level]}${level === current ? " (ปัจจุบัน)" : ""}`,
    // Selecting the already-active level would be a no-op — disabling it
    // doubles as the "mark the current level" the task asks for.
    disabled: level === current,
    run: () => {
      writeSignalSensitivity(level);
      void invoke("set_cv_signal_sensitivity", { level }).catch(() => {});
    }
  }));
  return [
    ...sensitivityItems,
    { id: "sig-sep", separator: true },
    {
      id: "sig-test-alert",
      label: "ทดสอบเสียงเตือน",
      run: () => {
        void invoke("speak_event", { event: "danger", fallback: "ทดสอบสัญญาณเตือนค่ะ" }).catch(() => {});
      }
    }
  ];
}

function SignalGrid({ signals, menu }: { signals: CompanionData["signals"]; menu: ContextMenuController }) {
  const tags = ["D", "E", "F", "G"];
  const fillClass = ["sg-fill-ice", "", "sg-fill-safe", "sg-fill-warn"];
  return (
    <div className="g-signals-fab">
      {signals.map((sig, i) => (
        <div
          key={sig.label}
          className={`g-sig${i === 1 ? " hero" : ""}`}
          tabIndex={0}
          onContextMenu={(e) => menu.openFromMouseEvent(e, annunciatorMenuItems())}
          onKeyDown={(e) => menu.openFromKeyboard(e, annunciatorMenuItems())}
        >
          <span className="sg-tag">{tags[i]}</span>
          <span className="sg-label">{sig.label}</span>
          <span className="sg-val">{sig.value}</span>
          <div className="sg-bar">
            <div
              className={`sg-fill${fillClass[i] ? ` ${fillClass[i]}` : ""}`}
              style={{ width: `${sig.barPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}


