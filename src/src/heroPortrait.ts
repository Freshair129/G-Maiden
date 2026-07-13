// Hero portrait from Valve's dota_react CDN — the same 256x144 landscape art the
// Dota 2 hero-pick screen uses. The CDN host is whitelisted in the deck window's
// CSP (`img-src ... https://cdn.cloudflare.steamstatic.com`), so the deck loads
// portraits at runtime, no bundling.
//
// The deck's hero identity (`hero.hero`) is `prettyHeroName(npcShort)` from
// live/events.ts = the npc short name title-cased with spaces
// ("shadow_fiend" → "Shadow Fiend", "zuus" → "Zuus", "antimage" → "Antimage").
// So lowercasing + underscoring reverses it EXACTLY back to the CDN short — no
// lookup table. ⚠️ This mirrors prettyHeroName(); if that ever emits localized
// names ("Anti-Mage") instead, update this reverse (or bake a name→short map).

const CDN = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes";

/** Portrait URL for a deck hero display name, or null when unknown/empty. */
export function heroPortraitUrl(displayName: string | undefined | null): string | null {
  if (!displayName || displayName === "—") return null;
  const short = displayName.toLowerCase().trim().replace(/\s+/g, "_");
  return short ? `${CDN}/${short}.png` : null;
}
