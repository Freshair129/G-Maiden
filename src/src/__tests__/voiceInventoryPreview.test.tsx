// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import VoiceInventory from '../VoiceInventory'
import type { VoiceEvent, VoicePack, VoiceState } from '../voice-types'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

function event(id: string, clip: string | null, fallback: string | null): VoiceEvent {
  return {
    id, group: 'combat', label: id, subtitle: '', thai: id, accent: '#64c7ff',
    defaultClipCount: fallback ? 1 : 0, defaultClipUrl: fallback,
    mapping: clip ? {
      text: id, thai: id, banner: '', bannerAsset: '', bannerUrl: null,
      clip: 'clips/kill.wav', clips: ['clips/kill.wav'], hasClip: true, clipCount: 1,
      clipUrl: clip, clipOptions: [{ path: 'clips/kill.wav', name: 'kill.wav', url: clip }]
    } : null
  }
}
function pack(id: string, name: string): VoicePack {
  return {
    id, name, version: '1', locale: 'th-TH', author: 'Local', description: '',
    path: `C:\\voice-cache\\packs\\${id}`, coveredEvents: 1, totalEvents: 3, clips: 1,
    availableClips: [], availableBanners: [], coverImage: '', coverImageUrl: null, builtIn: false,
    items: [
      event('kill', `C:\\voice-cache\\packs\\${id}\\clips\\kill.wav`, 'C:\\voice-pack-default\\kill\\1.wav'),
      event('respawn', null, 'C:\\voice-pack-default\\respawn\\1.wav'),
      event('danger', null, null)
    ]
  }
}
let root: Root
let container: HTMLDivElement
let browserAudio: ReturnType<typeof vi.fn>

beforeEach(async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const original = pack('original', 'Original')
  const state: VoiceState = {
    rootDir: 'C:\\voice-cache', packsDir: 'C:\\voice-cache\\packs', cacheDir: 'C:\\voice-cache',
    activePackId: original.id, activePack: original,
    packs: [original, pack('selected-other', 'Other')],
    groups: [{ id: 'combat', label: 'Combat', accent: '#64c7ff' }]
  }
  invokeMock.mockReset().mockImplementation((command: string) => Promise.resolve(command === 'voice_api_state' ? state : undefined))
  browserAudio = vi.fn((): unknown => { throw new Error('preview must use native playback') })
  vi.stubGlobal('Audio', browserAudio)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root.render(<VoiceInventory />) })
  await act(async () => { container.querySelectorAll<HTMLButtonElement>('button.voice-card')[1].click() })
  invokeMock.mockClear()
})

afterEach(async () => {
  await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('previews the selected non-active pack through native audio without banner or activation', async () => {
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Play kill"]')!.click() })
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('preview_voice_event_audio', { packId: 'selected-other', event: 'kill' })
  expect(browserAudio).not.toHaveBeenCalled()
  expect(container.querySelector('.voice-detail h3')?.textContent).toBe('Other')
  expect(container.querySelector('.voice-inventory-sub')?.textContent).toContain('Original')
})

it('keeps an unmapped ANN event silent rather than substituting another pack voice', async () => {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Play respawn"]')!
  expect(button.disabled).toBe(true)
  await act(async () => { button.click() })
  expect(invokeMock).not.toHaveBeenCalled()
  expect(browserAudio).not.toHaveBeenCalled()
})

it('keeps events with no playable clip disabled', async () => {
  const button = container.querySelector<HTMLButtonElement>('[aria-label="Play danger"]')!
  expect(button.disabled).toBe(true)
  await act(async () => { button.click() })
  expect(invokeMock).not.toHaveBeenCalled()
})

it('retains the explicit overlay preview action separately', async () => {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find((entry) => entry.textContent === 'Preview overlay')!
  await act(async () => { button.click() })
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('preview_announcer_event', { packId: 'selected-other', event: 'kill' })
  expect(browserAudio).not.toHaveBeenCalled()
})

it('displays native preview errors without activating a pack or invoking a banner', async () => {
  invokeMock.mockRejectedValueOnce(new Error('Selected clip is unavailable'))
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Play kill"]')!.click() })
  expect(container.querySelector('.voice-toast.err')?.textContent).toBe('Selected clip is unavailable')
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('preview_voice_event_audio', { packId: 'selected-other', event: 'kill' })
  expect(browserAudio).not.toHaveBeenCalled()
  expect(container.querySelector('.voice-inventory-sub')?.textContent).toContain('Original')
})
