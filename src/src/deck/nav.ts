import type { ReactNode } from "react";
// Type-only — erased at compile time, so this does NOT create a runtime
// import cycle with App.tsx (which imports CommandDeck as a value).
import type { SettingsCat } from "../App";
import { PAGES } from "../shortcuts";
import {
  IconDashboard,
  IconLive,
  IconVoice,
  IconStore,
  IconInsights,
  IconSettings,
  IconAccount
} from "../DeckIcons";

// CR011-P5 gate fix: NAV is DERIVED from shortcuts.ts PAGES — the two arrays
// were hand-aligned duplicates and nothing guarded the alignment (the old
// comment claimed tests did; they did not). Now Ctrl+1..7, the palette, the
// sheet, and the rail literally cannot drift: one array, one icon map.
// CR-013 W1-01: build/history no longer have their own rail seat (they moved
// into in-page DeckTabs under live/insights) — store takes a seat instead.
export const NAV_ICONS: Record<string, (p: { size?: number }) => ReactNode> = {
  dashboard: IconDashboard,
  live: IconLive,
  voice: IconVoice,
  store: IconStore,
  insights: IconInsights,
  account: IconAccount,
  settings: IconSettings
};
export const NAV: Array<{ key: string; label: string; Icon: (p: { size?: number }) => ReactNode }> =
  PAGES.map((p) => ({ key: p.key, label: p.label, Icon: NAV_ICONS[p.key] ?? IconDashboard }));

// CR-013 W2 §4: the Settings iOS split-view left rail. "general" is
// deck-owned (deck prefs + window size); the rest map 1:1 to Control's
// `SettingsCat` union (App.tsx) and are handed to `renderSettings`.
export const SETTINGS_CATS: Array<{ key: SettingsCat | "general"; glyph: string; label: string; sub: string }> = [
  { key: "general", glyph: "◧", label: "ทั่วไป", sub: "คุณภาพ · ขนาดหน้าต่าง" },
  { key: "overlay", glyph: "▭", label: "Overlay", sub: "ตำแหน่ง · สไตล์ overlay" },
  { key: "voice", glyph: "♪", label: "เสียง & เตือน", sub: "เสียงพูด · แบนเนอร์แจ้งเตือน" },
  { key: "ai", glyph: "✦", label: "AI (G-Master)", sub: "ผู้ช่วยวิเคราะห์" },
  { key: "modules", glyph: "▤", label: "โมดูล & CV", sub: "สถานะโมดูล · การจับภาพ" },
  { key: "privacy", glyph: "◐", label: "ความเป็นส่วนตัว", sub: "ข้อมูลในเครื่อง" },
  { key: "system", glyph: "⚙", label: "ระบบ", sub: "GSI · อัปเดต · Log" }
];

export const WINDOW_SIZE_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: "1200 × 780", w: 1200, h: 780 },
  { label: "1440 × 900", w: 1440, h: 900 },
  { label: "1920 × 1080", w: 1920, h: 1080 }
];
