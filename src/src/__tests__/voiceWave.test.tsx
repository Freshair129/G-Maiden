// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { VoiceWave } from '../overlay/VoiceWave'

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))

let root: Root
let container: HTMLDivElement
let mounted: boolean
let now: number
let nextRaf: number
let callbacks: Map<number, FrameRequestCallback>
let context: { clearRect: ReturnType<typeof vi.fn>; fillRect: ReturnType<typeof vi.fn>; fillStyle: string }
let audioContext: ReturnType<typeof vi.fn>
let audio: ReturnType<typeof vi.fn>
const frame = (value: number) => Array.from({ length: 64 }, () => value)
const waveform = () => ({ interval_ms: 50, duration_ms: 200, frames: [frame(0), frame(64), frame(128), frame(255)] })

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise<unknown>((done) => { resolve = done })
  return { promise, resolve }
}
async function render(clip = 'C:\\voice-cache\\packs\\original\\kill.wav') {
  await act(async () => { root.render(<VoiceWave clip={clip} />) })
}
async function tick(time: number) {
  now = time
  const pending = [...callbacks.values()]
  callbacks.clear()
  await act(async () => { for (const callback of pending) callback(time) })
}

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  invokeMock.mockReset().mockResolvedValue(waveform())
  mounted = true
  now = 1000
  nextRaf = 0
  callbacks = new Map()
  context = { clearRect: vi.fn(), fillRect: vi.fn(), fillStyle: '' }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    callbacks.set(++nextRaf, callback)
    return nextRaf
  }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => { callbacks.delete(id) }))
  audioContext = vi.fn((): unknown => { throw new Error('browser audio hardware must not be opened') })
  audio = vi.fn((): unknown => { throw new Error('browser Audio must not be created') })
  vi.stubGlobal('AudioContext', audioContext)
  vi.stubGlobal('Audio', audio)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  if (mounted) await act(async () => { root.unmount() })
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('reads only bounded native spectrum metadata and preserves the existing 64-bar canvas style', async () => {
  await render()
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('read_audio_waveform', { path: 'C:\\voice-cache\\packs\\original\\kill.wav' })
  expect(audioContext).not.toHaveBeenCalled()
  expect(audio).not.toHaveBeenCalled()
  const canvas = container.querySelector('canvas')!
  expect([canvas.width, canvas.height, canvas.style.width, canvas.style.height]).toEqual([280, 38, '280px', '38px'])
  expect(context.fillRect).toHaveBeenCalledTimes(64)
  expect(context.fillRect.mock.calls[0]).toEqual([280 / 64 * 0.15, 18, 280 / 64 * 0.7, 2])
  expect(context.fillStyle).toBe('rgba(91,227,167,0.3)')
  expect(callbacks.size).toBe(1)
})

it('anchors the playhead to effect mount rather than a late metadata response', async () => {
  const pending = deferred()
  invokeMock.mockReturnValue(pending.promise)
  await render()
  now = 1125
  await act(async () => { pending.resolve(waveform()) })
  expect(context.fillRect).toHaveBeenCalledTimes(64)
  expect(context.fillRect.mock.calls[0][3]).toBeCloseTo(128 / 255 * 38)
  await tick(1150)
  expect(context.fillRect.mock.calls[64][3]).toBe(38)
  expect(context.fillStyle).toBe('rgba(91,227,167,0.95)')
})

it('stops animation and clears the waveform at clip duration', async () => {
  await render()
  await tick(1199)
  expect(callbacks.size).toBe(1)
  context.fillRect.mockClear()
  await tick(1200)
  expect(callbacks.size).toBe(0)
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 280, 38)
})

it('does not start an already expired late waveform', async () => {
  const pending = deferred()
  invokeMock.mockReturnValue(pending.promise)
  await render()
  now = 1201
  await act(async () => { pending.resolve(waveform()) })
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(0)
})

it('ignores late metadata after unmount and disposes a running animation', async () => {
  const pending = deferred()
  invokeMock.mockReturnValue(pending.promise)
  await render()
  await act(async () => { root.unmount() })
  mounted = false
  await act(async () => { pending.resolve(waveform()) })
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(0)
})

