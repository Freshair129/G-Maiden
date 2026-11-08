// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ArenaPage } from './ArenaPage';
import { ABSENT_PRO_GATE, ARENA_INSPECTOR_FEATURE, buildArena, type ArenaModel, type FieldState, type ProGate, type SkillView } from './model';
import type { PreviewSnapshot } from '../live/minimapPreview';
const arenaCss = await vi.importActual<{ readFileSync: (path: string, encoding: 'utf8') => string }>('node:fs')
  .then(fs => fs.readFileSync('src/arena/arena.css', 'utf8'));

vi.mock('../MinimapCanvas', () => ({ MinimapCanvas: () => <canvas aria-label="ภาพมินิแมปสดจาก DXGI" /> }));
const previewState = vi.hoisted(() => ({ current: { status: 'unavailable', geometry: null, drawFps: 0, rpcRttMs: 0, estimatedDrawAgeMs: 0, clockUncertaintyMs: 0 } as PreviewSnapshot }));
vi.mock('../live/useMinimapPreview', () => ({ useMinimapPreview: () => previewState.current }));
const pro: ProGate = { state: 'active', features: [ARENA_INSPECTOR_FEATURE], until: null };
const known = <T,>(value: T | null, source: FieldState<T>['source'] = 'catalog'): FieldState<T> => ({ value, availability: value === null ? 'unknown' : 'known', source, ageMs: null, revision: '1', sourceGeneration: 'fixture' });
function fixture(count = 6): ArenaModel {
  const model = buildArena(null);
  model.self.identity = known('lina', 'own-gsi');
  model.self.hpPercent = known(60, 'own-gsi');
  model.self.manaPercent = known(35, 'own-gsi');
  model.self.skills = Array.from({ length: count }, (_, index): SkillView => ({
    key: `skill-${index}`, revision: '1', name: known(`Skill ${index}`), description: known(`Description ${index}`), hotkey: known<never>(null), level: known<never>(null),
    passive: known(index === 1), canCast: known(index === 0 ? true : null), cooldown: known(0), charges: known<never>(null), maxCharges: known<never>(null), recharge: known<never>(null),
  }));
  model.self.items = [
    { key: 'main-0', revision: '1', group: 'main', slot: 0, name: known('Wand'), empty: known(false), count: known(2), charges: known(10), cooldown: known(0), recharge: known<never>(null) },
    { key: 'backpack-0', revision: '1', group: 'backpack', slot: 0, name: known('Branch'), empty: known(false), count: known(1), charges: known<never>(null), cooldown: known<never>(null), recharge: known<never>(null) },
    { key: 'special-0', revision: '1', group: 'special', slot: 0, name: known<never>(null), empty: known(true), count: known<never>(null), charges: known<never>(null), cooldown: known<never>(null), recharge: known<never>(null) },
  ];
  return model;
}
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  previewState.current = { ...previewState.current, status: 'unavailable', geometry: null };
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render(model = fixture(), gate: ProGate = ABSENT_PRO_GATE) { await act(async () => root.render(<ArenaPage model={model} gate={gate} />)); }
function button(label: string) {
  const candidates = [...container.querySelectorAll<HTMLButtonElement>('[data-skill-row] button'), ...container.querySelectorAll<HTMLButtonElement>('button')];
  return candidates.find(node => node.getAttribute('aria-label') === label || node.textContent === label)!;
}
async function click(node: HTMLElement) { expect(node).toBeTruthy(); await act(async () => { node.focus(); node.click(); }); }
async function key(node: HTMLElement, value: string) { await act(async () => node.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }))); }
const selfCard = () => container.querySelector<HTMLButtonElement>('[data-hero-card][data-team="self"]')!;

