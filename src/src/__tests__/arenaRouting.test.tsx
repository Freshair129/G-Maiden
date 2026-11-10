// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../app/types';
import { emptyPartyView } from '../party/partyModel';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}), emit: vi.fn(async () => {}) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: async () => () => {}, setSize: vi.fn(), startDragging: vi.fn() }) }));
vi.mock('../app/settingsContext', () => ({ useStartupSettings: () => ({ settings: DEFAULTS, setSettings: vi.fn() }) }));
vi.mock('../auth', () => ({ useAuth: () => ({ session: null }) }));
vi.mock('../profile', () => ({ useProfile: () => ({ displayName: '', email: '' }) }));
vi.mock('../useAppUpdate', () => ({ useAppUpdate: () => ({ available: null, phase: 'idle' }) }));
vi.mock('../companion', async original => {
  const actual = await original<typeof import('../companion')>();
  return { ...actual, useCompanionData: () => ({ data: actual.FALLBACK }) };
});
vi.mock('../MinimapCanvas', () => ({ MinimapCanvas: () => <canvas /> }));
// Other pages retain their existing own suites; here their entry components identify the route.
vi.mock('../VoicePacksPage', () => ({ default: () => <div>Voice route</div> }));
vi.mock('../StorePage', () => ({ default: () => <div>Store route</div> }));
vi.mock('../AccountPage', () => ({ default: () => <div>Account route</div> }));
vi.mock('../CompanionPages', () => ({ BuildAdvisorPage: () => <div>Build route</div>, CvHeroesPage: () => <div>CV route</div>, InsightsPage: () => <div>Insights route</div>, HistoryPage: () => <div>History route</div> }));
import CommandDeck from '../CommandDeck';

let root: Root, container: HTMLDivElement;
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers();
  localStorage.clear(); localStorage.setItem('gm-onboarded', '1');
  invoke.mockReset().mockImplementation(async (command: string) => command === 'party_get_state' ? emptyPartyView() : command === 'voice_api_state' ? { activePack: null } : null);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await Promise.all([import('../arena/ArenaPage'), import('../party/GPartyPage')]);
  await act(async () => root.render(<CommandDeck />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function nav(title: string) { await act(async () => container.querySelector<HTMLButtonElement>(`button.g-nav-item[title="${title}"]`)!.click()); }
async function tab(label: string) { await act(async () => [...container.querySelectorAll<HTMLButtonElement>('.deck-tabs button')].find(node => node.textContent === label)!.click()); }

it('AC-001/015/021 keeps seven pages, Live tabs, shortcuts and the single Party owner with production Base Arena', async () => {
  expect(container.querySelectorAll('.g-nav-item')).toHaveLength(7);
  await nav('Live');
  expect(container.querySelector('[aria-label="สนาม G-Arena"]')).not.toBeNull();
  expect([...container.querySelectorAll('.deck-tabs button')].map(node => node.textContent)).toEqual(['สด', 'บิลด์', 'ฮีโร่ CV', 'G-Party']);
  await tab('บิลด์'); expect(container.textContent).toContain('Build route');
  await tab('ฮีโร่ CV'); expect(container.textContent).toContain('CV route');
  await tab('G-Party'); expect(container.querySelector('.g-party-workspace')).not.toBeNull();
  await tab('สด');
  await act(async () => container.querySelector<HTMLButtonElement>('[data-hero-card]')!.click());
  expect(container.querySelector('[data-inspector]')).toBeNull();
  for (const title of ['Voice', 'Store', 'Insights', 'Account', 'Settings', 'Dashboard']) await nav(title);
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', ctrlKey: true, bubbles: true })));
  expect(container.querySelector('[aria-label="สนาม G-Arena"]')).not.toBeNull();
  expect(invoke.mock.calls.filter(([command]) => command === 'party_get_state')).toHaveLength(1);
  expect(invoke.mock.calls.some(([command]) => ['party_connect', 'party_leave', 'party_join_social'].includes(command))).toBe(false);
});