it('cancels an active animation on unmount', async () => {
  await render()
  const active = [...callbacks.keys()][0]
  await act(async () => { root.unmount() })
  mounted = false
  expect(cancelAnimationFrame).toHaveBeenCalledWith(active)
  expect(callbacks.size).toBe(0)
  expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 280, 38)
})

it('disposes the old clip and ignores its late response after a clip change', async () => {
  const old = deferred()
  invokeMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(waveform())
  await render('old.wav')
  now = 1050
  await render('new.wav')
  expect(context.fillRect).toHaveBeenCalledTimes(64)
  context.fillRect.mockClear()
  await act(async () => { old.resolve({ ...waveform(), frames: [frame(255), frame(255), frame(255), frame(255)] }) })
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(1)
  await tick(1100)
  expect(context.fillRect.mock.calls[0][3]).toBeCloseTo(64 / 255 * 38)
})

it('cancels a running old clip while replacement metadata is pending', async () => {
  await render('old.wav')
  const oldAnimation = [...callbacks.keys()][0]
  const pending = deferred()
  invokeMock.mockReturnValueOnce(pending.promise)
  now = 1050
  await render('new.wav')
  expect(cancelAnimationFrame).toHaveBeenCalledWith(oldAnimation)
  expect(callbacks.size).toBe(0)
  context.fillRect.mockClear()
  now = 1100
  await act(async () => { pending.resolve(waveform()) })
  expect(context.fillRect.mock.calls[0][3]).toBeCloseTo(64 / 255 * 38)
  expect(callbacks.size).toBe(1)
})

it('keeps failed metadata cosmetic and blank without browser audio fallback', async () => {
  invokeMock.mockRejectedValue(new Error('unavailable'))
  await render()
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(0)
  expect(audioContext).not.toHaveBeenCalled()
  expect(audio).not.toHaveBeenCalled()
})

it('accepts the native maximum of 600 frames and stops at 30 seconds', async () => {
  invokeMock.mockResolvedValue({ interval_ms: 50, duration_ms: 30_000, frames: Array.from({ length: 600 }, () => frame(64)) })
  await render()
  expect(context.fillRect).toHaveBeenCalledTimes(64)
  await tick(30_999)
  expect(callbacks.size).toBe(1)
  await tick(31_000)
  expect(callbacks.size).toBe(0)
})

it('ignores the retired StrictMode mount response while the current mount remains active', async () => {
  const retired = deferred()
  invokeMock.mockReturnValueOnce(retired.promise).mockResolvedValueOnce(waveform())
  await act(async () => { root.render(<StrictMode><VoiceWave clip="strict.wav" /></StrictMode>) })
  expect(invokeMock).toHaveBeenCalledTimes(2)
  expect(context.fillRect).toHaveBeenCalledTimes(64)
  context.fillRect.mockClear()
  await act(async () => { retired.resolve(waveform()) })
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(1)
})

it.each([
  null,
  { ...waveform(), interval_ms: 0 },
  { ...waveform(), interval_ms: -50 },
  { ...waveform(), interval_ms: Number.NaN },
  { ...waveform(), duration_ms: Number.POSITIVE_INFINITY },
  { ...waveform(), duration_ms: 0, frames: [] },
  { ...waveform(), duration_ms: 1.5 },
  { ...waveform(), duration_ms: -1 },
  { ...waveform(), duration_ms: 30_001 },
  { ...waveform(), frames: [] },
  { ...waveform(), frames: Array.from({ length: 601 }, () => frame(1)) },
  { ...waveform(), frames: [Array.from({ length: 63 }, () => 1)] },
  { ...waveform(), frames: [frame(256), frame(1), frame(1), frame(1)] },
  { ...waveform(), frames: [frame(Number.NaN), frame(1), frame(1), frame(1)] },
  { ...waveform(), frames: [frame(1.5), frame(1), frame(1), frame(1)] },
  { ...waveform(), duration_ms: 200, frames: [frame(1)] },
].map((payload, index) => ({ name: `case ${index}`, payload })))('rejects invalid or unbounded waveform metadata: $name', async ({ payload }) => {
  invokeMock.mockResolvedValue(payload)
  await render()
  expect(context.fillRect).not.toHaveBeenCalled()
  expect(callbacks.size).toBe(0)
  expect(audioContext).not.toHaveBeenCalled()
  expect(audio).not.toHaveBeenCalled()
})