it('AC-002/004/015 starts neutral with 5+4+1 cards and no demo controls or selection', async () => {
  for (const gate of [ABSENT_PRO_GATE, pro]) {
    await render(buildArena(null), gate);
    expect(container.querySelectorAll('[data-team="enemy"][data-hero-card]')).toHaveLength(5);
    expect(container.querySelectorAll('[data-team="ally"][data-hero-card]')).toHaveLength(4);
    expect(container.querySelectorAll('[data-team="self"][data-hero-card]')).toHaveLength(1);
    expect(container.querySelector('[aria-pressed="true"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Crystal Maiden|Simulate|Reset|Play|\?/);
    expect(container.querySelector('[data-inspector]')).toBeNull();
  }
});
it('AC-003/006/008/021 admits detail only after Pro selection and hides unknown-only rows', async () => {
  const model = fixture();
  await render(model); await click(selfCard());
  expect(container.textContent).not.toContain('Skill 0');
  expect(container.textContent).not.toContain('Wand');
  expect(container.textContent).toContain('60%');
  await render(model, pro);
  expect(container.querySelector('[data-inspector]')).toBeNull();
  await click(selfCard());
  expect(container.querySelectorAll('[data-skill-row]')).toHaveLength(6);
  expect(container.querySelectorAll('[data-skill-preview]')).toHaveLength(4);
  expect(button('+2')).toBeTruthy();
  await click(button('Skill 5'));
  expect(container.textContent).toContain('Description 5');
  await click(button('Wand'));
  expect(container.textContent).toContain('จำนวน 2');
  expect(container.textContent).toContain('ชาร์จ 10');
  expect(container.textContent).toContain('ช่องว่างที่ยืนยันแล้ว');
  const empty = fixture(0); empty.self.items = [];
  await render(empty, pro);
  expect(container.querySelectorAll('[data-skill-row], [data-item-row]')).toHaveLength(0);
});
it.each([0, 4, 6])('AC-003 preserves all %s admitted skills with at most four preview controls', async count => {
  await render(fixture(count), pro);
  expect(container.querySelectorAll('[data-skill-preview]')).toHaveLength(Math.min(4, count));
  await click(selfCard());
  expect(container.querySelectorAll('[data-skill-row]')).toHaveLength(count);
});
it('AC-007 does not infer castability from zero cooldown and distinguishes passive/unlearned/stale', async () => {
  const model = fixture();
  const skills = [...model.self.skills];
  skills[2] = { ...skills[2], level: known(0) };
  skills[3] = { ...skills[3], canCast: { ...known(true), availability: 'stale' } };
  skills[4] = { ...skills[4], cooldown: known(9), recharge: known(15), charges: known(1), maxCharges: known(2) };
  model.self.skills = skills;
  await render(model, pro); await click(selfCard());
  const rows = [...container.querySelectorAll('[data-skill-row]')].map(node => node.textContent);
  expect(rows[0]).toContain('พร้อมใช้'); expect(rows[1]).toContain('ติดตัว'); expect(rows[2]).toContain('ยังไม่เรียน');
  expect(rows[3]).not.toContain('พร้อมใช้'); expect(rows[4]).toContain('คูลดาวน์ 9'); expect(rows[5]).toContain('ยังไม่ทราบความพร้อม');
  await click(button('Skill 4')); expect(container.textContent).toContain('ฟื้นชาร์จ 15');
});
it('AC-005/009/016 keeps map mounted and restores focus through detail Esc, inspector Esc and X', async () => {
  const model = fixture(); await render(model, pro);
  const map = container.querySelector('[data-arena-map]')!, layout = map.className;
  const card = selfCard(); await click(card); await click(button('Skill 0'));
  await key(button('Skill 0'), 'Escape'); expect(container.querySelector('[data-detail]')).toBeNull();
  await key(button('Skill 0'), 'Escape'); expect(container.querySelector('[data-inspector]')).toBeNull();
  expect(document.activeElement).toBe(card);
  await key(card, 'Enter'); expect(container.querySelector('[data-inspector]')).not.toBeNull();
  await click(button('ปิดรายละเอียดฮีโร่')); expect(document.activeElement).toBe(card);
  await key(card, ' '); expect(container.querySelector('[data-inspector]')).not.toBeNull();
  const focus = document.activeElement; await render({ ...model }, pro); expect(document.activeElement).toBe(focus);
  await click(button('ดูเหตุการณ์')); await render(model, ABSENT_PRO_GATE); await render(model, pro);
  expect(container.querySelector('[data-arena-map]')).toBe(map); expect(map.className).toBe(layout);
});
it('AC-009 resets backpack, detail and region scroll on hero switches', async () => {
  const model = fixture(); await render(model, pro); await click(selfCard());
  await click(button('กระเป๋าสำรอง')); expect(button('Branch')).toBeTruthy();
  await click(button('Wand'));
  const scroll = container.querySelector<HTMLElement>('.arena-region-scroll')!; scroll.scrollTop = 120;
  await click(container.querySelector<HTMLButtonElement>('[data-hero-card][data-team="enemy"]')!);
  await click(selfCard());
  expect(container.querySelector('[data-detail]')).toBeNull();
  expect(button('Branch')).toBeUndefined(); expect(scroll.scrollTop).toBe(0);
});
it.each(['lapsed', 'revoked', 'unverifiable', 'absent'] as const)('AC-022 removes Pro atomically on %s and never resurrects old detail', async state => {
  const model = fixture(); await render(model, pro); await click(selfCard()); await click(button('Skill 0'));
  const retired = button('Skill 0');
  await render(model, { ...pro, state });
  expect(container.querySelector('[data-inspector], [data-detail]')).toBeNull();
  expect(document.activeElement).toBe(selfCard());
  await render(model, pro); await click(retired);
  expect(container.querySelector('[data-inspector]')).toBeNull();
  expect(container.querySelector('[role="alert"], [role="dialog"]')).toBeNull();
});
it('AC-010 fences selection and late controls across match, source and identity revisions', async () => {
  let model = fixture(); await render(model, pro);
  for (const change of ['match', 'source', 'identity']) {
    await click(selfCard()); await click(button('Skill 0')); const old = button('Skill 0');
    model = { ...model, generation: change, self: { ...model.self, revision: change } };
    await render(model, pro); await click(old);
    expect(container.querySelector('[data-inspector], [data-detail]')).toBeNull();
  }
});
it('AC-023 renders compact enemies and allies without unknown matrices or invented last-seen times', async () => {
  await render(fixture(), pro);
  for (const card of container.querySelectorAll('[data-hero-card]:not([data-team="self"])')) {
    expect(card.textContent).toContain('พบล่าสุด —'); expect(card.textContent).not.toMatch(/HP|MP|Skill|\?/);
  }
});
it('AC-017/024 bounds local activity/events inside the reserved region for both tiers, including empty/stale', async () => {
  const style = document.createElement('style'); style.textContent = arenaCss;
  document.head.append(style);
  const model = fixture();
  for (const gate of [ABSENT_PRO_GATE, pro]) {
    await render(model, gate); await click(button('ดูเหตุการณ์'));
    expect(container.textContent).toContain('ยังไม่มีเหตุการณ์');
    await render({ ...model, activity: [{ id: 'a', at: '10:00', text: 'Existing local event', tone: 'warn' }] }, gate);
    expect(container.textContent).toContain('Existing local event');
    expect(container.textContent).toContain('ข้อมูลเก่า');
    expect(container.querySelector('.arena-events.arena-region-scroll')).not.toBeNull();
    expect(container.querySelector('.arena-page')).not.toBeNull();
    expect(getComputedStyle(container.querySelector('.arena-page')!).overflow).toBe('hidden');
    expect(getComputedStyle(container.querySelector('.arena-events')!).overflow).toBe('auto');
  }
  style.remove();
});

it('AC-004 selects each of ten stable cards and a known marker, withholding unknown markers', async () => {
  const model = fixture();
  model.enemies[0].identity = known('lion', 'cv'); model.enemies[0].visibility = known('seen', 'cv');
  model.source = { epoch: 7, generation: '7', freshness: 'fresh', ageMs: 0, own: null, roster: null, enemySlots: [], visible: ['lion'], missing: [], phase: 'live', warningReady: true,
    health: { healthy: true, backend: 'dxgi', classifier: true, throttled: false, frameAgeMs: 0 },
    cv: { session_epoch: 7, geometry_generation: '1', display_index: 0, display_fingerprint: '3', desktop_origin: [0, 0], region: { x: 0, y: 0, side: 100 }, icon: 10, candidates: [], count: 2, classifier: true,
      detections: [{ name: 'lion', label: 1, x: 25, y: 25, score: 1 }, { name: 'unassociated', label: 2, x: 50, y: 50, score: 1 }] } };
  previewState.current = { ...previewState.current, status: 'live', geometry: { epoch: 7n, generation: 1n, streamId: 1n, region: { x: 0, y: 0, side: 100 }, map_crop: { left: 0, top: 0, right: 1, bottom: 1 }, screenWidth: 1920, screenHeight: 1080, displayIndex: 0, displayFingerprint: 3n, desktopOrigin: [0, 0] } };
  await render(model, pro);
  for (const card of container.querySelectorAll<HTMLButtonElement>('[data-hero-card]')) {
    await click(card); expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-inspector]')).not.toBeNull();
  }
  expect(container.querySelectorAll('.arena-marker')).toHaveLength(1);
  await click(button('เลือกบนแมป Lion'));
  expect(container.querySelector('[data-team="enemy"][aria-pressed="true"]')?.textContent).toContain('Lion');
});

it('AC-021/022 keeps active Pro during source outage, never grants from active state without its feature', async () => {
  const model = fixture(); await render(model, pro); await click(selfCard()); await click(button('Skill 0'));
  await render({ ...model, source: null }, pro);
  expect(container.querySelector('[data-detail]')).not.toBeNull();
  await render(model, { ...pro, features: [] });
  expect(container.querySelector('[data-inspector], [data-detail]')).toBeNull();
  await render(model, pro);
  expect(container.querySelector('[data-inspector]')).toBeNull();
});

it('AC-022/024 keeps event-tab focus and content through tier loss', async () => {
  const model = fixture(); model.activity = [{ id: 'a', at: '10:00', text: 'Local event stays', tone: 'warn' }];
  await render(model, pro); await click(selfCard());
  const tab = container.querySelector<HTMLButtonElement>('.arena-tabs [aria-controls="arena-events-panel"]')!;
  await click(tab);
  const map = container.querySelector('[data-arena-map]');
  await render(model, ABSENT_PRO_GATE);
  expect(document.activeElement).toBe(tab);
  expect(container.textContent).toContain('Local event stays');
  expect(container.querySelector('[data-arena-map]')).toBe(map);
});
