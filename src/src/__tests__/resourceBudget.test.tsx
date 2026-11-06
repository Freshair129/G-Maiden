// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS, type ResourceStats } from '../app/types'
import { C } from '../app/theme'

const { handlers, setSettings } = vi.hoisted(() => ({
  handlers: new Map<string, (event: { payload: unknown }) => void>(), setSettings: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (name: string) => name === 'list_voices' ? [] : name === 'get_capture_mode' ? 'dxgi' : null) }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((name: string, callback: (event: { payload: unknown }) => void) => {
    handlers.set(name, callback)
    return Promise.resolve(() => { handlers.delete(name) })
  }),
}))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ onFocusChanged: () => Promise.resolve(() => {}) }) }))
vi.mock('../app/settingsContext', () => ({ useStartupSettings: () => ({ settings: DEFAULTS, setSettings, clearLegacyMasterApiKey: vi.fn() }) }))
import { Control } from '../app/Control'

let root: Root
let container: HTMLDivElement
function color(value: string) {
  const node = document.createElement('span')
  node.style.color = value
  return node.style.color
}
function reading(name: 'RAM' | 'CPU') {
  return [...container.querySelectorAll('span')].find((span) => span.textContent?.startsWith(`${name}:`))!
}
async function sample(ram_mb: number, cpu_pct = 1) {
  const payload: ResourceStats = { ram_mb, cpu_pct, cpu_group_processes: 8, over_budget: ram_mb > 900 || cpu_pct > 10 }
  await act(async () => { handlers.get('resource-stats')!({ payload }) })
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  localStorage.setItem('gm-onboarded', '1')
  handlers.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<Control category="modules" />) })
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it.each([600, 835, 899.999, 900, 900.001, 901])('uses the approved 900 MB budget at a real reading of %s MB', async (ram) => {
  await sample(ram)
  expect(reading('RAM').textContent).toBe(`RAM: ${ram.toFixed(0)} MB / 900 MB`)
  expect(reading('RAM').style.color).toBe(color(ram > 900 ? C.bad : C.ok))
  expect(container.textContent?.includes('เกิน budget')).toBe(ram > 900)
})

it('preserves the CPU 10% boundary independently of the increased RAM limit', async () => {
  await sample(600, 10)
  expect(reading('CPU').style.color).toBe(color(C.ok))
  expect(container.textContent).not.toContain('เกิน budget')
  await sample(600, 10.001)
  expect(reading('CPU').style.color).toBe(color(C.bad))
  expect(container.textContent).toContain('เกิน budget')
})

it('preserves unknown CPU display and capture-throttle warning', async () => {
  await sample(600, -1)
  expect(reading('CPU').textContent).toBe('CPU: — / 10%')
  expect(reading('CPU').style.color).toBe(color(C.warn))
  expect(container.textContent).toContain('CPU reading unavailable — capture throttle active')
  expect(container.textContent).not.toContain('เกิน budget')
})

it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('shows unavailable RAM instead of a green or over-budget reading for %s', async (ram) => {
  await sample(ram)
  expect(reading('RAM').textContent).toBe('RAM: — / 900 MB')
  expect(reading('RAM').style.color).toBe(color(C.warn))
  expect(container.textContent).toContain('RAM reading unavailable')
  expect(container.textContent).not.toContain('เกิน budget')
  expect(reading('CPU').textContent).toBe('CPU: 1.0% / 10%')
})

it('keeps a finite zero RAM reading available', async () => {
  await sample(0)
  expect(reading('RAM').textContent).toBe('RAM: 0 MB / 900 MB')
  expect(reading('RAM').style.color).toBe(color(C.ok))
  expect(container.textContent).not.toContain('RAM reading unavailable')
})

it('does not fabricate resource readings before the first sample', () => {
  expect(reading('RAM')).toBeUndefined()
  expect(reading('CPU')).toBeUndefined()
})
