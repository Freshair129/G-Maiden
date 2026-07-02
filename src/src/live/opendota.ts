// OpenDota enrichment service + contract (Phase 2b-A).
//
// Own-game use-case: GSI gives us only the LOCAL player live. To fill the deck's
// profile card (rank/MMR/winrate/games) and REAL trend baselines (your averages
// over recent matches, so the stat-bar arrows mean something), we pull the
// player's PUBLIC history from OpenDota on demand — NO local DB, RAM-cache only,
// privacy-gated via the public flag. Fetched once per account at match start.
//
// CSP note: tauri.conf.json connect-src must allow https://api.opendota.com.
// Fetch failures / offline / private profile / 404 all resolve to `public:false`
// (or null), and the pure builders fall back to the MOCK/base slice.

const BASE = "https://api.opendota.com/api";
const STEAMID64_BASE = 76561197960265728n; // SteamID64 - this = 32-bit account_id

// ── Raw OpenDota response shapes (only the fields we read) ───────────────────
interface OdPlayerResp {
  profile?: { account_id?: number; personaname?: string } | null;
  rank_tier?: number | null;
  leaderboard_rank?: number | null;
  mmr_estimate?: { estimate?: number } | null;
}
interface OdWlResp { win?: number; lose?: number }
interface OdRecentMatch {
  gold_per_min?: number; xp_per_min?: number;
  kills?: number; deaths?: number; assists?: number;
  last_hits?: number; denies?: number;
}
interface OdHeroStat { hero_id?: number; games?: number; win?: number }

// ── Normalized profile the builders consume (pure, no fetch) ─────────────────
export interface OpenDotaBaselines {
  gpmAvg: number;
  xpmAvg: number;
  kAvg: number;
  dAvg: number;
  aAvg: number;
  csAvg: number;      // last_hits
  deniesAvg: number;
  sampleSize: number; // matches averaged (0 = no baseline)
}

export interface OpenDotaProfile {
  accountId: number;
  public: boolean;    // false = private / not found / fetch failed → card locked
  rank: string;       // "Legend IV" from rank_tier, "" if unknown
  mmr: number;        // mmr_estimate.estimate, 0 if unknown
  winRate: number;    // 0..100
  games: number;      // win + lose
  kda: number;        // (avgK + avgA) / max(1, avgD) over recent matches
  mainHero: { name: string; games: number; winRate: number };
  hours?: number;     // Steam-only (not in OpenDota) — stays undefined here
  baselines: OpenDotaBaselines | null;
}

const MEDALS = ["Uncalibrated", "Herald", "Guardian", "Crusader", "Archon", "Legend", "Ancient", "Divine", "Immortal"] as const;
const STAR = ["", "I", "II", "III", "IV", "V"] as const;

/** rank_tier 54 -> "Legend IV"; 80 -> "Immortal"; 0/null -> "". */
export function rankTierToLabel(rt: number | null | undefined): string {
  if (rt == null || rt === 0) return "";
  const medal = Math.floor(rt / 10);
  const stars = rt % 10;
  const name = MEDALS[medal];
  if (!name || medal === 0) return "";
  if (medal >= 8) return "Immortal"; // no stars for Immortal
  return stars ? `${name} ${STAR[stars] ?? stars}` : name;
}

