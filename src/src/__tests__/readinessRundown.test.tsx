// @vitest-environment jsdom
import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReadinessRundown } from '../deck/onair'

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
  voicePackName: 'Selected pack',
  signalEnabled: true,
  annEnabled: true,
  masterVolume: 80,
  draftNote: false,
  onPreviewLive: preview,
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  preview.mockClear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function render(overrides: Partial<ComponentProps<typeof ReadinessRundown>> & { gsiFreshness?: string } = {}) {
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
