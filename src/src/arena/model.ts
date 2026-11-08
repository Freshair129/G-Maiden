import type { CompanionData } from '../companion';
import type { DraftRoster, GameTick, GsiFreshness, MinimapCv, SensorHealth } from '../live/events';
import { previewMatchesCv, type PreviewSnapshot } from '../live/minimapPreview';
import { memberPresentation, type PartyView } from '../party/partyModel';

export type Availability = 'known' | 'unknown' | 'stale' | 'unavailable';
export interface FieldState<T> {
  readonly value: T | null;
  readonly availability: Availability;
  readonly source: 'own-gsi' | 'party' | 'cv' | 'catalog';
  readonly ageMs: number | null;
  readonly sourceGeneration: string;
  readonly revision: string;
}

/** Presentation only. This is neither a lease nor an entitlement verifier. */
export interface ProGate {
  readonly state: 'absent' | 'active' | 'lapsed' | 'revoked' | 'unverifiable';
  readonly features: readonly string[];
  readonly until: string | null;
}
// D-3: no authority is connected. No settings/storage/account input can grant Pro.
export const ABSENT_PRO_GATE: ProGate = Object.freeze({ state: 'absent', features: Object.freeze([]), until: null });
export const ARENA_INSPECTOR_FEATURE = 'g-arena';
export const hasInspector = (gate: ProGate) => gate.state === 'active' && gate.features.includes(ARENA_INSPECTOR_FEATURE);

export type OwnObservation = Pick<GameTick, 'session_epoch' | 'hero' | 'team_name' | 'level' | 'alive' | 'respawn_seconds' | 'hp_percent' | 'mana_percent'>;
/** Explicit local projection of existing producers; no raw payload or account identifiers. */
export interface ArenaSource {
  epoch: number | null;
  generation: string;
  freshness: GsiFreshness;
  ageMs: number | null;
  own: OwnObservation | null;
  roster: DraftRoster | null;
  enemySlots: readonly (readonly [string, number])[];
  visible: readonly string[];
  missing: readonly (readonly [string, number])[];
  phase: CompanionData['heroCv']['phase'];
  warningReady: boolean;
  health: SensorHealth | null;
  cv: MinimapCv | null;
}
export interface SkillView {
  key: string;
  revision: string;
  name: FieldState<string>;
  description: FieldState<string>;
  hotkey: FieldState<string>;
  level: FieldState<number>;
  passive: FieldState<boolean>;
  canCast: FieldState<boolean>;
  cooldown: FieldState<number>;
  charges: FieldState<number>;
  maxCharges: FieldState<number>;
  recharge: FieldState<number>;
}
export interface ItemView {
  key: string;
  revision: string;
  group: 'main' | 'backpack' | 'special';
  slot: number;
  name: FieldState<string>;
  empty: FieldState<boolean>;
  count: FieldState<number>;
  charges: FieldState<number>;
  cooldown: FieldState<number>;
  recharge: FieldState<number>;
}
export interface HeroView {
  key: string;
  revision: string;
  playerSlot: number | 'self';
  team: 'self' | 'ally' | 'enemy';
  side: FieldState<'radiant' | 'dire'>;
  identity: FieldState<string>;
  visibility: FieldState<'seen' | 'missing'>;
  lastSeenAgeMs: FieldState<number>;
  level: FieldState<number>;
  alive: FieldState<boolean>;
  respawn: FieldState<number>;
  hp: FieldState<number>;
  maxHp: FieldState<number>;
  hpPercent: FieldState<number>;
  manaPercent: FieldState<number>;
  skills: readonly SkillView[];
  items: readonly ItemView[];
}
export interface ArenaModel {
  generation: string;
  self: HeroView;
  allies: HeroView[];
  enemies: HeroView[];
  source: ArenaSource | null;
  activity: CompanionData['activity'];
  events: CompanionData['events'];
}
export interface ArenaMap {
  live: boolean;
  markers: { heroKey: string; x: number; y: number }[];
}