/** Accept a raw account_id, a SteamID64, or a steamcommunity profile URL. */
export function resolveAccountId(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? normalizeId(input) : null;
  const s = input.trim();
  const urlMatch = s.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  const raw = urlMatch ? urlMatch[1] : s.replace(/\D/g, "");
  if (!raw) return null;
  try {
    const n = BigInt(raw);
    const id = n >= STEAMID64_BASE ? Number(n - STEAMID64_BASE) : Number(n);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
function normalizeId(id: number): number | null {
  if (id > 76561197960265728) return id - 76561197960265728;
  return id > 0 ? id : null;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Pure: fold raw OpenDota responses into a normalized profile. Exported so the
 *  builders' tests can exercise the mapping without touching the network. */
export function normalizeOpenDota(
  accountId: number,
  player: OdPlayerResp | null,
  wl: OdWlResp | null,
  recent: OdRecentMatch[] | null,
  heroes: OdHeroStat[] | null,
  heroName: (heroId: number) => string
): OpenDotaProfile {
  // A 404 / null player response = private or nonexistent → locked card.
  if (!player || !player.profile) {
    return {
      accountId, public: false, rank: "", mmr: 0, winRate: 0, games: 0, kda: 0,
      mainHero: { name: "", games: 0, winRate: 0 }, baselines: null
    };
  }

  const win = wl?.win ?? 0;
  const lose = wl?.lose ?? 0;
  const games = win + lose;
  const winRate = games > 0 ? (win / games) * 100 : 0;

  const rm = recent ?? [];
  const baselines: OpenDotaBaselines | null = rm.length > 0 ? {
    gpmAvg: Math.round(avg(rm.map((m) => m.gold_per_min ?? 0))),
    xpmAvg: Math.round(avg(rm.map((m) => m.xp_per_min ?? 0))),
    kAvg: Math.round(avg(rm.map((m) => m.kills ?? 0)) * 10) / 10,
    dAvg: Math.round(avg(rm.map((m) => m.deaths ?? 0)) * 10) / 10,
    aAvg: Math.round(avg(rm.map((m) => m.assists ?? 0)) * 10) / 10,
    csAvg: Math.round(avg(rm.map((m) => m.last_hits ?? 0))),
    deniesAvg: Math.round(avg(rm.map((m) => m.denies ?? 0))),
    sampleSize: rm.length
  } : null;

  const kAvg = baselines?.kAvg ?? 0;
  const aAvg = baselines?.aAvg ?? 0;
  const dAvg = baselines?.dAvg ?? 0;
  const kda = Math.round(((kAvg + aAvg) / Math.max(1, dAvg)) * 10) / 10;

  const top = (heroes ?? []).slice().sort((a, b) => (b.games ?? 0) - (a.games ?? 0))[0];
  const mainHero = top
    ? {
        name: heroName(top.hero_id ?? 0),
        games: top.games ?? 0,
        winRate: top.games ? Math.round(((top.win ?? 0) / top.games) * 100) : 0
      }
    : { name: "", games: 0, winRate: 0 };

  return {
    accountId,
    public: true,
    rank: rankTierToLabel(player.rank_tier),
    mmr: Math.round(player.mmr_estimate?.estimate ?? 0),
    winRate: Math.round(winRate * 10) / 10,
    games,
    kda,
    mainHero,
    baselines
  };
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const r = await fetch(url, { signal, headers: { accept: "application/json" } });
    if (!r.ok) return null; // 404 (private) / 429 (rate limited) / 5xx → null
    return (await r.json()) as T;
  } catch {
    return null; // offline / abort / CSP / parse error
  }
}

/**
 * Fetch + normalize a player's public OpenDota profile. Returns null only when
 * we couldn't reach the API at all with a resolvable id; a reachable-but-private
 * profile comes back as `public:false`. Fires four requests in parallel with a
 * shared timeout. `heroName` maps hero_id → display name (inject to stay pure).
 */
export async function fetchOpenDotaProfile(
  input: string | number,
  heroName: (heroId: number) => string,
  timeoutMs = 6000
): Promise<OpenDotaProfile | null> {
  const accountId = resolveAccountId(input);
  if (accountId == null) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const id = accountId;
    const [player, wl, recent, heroes] = await Promise.all([
      getJson<OdPlayerResp>(`${BASE}/players/${id}`, ctrl.signal),
      getJson<OdWlResp>(`${BASE}/players/${id}/wl`, ctrl.signal),
      getJson<OdRecentMatch[]>(`${BASE}/players/${id}/recentMatches`, ctrl.signal),
      getJson<OdHeroStat[]>(`${BASE}/players/${id}/heroes`, ctrl.signal)
    ]);
    // Total network failure (all null) → give up so the caller keeps MOCK.
    if (!player && !wl && !recent && !heroes) return null;
    return normalizeOpenDota(id, player, wl, recent, heroes, heroName);
  } finally {
    clearTimeout(timer);
  }
}
