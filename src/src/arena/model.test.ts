import { describe, expect, it } from 'vitest';
import { buildArena, buildArenaMap, type ArenaSource } from './model';
import { emptyPartyView, type PartyView } from '../party/partyModel';
import type { PreviewSnapshot } from '../live/minimapPreview';

export function source(): ArenaSource {
  return {
    epoch: 7, generation: '7:1', freshness: 'fresh', ageMs: 20,
    own: { session_epoch: 7, hero: 'npc_dota_hero_lina', team_name: 'radiant', level: 12, alive: true, respawn_seconds: 0, hp_percent: 60, mana_percent: 35 },
    roster: { session_epoch: 7, radiant: ['axe', null, 'lina', 'puck', null], dire: ['lion', 'pudge', null, 'bane', 'slark'], complete: false, recognizer_active: true, templates_loading: false },
    enemySlots: [], visible: ['lion'], missing: [['pudge', 6200]], phase: 'live', warningReady: true,
    health: { healthy: true, backend: 'dxgi', classifier: true, throttled: false, frameAgeMs: 10 },
    cv: { session_epoch: 7, geometry_generation: '2', display_index: 0, display_fingerprint: '3', desktop_origin: [0, 0], region: { x: 10, y: 20, side: 200 }, icon: 20, candidates: [], count: 1, classifier: true,
      detections: [{ name: 'lion', label: 1, x: 40, y: 80, score: 0.99 }] },
  };
}
export function preview(): PreviewSnapshot {
  return { status: 'live', drawFps: 30, rpcRttMs: 1, estimatedDrawAgeMs: 10, clockUncertaintyMs: 1,
    geometry: { epoch: 7n, generation: 2n, streamId: 1n, region: { x: 10, y: 20, side: 200 }, map_crop: { left: .1, top: .1, right: .9, bottom: .9 }, screenWidth: 1920, screenHeight: 1080, displayIndex: 0, displayFingerprint: 3n, desktopOrigin: [0, 0] } };
}
export function party(): PartyView {
  return { ...emptyPartyView('connected'), roomGeneration: 1, selfId: 'self', members: [
    { memberId: 'peer', displayName: 'Peer', isOwner: false, state: 'live', ageMs: 2000,
      sample: { hero: 'npc_dota_hero_axe', level: 10, hp: 400, maxHp: 800, manaPercent: 30, alive: true, respawnSeconds: 0 } },
  ] };
}

describe('Arena admitted read model', () => {
  it('AC-002 preserves five enemy and four original ally slots excluding self, including nulls', () => {
    const model = buildArena(source());
    expect(model.enemies.map(h => h.identity.value)).toEqual(['lion', 'pudge', null, 'bane', 'slark']);
    expect(model.allies.map(h => [h.playerSlot, h.identity.value])).toEqual([[0, 'axe'], [1, null], [3, 'puck'], [4, null]]);
    expect(model.self.identity.value).toBe('lina');
    expect(model.self.side.value).toBe('radiant');
    const empty = buildArena(null);
    expect([empty.enemies.length, empty.allies.length]).toEqual([5, 4]);
    expect([empty.self, ...empty.enemies, ...empty.allies].every(h => h.identity.value === null)).toBe(true);
  });
  it('AC-003/011 uses percentages without inventing maxima or treating item_names as inventory', () => {
    const input = source();
    Object.assign(input.own!, { item_names: ['item_blink'] });
    const own = buildArena(input).self;
    expect(own.hpPercent.value).toBe(60);
    expect(own.manaPercent.value).toBe(35);
    expect(own.hp.value).toBeNull();
    expect(own.maxHp.value).toBeNull();
    expect(own.skills).toEqual([]);
    expect(own.items).toEqual([]);
    expect(buildArena({ ...input, freshness: 'stale' }).self.hpPercent).toMatchObject({ value: null, availability: 'stale' });
  });
  it('AC-002/011 does not expose no-hero menu zeros as an own observation', () => {
    const input = source(); input.own = { ...input.own!, hero: '', level: 0, hp_percent: 0, mana_percent: 0 };
    const own = buildArena(input).self;
    expect(own.identity.value).toBeNull(); expect(own.hpPercent.value).toBeNull(); expect(own.level.value).toBeNull();
  });
  it('AC-011/023 withdraws party vitals at 2001ms and on null, disconnect or ambiguous identity', () => {
    const view = party();
    expect(buildArena(source(), view, 0).allies[0].hp.value).toBe(400);
    expect(buildArena(source(), view, 1).allies[0].hp).toMatchObject({ value: null, availability: 'stale' });
    expect(buildArena(source(), { ...view, status: 'reconnecting' }, 0).allies[0].hp.value).toBeNull();
    view.members[0].sample = null;
    expect(buildArena(source(), view, 0).allies[0].hp.value).toBeNull();
    const duplicate = party(); duplicate.members.push({ ...duplicate.members[0], memberId: 'other' });
    expect(buildArena(source(), duplicate, 0).allies[0].hp.value).toBeNull();
  });
  it('AC-010 rejects old-session own, roster and CV snapshots', () => {
    const input = { ...source(), epoch: 8, generation: '8:1' };
    const model = buildArena(input);
    expect(model.self.identity.value).toBeNull();
    expect(model.enemies.every(h => h.identity.value === null)).toBe(true);
    expect(buildArenaMap(input, preview(), model.enemies).markers).toEqual([]);
  });
  it('AC-010 fences a changed Party source without altering the owner or inventing slots', () => {
    const view = party();
    const first = buildArena(source(), view);
    const next = buildArena(source(), { ...view, roomGeneration: 2 });
    expect(first.generation).not.toBe(next.generation);
    expect(view.roomGeneration).toBe(1);
    expect(buildArena({ ...source(), roster: null }, view).allies.every(h => h.hp.value === null)).toBe(true);
  });
  it('AC-013 transforms pixel centers through the actual crop and withholds invalid geometry', () => {
    const input = source();
    const heroes = buildArena(input).enemies;
    const marker = buildArenaMap(input, preview(), heroes).markers[0];
    expect(marker.heroKey).toBe(heroes[0].key);
    expect(marker.x).toBeCloseTo(18.75);
    expect(marker.y).toBeCloseTo(43.75);
    for (const changed of [
      { ...input, health: { ...input.health!, healthy: false } },
      { ...input, cv: { ...input.cv!, region: { x: 10, y: 20, side: 0 } } },
      { ...input, cv: { ...input.cv!, geometry_generation: '3' } },
      { ...input, cv: null },
    ]) expect(buildArenaMap(changed, preview(), heroes).markers).toEqual([]);
    expect(buildArenaMap(input, { ...preview(), status: 'stale' }, heroes).markers).toEqual([]);
    for (const x of [NaN, -1, 201, Infinity]) {
      input.cv!.detections[0].x = x;
      expect(buildArenaMap(input, preview(), heroes).markers).toEqual([]);
    }
  });
  it('AC-023 does not infer seen or last-seen age from identity or raw classification', () => {
    const input = source(); input.visible = [];
    const heroes = buildArena(input).enemies;
    expect(heroes[0].visibility.value).toBeNull();
    expect(heroes[0].lastSeenAgeMs.value).toBeNull();
    expect(heroes[1].visibility.value).toBe('missing');
    expect(heroes[1].lastSeenAgeMs.value).toBe(6200);
    expect(buildArenaMap(input, preview(), heroes).markers).toEqual([]);
  });
});
