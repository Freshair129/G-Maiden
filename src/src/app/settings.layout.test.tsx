// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT, type Layout } from '../overlay/modules'
import { DEFAULTS, type OverlayProfile } from './types'
import { mergeStoredSettings, normalizeSettings } from './settingsSchema'
import { loadProfiles } from './theme'

const { invokeMock, emitMock, listenMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  emitMock: vi.fn(),
  listenMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock, isTauri: () => false }))
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock, emitTo: emitMock, listen: listenMock }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onFocusChanged: async () => () => {} }),
}))

import { StartupSettingsProvider } from './settings'
import { useStartupSettings } from './settingsContext'
import { Control } from './Control'

// Verbatim pre-reset owner layout: banner and standby already used #91 defaults.
const OWNER_LAYOUT: Layout = {"alert":{"x":50,"y":20,"scale":1,"enabled":true},"gmeter":{"x":7,"y":47,"scale":1,"enabled":true},"toast":{"x":50,"y":24,"scale":1,"enabled":true},"companion":{"x":7,"y":39,"scale":1,"enabled":true},"advice":{"x":50,"y":72,"scale":1,"enabled":true},"buyback":{"x":50,"y":63,"scale":1,"enabled":true},"missing":{"x":88,"y":12,"scale":1,"enabled":true},"banner":{"x":89,"y":44,"scale":0.7,"enabled":true},"lowhp":{"x":50,"y":44,"scale":1,"enabled":true},"vol":{"x":20,"y":95,"scale":1,"enabled":true},"standby":{"x":93,"y":10,"scale":0.85,"enabled":true},"clock":{"x":4,"y":4,"scale":1,"enabled":true},"kda":{"x":9.5,"y":4,"scale":1,"enabled":true},"gold":{"x":15,"y":4,"scale":1,"enabled":true},"gpm":{"x":20.5,"y":4,"scale":1,"enabled":true},"xpm":{"x":20.5,"y":10,"scale":1,"enabled":false},"nw":{"x":26,"y":4,"scale":1,"enabled":true},"score":{"x":75,"y":4,"scale":1,"enabled":false},"hero":{"x":14,"y":33,"scale":1,"enabled":false}}

// Independent snapshot of the owner's post-reset (#91) layout, not derived from production defaults.
const OWNER_POST_RESET_LAYOUT: Layout = {
  alert: { x: 89, y: 54, scale: 0.75, enabled: true },
  gmeter: { x: 89, y: 26, scale: 0.9, enabled: true },
  toast: { x: 89, y: 67, scale: 0.7, enabled: true },
  companion: { x: 82, y: 5, scale: 0.8, enabled: true },
  advice: { x: 89, y: 75, scale: 0.75, enabled: true },
  buyback: { x: 89, y: 84, scale: 0.75, enabled: true },
  missing: { x: 89, y: 33, scale: 0.8, enabled: true },
  banner: { x: 89, y: 44, scale: 0.7, enabled: true },
  lowhp: { x: 89, y: 61, scale: 0.8, enabled: true },
  vol: { x: 78, y: 94, scale: 0.8, enabled: true },
  standby: { x: 93, y: 10, scale: 0.85, enabled: true },
  clock: { x: 78, y: 13, scale: 1, enabled: true },
  score: { x: 84.5, y: 13, scale: 1, enabled: true },
  kda: { x: 91, y: 13, scale: 1, enabled: true },
  gold: { x: 97, y: 13, scale: 1, enabled: true },
  gpm: { x: 84.5, y: 19, scale: 1, enabled: true },
  xpm: { x: 91, y: 19, scale: 1, enabled: false },
  nw: { x: 97, y: 19, scale: 1, enabled: true },
  hero: { x: 79.5, y: 35, scale: 0.8, enabled: false },
}

