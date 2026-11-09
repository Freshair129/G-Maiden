// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReadinessRundown } from '../deck/onair'
import type { SensorHealth } from '../live/events'

vi.mock('../companion', () => ({
  latestBackendReceiptAt: () => 0,
  toneClass: () => '',
}))

let root: Root
let container: HTMLDivElement
const preview = vi.fn()
const defaults = {
  gsiOnline: false,
  gsiFreshness: 'waiting' as const,
  sensorHealth: null,
  resourceSample: null,
  voicePackName: 'Selected pack',
  signalEnabled: true,
  annEnabled: true,
  masterVolume: 80,
  draftNote: false,
  onPreviewLive: preview,
}
const healthySensor: SensorHealth = {
  backend: 'dxgi', classifier: true, throttled: false, frameAgeMs: 20, healthy: true,
}
const runtimeLabels = ['เชื่อมต่อ GSI', 'จับภาพ/minimap', 'ทรัพยากร', 'Overlay', 'เสียงออก']

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  preview.mockClear()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render(overrides: Partial<ComponentProps<typeof ReadinessRundown>> = {}) {
  await act(async () => root.render(<ReadinessRundown {...defaults} {...overrides} />))
}
function row(label: string) {
  const found = Array.from(container.querySelectorAll('.gm-rundown-row'))
    .find((element) => element.querySelector('.gm-rundown-label')?.textContent === label)
  expect(found, label).toBeDefined()
  return found as HTMLElement
}

it('does not treat enabled switches, a pack name or volume as verified runtime readiness', async () => {
  await render()
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(0)
  expect(container.textContent).not.toContain('พร้อม')
  expect(row('G-Signal').textContent).toContain('เปิด')
  expect(row('เสียงประกาศ ANN').textContent).toContain('เปิด')
  expect(row('G-Signal').textContent).toContain('ยังไม่ยืนยัน')
  expect(row('เสียงประกาศ ANN').textContent).toContain('ยังไม่ยืนยัน')
  expect(row('แพ็กเสียง').textContent).toContain('Selected pack')
  expect(row('ระดับเสียง').textContent).toContain('80%')
})

it.each(['stale', 'waiting', 'unavailable'] as const)('does not pass GSI when freshness is %s despite the online flag', async (gsiFreshness) => {
  await render({ gsiOnline: true, gsiFreshness })
  expect(row('เชื่อมต่อ GSI').classList.contains('ready')).toBe(false)
  expect(row('เชื่อมต่อ GSI').textContent).not.toContain('✓')
})

it('passes only fresh active GSI and withdraws the check when the connection becomes inactive', async () => {
  await render({ gsiOnline: true, gsiFreshness: 'fresh' })
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(1)
  expect(row('เชื่อมต่อ GSI').textContent).toContain('✓')
  await render({ gsiOnline: false, gsiFreshness: 'fresh' })
  expect(row('เชื่อมต่อ GSI').classList.contains('ready')).toBe(false)
})

it('retains explicit disabled and muted choices without claiming a failed device', async () => {
  await render({ signalEnabled: false, annEnabled: false, masterVolume: 0, voicePackName: null })
  expect(row('G-Signal').textContent).toContain('ปิด')
  expect(row('เสียงประกาศ ANN').textContent).toContain('ปิด')
  expect(row('ระดับเสียง').textContent).toContain('ปิดเสียง')
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(0)
})

it('keeps preview available without turning the preview action into a readiness pass', async () => {
  await render()
  const button = container.querySelector('button')
  expect(button).not.toBeNull()
  await act(async () => button?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  expect(preview).toHaveBeenCalledTimes(1)
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(0)
})

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101])('keeps invalid volume %s unknown rather than ready or deliberately muted', async (masterVolume) => {
  await render({ masterVolume })
  expect(row('ระดับเสียง').textContent).toContain('ยังไม่ทราบ')
  expect(row('ระดับเสียง').classList.contains('ready')).toBe(false)
})

it('keeps every runtime row unknown when all runtime inputs are null', async () => {
  await render({ gsiOnline: null, gsiFreshness: null })
  for (const label of runtimeLabels) expect(row(label).textContent).toContain('ยังไม่ทราบ')
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(0)
  expect(container.textContent).not.toContain('✓')
  expect(Array.from(container.querySelectorAll('.gm-rundown-label')).slice(0, 5).map(el => el.textContent)).toEqual(runtimeLabels)
})

it('keeps omitted runtime inputs unknown', async () => {
  await render({ gsiOnline: undefined, gsiFreshness: undefined, sensorHealth: undefined, resourceSample: undefined })
  for (const label of runtimeLabels) expect(row(label).textContent).toContain('ยังไม่ทราบ')
  expect(container.textContent).not.toContain('✓')
})

it('labels Lite mode explicitly as degraded', async () => {
  await render({ sensorHealth: { ...healthySensor, backend: 'lite', healthy: false, classifier: false, frameAgeMs: null } })
  expect(row('จับภาพ/minimap').textContent).toContain('Lite mode · ไม่มี minimap CV')
  expect(row('จับภาพ/minimap').classList.contains('degraded')).toBe(true)
  expect(row('จับภาพ/minimap').querySelector('.gm-rundown-glyph')?.textContent).toBe('!')
})