const short = (name: string) => name.replace(/^npc_dota_hero_/, '');
const finite = (n: number | null | undefined, max = Number.MAX_SAFE_INTEGER) => n != null && Number.isFinite(n) && n >= 0 && n <= max ? n : null;
const current = (epoch: number | null, data: { session_epoch?: number } | null) => epoch !== null && data?.session_epoch === epoch;

export function buildArena(source: ArenaSource | null, party?: PartyView, elapsedMs = 0,
  activity: CompanionData['activity'] = [], events: CompanionData['events'] = []): ArenaModel {
  const generation = `${source?.generation ?? 'unavailable'}:party-${party?.roomGeneration ?? 'none'}`;
  const epoch = source?.epoch ?? null;
  const own = source && current(epoch, source.own) && source.own?.hero.trim() ? source.own : null;
  const roster = source && current(epoch, source.roster) ? source.roster : null;
  const team = own?.team_name;
  const mine = team === 'radiant' ? roster?.radiant : team === 'dire' ? roster?.dire : undefined;
  const theirs = team === 'radiant' ? roster?.dire : team === 'dire' ? roster?.radiant : undefined;
  const ownName = own?.hero ? short(own.hero) : null;
  const ownSlots = mine?.flatMap((name, index) => name && short(name) === ownName ? [index] : []) ?? [];
  const ownSlot = ownSlots.length === 1 ? ownSlots[0] : 'self';
  const field = <T,>(value: T | null, origin: FieldState<T>['source'], availability: Availability = value === null ? 'unknown' : 'known', ageMs: number | null = null, revision = generation): FieldState<T> =>
    ({ value, source: origin, availability, ageMs, sourceGeneration: generation, revision });
  const hero = (kind: HeroView['team'], slot: number | 'self', name: string | null): HeroView => {
    const id = name ? short(name) : null;
    const origin = kind === 'self' ? 'own-gsi' : 'cv';
    return {
      key: `${epoch ?? 'unknown'}:${kind === 'enemy' ? (team === 'radiant' ? 'dire' : team === 'dire' ? 'radiant' : 'enemy') : team || kind}:${slot}`,
      revision: `${generation}:${id ?? 'unknown'}`, playerSlot: slot, team: kind, identity: field(id, origin),
      side: field(team === 'radiant' ? (kind === 'enemy' ? 'dire' : 'radiant') : team === 'dire' ? (kind === 'enemy' ? 'radiant' : 'dire') : null, 'own-gsi'),
      visibility: field<never>(null, 'cv'), lastSeenAgeMs: field<never>(null, 'cv'), level: field<never>(null, origin), alive: field<never>(null, origin), respawn: field<never>(null, origin),
      hp: field<never>(null, origin), maxHp: field<never>(null, origin), hpPercent: field<never>(null, origin), manaPercent: field<never>(null, origin), skills: [], items: [],
    };
  };
  const self = hero('self', ownSlot, ownName);
  const ownAvailability: Availability = source?.freshness === 'stale' ? 'stale' : source?.freshness === 'fresh' ? 'known' : 'unavailable';
  const ownField = <T,>(value: T | null) => field(ownAvailability === 'known' ? value : null, 'own-gsi', ownAvailability === 'known' && value === null ? 'unknown' : ownAvailability, source?.ageMs ?? null);
  self.level = ownField(finite(own?.level)); self.alive = ownField(own?.alive ?? null);
  self.respawn = ownField(finite(own?.respawn_seconds));
  self.hpPercent = ownField(finite(own?.hp_percent, 100)); self.manaPercent = ownField(finite(own?.mana_percent, 100));
  const allySlots = typeof ownSlot === 'number' ? [0, 1, 2, 3, 4].filter(slot => slot !== ownSlot) : [0, 1, 2, 3];
  // Without an admitted self slot, assigning the other four roster slots would guess.
  const allies = allySlots.map(slot => hero('ally', slot, typeof ownSlot === 'number' ? mine?.[slot] ?? null : null));
  const enemies = Array.from({ length: 5 }, (_, slot) => hero('enemy', slot, theirs
    ? theirs[slot] ?? null : source?.enemySlots.find(([, index]) => slot === index)?.[0] ?? null));
  if (source?.phase === 'live' && source.health?.healthy && source.warningReady) {
    for (const enemy of enemies) {
      const name = enemy.identity.value;
      if (!name) continue;
      const missing = source.missing.find(([id]) => short(id) === name);
      const seen = source.visible.some(id => short(id) === name);
      enemy.visibility = field(missing ? 'missing' : seen ? 'seen' : null, 'cv');
      enemy.lastSeenAgeMs = field(missing ? finite(missing[1]) : null, 'cv');
    }
  }
  if (party && own && source?.freshness === 'fresh') {
    for (const ally of allies) {
      const name = ally.identity.value;
      if (!name || allies.filter(h => h.identity.value === name).length !== 1) continue;
      const peers = party.members.filter(m => m.memberId !== party.selfId && m.sample && short(m.sample.hero) === name);
      if (peers.length !== 1) continue;
      const peer = memberPresentation(peers[0], party.status, elapsedMs);
      const sample = peer.sample;
      const availability = sample ? 'known' : peer.state === 'stale' ? 'stale' : 'unavailable';
      const peerField = <T,>(value: T | null) => field(value, 'party', availability, peer.ageMs, `${party.roomGeneration}:${peers[0].memberId}`);
      ally.hp = peerField(sample?.hp ?? null); ally.maxHp = peerField(sample?.maxHp ?? null);
      ally.manaPercent = peerField(sample?.manaPercent ?? null); ally.level = peerField(sample?.level ?? null);
      ally.alive = peerField(sample?.alive ?? null); ally.respawn = peerField(sample?.respawnSeconds ?? null);
    }
  }
  return { generation, self, allies, enemies, source, activity, events };
}

