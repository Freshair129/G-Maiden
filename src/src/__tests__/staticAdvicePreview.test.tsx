// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DeckActions } from '../shortcuts'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
import MaidenLine from '../MaidenLine'
import { AudioSettingsCard } from '../app/cards/AudioSettingsCard'

let root: Root
let container: HTMLDivElement
const actions: DeckActions = {
  setTab: vi.fn(), openPalette: vi.fn(), openSheet: vi.fn(), closeOverlays: vi.fn(),
  toggleAnn: vi.fn(), toggleSignal: vi.fn(), focusSeat: vi.fn(), openContextMenuAtFocus: vi.fn(),
  setQuality: vi.fn(), toggleDensity: vi.fn(),
}
beforeEach(() => {
  vi.useFakeTimers()
  invokeMock.mockReset().mockImplementation((command: string) => {
    if (command === 'get_master_context_generation') return Promise.resolve(7)
    if (command === 'voice_cache_status') return Promise.resolve({ dir: 'fixture', total: 1, counts: { advice: 1 } })
    return Promise.resolve(null)
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.clearAllTimers()
  vi.useRealTimers()
})

it('keeps Maiden Line static voice preview behind the current native generation', async () => {
  await act(async () => { root.render(<MaidenLine open onClose={vi.fn()} onOpenSheet={vi.fn()} actions={actions} matchPhase="standby" quality="balanced" />) })
  await act(async () => { (container.querySelector('#gm-palette-opt-test-voice') as HTMLElement).click() })
  expect(invokeMock).toHaveBeenCalledWith('get_master_context_generation')
  expect(invokeMock).toHaveBeenCalledWith('preview_static_advice_voice', expect.objectContaining({ adviceGeneration: 7 }))
})

it('keeps the advice-pack preview behind the current native generation', async () => {
  await act(async () => { root.render(<AudioSettingsCard />) })
  const adviceLabel = [...container.querySelectorAll('span')].find((span) => span.textContent === 'advice')!
  const play = adviceLabel.parentElement!.parentElement!.querySelector('button')!
  await act(async () => { play.click() })
  expect(invokeMock).toHaveBeenCalledWith('get_master_context_generation')
  expect(invokeMock).toHaveBeenCalledWith('preview_static_advice_voice', expect.objectContaining({ adviceGeneration: 7 }))
})
