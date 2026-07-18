// Shared voice-pack types. Mirrors the Rust structs in
// src-tauri/src/voice_api.rs — serde serializes with camelCase, so the field
// names here match exactly. Kept in one file so both the inventory grid and
// the editor page speak the same shape.

export type VoiceAssetOption = {
  path: string;
  name: string;
  url: string;
};

export type VoiceMapping = {
  text: string;
  thai: string;
  banner: string;
  bannerAsset: string;
  bannerUrl: string | null;
  clip: string;
  clips: string[];
  hasClip: boolean;
  clipCount: number;
  clipUrl: string | null;
  clipOptions: VoiceAssetOption[];
};

export type VoiceEvent = {
  id: string;
  group: string;
  label: string;
  subtitle: string;
  thai: string;
  accent: string;
  mapping: VoiceMapping | null;
  // The real fallback chain, so the UI never claims "missing" for an event
  // that will actually be voiced: pack clip → bundled default clip → TTS.
  defaultClipCount: number;
  defaultClipUrl: string | null;
};

export type VoicePack = {
  id: string;
  name: string;
  version: string;
  locale: string;
  author: string;
  description: string;
  path: string;
  coveredEvents: number;
  totalEvents: number;
  clips: number;
  availableClips: VoiceAssetOption[];
  availableBanners: VoiceAssetOption[];
  items: VoiceEvent[];
  // Cover for the inventory tile. Empty string / null when the pack ships
  // no cover — the inventory renders a gradient placeholder in that case.
  coverImage: string;
  coverImageUrl: string | null;
  // True for the synthesized bundled-default pack: pinned first, read-only
  // (no mapping editor / uploads), equippable like any other pack.
  builtIn: boolean;
};

export type VoiceGroup = {
  id: string;
  label: string;
  accent: string;
};

export type VoiceState = {
  rootDir: string;
  packsDir: string;
  cacheDir: string;
  activePackId: string | null;
  activePack: VoicePack | null;
  packs: VoicePack[];
  groups: VoiceGroup[];
};