it('reports capture evidence without passing minimap coverage and withdraws it on loss', async () => {
  await render({ sensorHealth: healthySensor })
  expect(row('จับภาพ/minimap').textContent).toContain('จับภาพทำงาน · ยังไม่ยืนยัน coverage')
  expect(row('จับภาพ/minimap').textContent).not.toContain('✓')
  await render({ sensorHealth: null })
  expect(row('จับภาพ/minimap').textContent).toContain('ยังไม่ทราบ')
})

it('keeps unhealthy capture and missing classifiers degraded', async () => {
  await render({ sensorHealth: { ...healthySensor, healthy: false } })
  expect(row('จับภาพ/minimap').classList.contains('degraded')).toBe(true)
  await render({ sensorHealth: { ...healthySensor, classifier: false } })
  expect(row('จับภาพ/minimap').classList.contains('degraded')).toBe(true)
  expect(row('จับภาพ/minimap').textContent).not.toContain('✓')
})

it('uses the governor budget verdict and never upgrades one resource sample to a pass', async () => {
  await render({ resourceSample: { ramMb: 500, cpuPct: 3, overBudget: true } })
  expect(row('ทรัพยากร').textContent).toContain('เกินงบ')
  expect(row('ทรัพยากร').classList.contains('degraded')).toBe(true)
  await render({ resourceSample: { ramMb: 500, cpuPct: 3, overBudget: false } })
  expect(row('ทรัพยากร').textContent).toContain('ล่าสุด 500 MB · CPU 3% · ยังไม่ยืนยันทั้งแมตช์')
  expect(row('ทรัพยากร').querySelector('.gm-rundown-glyph')?.textContent).toBe('○')
  expect(row('ทรัพยากร').classList.contains('ready')).toBe(false)
})

it('keeps missing resource sensors unknown', async () => {
  await render({ resourceSample: { ramMb: -1, cpuPct: -1, overBudget: false } })
  expect(row('ทรัพยากร').textContent).toContain('ยังไม่ทราบ')
  expect(row('ทรัพยากร').textContent).not.toContain('✓')
})

it('does not present a missing individual resource metric as a measurement', async () => {
  await render({ resourceSample: { ramMb: -1, cpuPct: 3, overBudget: false } })
  expect(row('ทรัพยากร').textContent).toContain('ล่าสุด — MB · CPU 3%')
  await render({ resourceSample: { ramMb: 500, cpuPct: -1, overBudget: false } })
  expect(row('ทรัพยากร').textContent).toContain('ล่าสุด 500 MB · CPU —%')
})

it('keeps overlay and audio unknown even with other healthy runtime evidence and configured audio', async () => {
  await render({ gsiOnline: true, gsiFreshness: 'fresh', sensorHealth: healthySensor, resourceSample: { ramMb: 500, cpuPct: 3, overBudget: false } })
  expect(row('Overlay').textContent).toContain('ยังไม่ทราบ')
  expect(row('เสียงออก').textContent).toContain('ยังไม่ทราบ · รอ audio health')
  expect(container.querySelectorAll('.gm-rundown-row.ready')).toHaveLength(1)
  expect(row('เชื่อมต่อ GSI').textContent).toContain('✓')
})

it('does not use MOCK telemetry when the raw resource sample is null', async () => {
  const { MOCK, FALLBACK } = await vi.importActual<typeof import('../companion')>('../companion')
  expect(MOCK.telemetry.cpuLoad).toBeGreaterThan(0)
  expect(MOCK.resourceSample).toBeNull()
  expect(FALLBACK.resourceSample).toBeNull()
  await render({ resourceSample: MOCK.resourceSample })
  expect(row('ทรัพยากร').textContent).toContain('ยังไม่ทราบ')
  expect(row('ทรัพยากร').textContent).not.toContain('MB')
})

it('reserves a visible +N row when the bounded list cannot fit all rows', async () => {
  let remeasure: () => void = () => {}
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { remeasure = callback }
    observe() {}
    disconnect() {}
  })
  let height = 138
  let rowHeight = '30px'
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('gm-rundown-list') ? height : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.isConnected ? 30 : 0
  })
  const realStyle = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = realStyle(element)
    if (element.classList.contains('gm-rundown-list')) Object.defineProperty(style, 'rowGap', { value: '6px' })
    if (element.classList.contains('gm-rundown-row')) Object.defineProperty(style, 'height', { value: rowHeight })
    return style
  })
  await render({ draftNote: true })
  expect(container.querySelectorAll('.gm-rundown-row')).toHaveLength(4)
  expect(container.textContent).toContain('+6')
  expect(container.querySelector('button')?.textContent).toContain('ดูหน้าจอสด')
  // offsetHeight rounds fractional CSS pixels; four rows would be clipped here.
  height = 139
  rowHeight = '30.4px'
  await act(async () => remeasure())
  expect(container.querySelectorAll('.gm-rundown-row')).toHaveLength(3)
  expect(container.textContent).toContain('+7')
  height = 30
  await act(async () => remeasure())
  expect(container.querySelectorAll('.gm-rundown-row')).toHaveLength(1)
  expect(container.textContent).toContain('+9')
  height = 400
  await act(async () => remeasure())
  expect(container.querySelectorAll('.gm-rundown-row')).toHaveLength(9)
  expect(container.textContent).not.toContain('+6')
})