describe.each([
  ['pre-reset', OWNER_LAYOUT],
  ['post-reset', OWNER_POST_RESET_LAYOUT],
] as const)('%s owner overlay layout migration', (_name, ownerLayout) => {
  it('migrates every legacy-equal module in the exact owner layout without mutating it', () => {
    const original = JSON.stringify(ownerLayout)
    const settings = mergeStoredSettings(null, { layout: ownerLayout }, null)

    expect(settings.layout).toEqual(DEFAULT_LAYOUT)
    expect(settings.layout.banner).toEqual({ x: 50, y: 13, scale: 0.45, enabled: true })
    expect(settings.layout.standby).toEqual(ownerLayout.standby)
    expect(JSON.stringify(ownerLayout)).toBe(original)
  })

  it('also migrates the actual pre-#91 banner and standby defaults', () => {
    const settings = normalizeSettings({ layout: {
      ...ownerLayout,
      banner: { x: 84, y: 27, scale: 1, enabled: true },
      standby: { x: 92, y: 14, scale: 1, enabled: true },
    } })

    expect(settings.layout).toEqual(DEFAULT_LAYOUT)
  })

  it.each([
    { x: 7.5 },
    { y: 40 },
    { scale: 1.1 },
    { enabled: false },
  ])('preserves a module customized with %j while migrating other modules', (change) => {
    const companion = { ...ownerLayout.companion, ...change }
    const settings = normalizeSettings({ layout: { ...ownerLayout, companion } })

    expect(settings.layout).toEqual({ ...DEFAULT_LAYOUT, companion })
  })

  it('preserves a disabled-by-default module that the user enabled', () => {
    const score = { ...OWNER_LAYOUT.score, enabled: true }
    const settings = normalizeSettings({ layout: { ...ownerLayout, score } })

    expect(settings.layout).toEqual({ ...DEFAULT_LAYOUT, score })
  })

  it('is unchanged after serializing and normalizing the migrated layout again', () => {
    const migrated = normalizeSettings({ layout: ownerLayout })
    expect(migrated.layout).toEqual(DEFAULT_LAYOUT)
    expect(normalizeSettings(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
  })

  it.each([{ x: 88.5 }, { y: 43.5 }, { scale: 0.8 }, { enabled: false }])(
    'preserves a customized #91 banner (%j)', change => {
      const banner = { ...OWNER_POST_RESET_LAYOUT.banner, ...change }
      expect(normalizeSettings({ layout: { ...ownerLayout, banner } }).layout)
        .toEqual({ ...DEFAULT_LAYOUT, banner })
    },
  )
})

function LayoutProbe() {
  const { settings, setSettings } = useStartupSettings()
  return <>
    <output data-testid="layout">{JSON.stringify(settings.layout)}</output>
    <button data-testid="reapply-layout" onClick={() => setSettings(previous => ({ ...previous, layout: { ...previous.layout } }))}>Reapply layout</button>
  </>
}

describe.each([
  ['pre-reset', OWNER_LAYOUT],
  ['post-reset', OWNER_POST_RESET_LAYOUT],
] as const)('persisted %s overlay layouts', (_name, ownerLayout) => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('gm-onboarded', '1')
    invokeMock.mockReset().mockImplementation((command: string) => {
      if (command === 'load_settings_file') return Promise.resolve(JSON.stringify({ layout: ownerLayout }))
      if (command === 'list_voices') return Promise.resolve([])
      return Promise.resolve(undefined)
    })
    emitMock.mockReset().mockResolvedValue(undefined)
    listenMock.mockReset().mockResolvedValue(() => {})
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount() })
    root = null
    container?.remove()
    container = null
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  async function mount(children: ReactNode) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(<StartupSettingsProvider>{children}</StartupSettingsProvider>)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
  }

  function renderedLayout(): Layout {
    return JSON.parse(container?.querySelector('[data-testid="layout"]')?.textContent ?? 'null')
  }

  function nativeSaves() {
    return invokeMock.mock.calls.filter(([command]) => command === 'save_settings_file')
  }

  it('rewrites the migrated snapshot once through existing browser and native saves', async () => {
    await mount(<LayoutProbe />)

    expect(renderedLayout()).toEqual(DEFAULT_LAYOUT)
    expect(JSON.parse(localStorage.getItem('gm-settings') ?? '{}').layout).toEqual(DEFAULT_LAYOUT)
    expect(nativeSaves()).toHaveLength(1)
    expect(JSON.parse(nativeSaves()[0][1].json).layout).toEqual(DEFAULT_LAYOUT)

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-testid="reapply-layout"]')?.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(renderedLayout()).toEqual(DEFAULT_LAYOUT)
    expect(nativeSaves()).toHaveLength(1)
  })

  it('migrates stored profile layouts when loaded without changing other profile settings', () => {
    const profile: OverlayProfile = { ...DEFAULTS, name: 'Legacy profile', layout: ownerLayout, opacity: 0.6 }
    localStorage.setItem('gm-profiles', JSON.stringify([profile]))

    expect(loadProfiles()[0]).toEqual({ ...profile, layout: DEFAULT_LAYOUT })
  })

  it('migrates profile layouts through their apply button and preserves customized modules', async () => {
    const companion = { ...ownerLayout.companion, enabled: false }
    // Keep a valid custom position/scale outside the editor's geometry limits.
    const gmeter = { x: 1, y: 1, scale: 2, enabled: true }
    const profile: OverlayProfile = {
      ...DEFAULTS,
      name: 'Saved legacy layout',
      opacity: 0.6,
      layout: { ...ownerLayout, companion, gmeter },
    }
    localStorage.setItem('gm-profiles', JSON.stringify([profile]))
    const expectedLayout = { ...DEFAULT_LAYOUT, companion, gmeter }
    await mount(<><Control category="overlay" /><LayoutProbe /></>)
    const applyButton = [...container!.querySelectorAll('button')].find(button => button.textContent === profile.name)
    expect(applyButton).toBeDefined()
    await act(async () => {
      applyButton!.click()
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(renderedLayout()).toEqual(expectedLayout)
    expect(JSON.parse(localStorage.getItem('gm-settings') ?? '{}')).toMatchObject({ layout: expectedLayout, opacity: 0.6 })
    expect(nativeSaves()).toHaveLength(2)
    expect(JSON.parse(nativeSaves()[1][1].json).layout).toEqual(expectedLayout)
  })
})