export function buildArenaMap(source: ArenaSource | null, preview: PreviewSnapshot, heroes: readonly HeroView[]): ArenaMap {
  const cv = source?.cv;
  const frame = preview.geometry;
  const live = !!source && source.phase === 'live' && source.health?.healthy === true && preview.status === 'live'
    && current(source.epoch, cv ?? null) && previewMatchesCv(frame, cv ?? null)
    && !!cv && Number.isFinite(cv.region.side) && cv.region.side > 0;
  if (!live || !frame || !cv) return { live: false, markers: [] };
  const crop = frame.map_crop;
  if (![crop.left, crop.top, crop.right, crop.bottom, cv.icon].every(Number.isFinite)
    || crop.left < 0 || crop.top < 0 || crop.right > 1 || crop.bottom > 1
    || crop.right <= crop.left || crop.bottom <= crop.top || cv.icon < 0) return { live: false, markers: [] };
  const markers = cv.detections.flatMap(detection => {
    const matches = heroes.filter(h => h.identity.value === short(detection.name) && h.visibility.value === 'seen');
    if (matches.length !== 1 || ![detection.x, detection.y].every(coordinate => finite(coordinate, cv.region.side) !== null)) return [];
    const x = (detection.x + cv.icon / 2) / cv.region.side;
    const y = (detection.y + cv.icon / 2) / cv.region.side;
    if (x < crop.left || x > crop.right || y < crop.top || y > crop.bottom) return [];
    return [{ heroKey: matches[0].key, x: (x - crop.left) / (crop.right - crop.left) * 100, y: (y - crop.top) / (crop.bottom - crop.top) * 100 }];
  });
  return { live, markers: markers.filter((marker, i) => markers.findIndex(m => m.heroKey === marker.heroKey) === i) };
}
