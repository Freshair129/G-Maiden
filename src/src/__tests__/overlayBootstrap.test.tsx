// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../app/types'

const { registrations, invokeMock, emitMock, order } = vi.hoisted(() => ({
  registrations: [] as { name: string; resolve: () => void; reject: (reason: Error) => void; dispose: ReturnType<typeof vi.fn> }[],
  invokeMock: vi.fn(), emitMock: vi.fn(), order: [] as string[],
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }))
vi.mock('@tauri-apps/api/event', () => ({
  emit: emitMock,
  listen: vi.fn((name: string) => new Promise<() => void>((resolve, reject) => {
    const dispose = vi.fn()
    registrations.push({ name, dispose, reject, resolve: () => { order.push(`registered:${name}`); resolve(dispose) } })
  })),
}))
vi.mock('../overlay/FullOverlay', () => ({ FullOverlay: () => <output>overlay</output> }))
vi.mock('../overlay/vrzoBannerVideo', () => ({ VrzoBannerVideo: () => null }))
import { Overlay } from '../app/Overlay'

let root: Root | null
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  registrations.length = 0
  order.length = 0
  invokeMock.mockReset().mockImplementation(async (command: string) => { order.push(`invoke:${command}`) })
  emitMock.mockReset().mockImplementation(async (event: string) => { order.push(`emit:${event}`) })
  root = createRoot(document.createElement('div'))
})
afterEach(async () => {
  if (root) await act(async () => { root!.unmount() })
  root = null
  vi.unstubAllGlobals()
})
async function mount(strict = false) {
  await act(async () => { root!.render(strict ? <StrictMode><Overlay initialSettings={DEFAULTS} /></StrictMode> : <Overlay initialSettings={DEFAULTS} />) })
}
async function resolveAll() { await act(async () => { registrations.forEach((entry) => entry.resolve()) }) }
async function unmount() { await act(async () => { root!.unmount(); root = null }) }

it.each([
  'game-tick', 'settings', 'master-context-changed', 'minimap-cv', 'gank-alert', 'gank-clear',
  'gsi-status', 'sensor-health', 'overlay-preview', 'missing-state', 'advice-update',
  'buyback-advice', 'buyback-narrative', 'volume-change', 'preview-kill', 'announcer-banner',
])('waits for %s and native acknowledgement before the settings handshake', async (delayedName) => {
  let acknowledge!: () => void
  invokeMock.mockImplementation((command: string) => {
    order.push(`invoke:${command}`)
    return new Promise<void>((resolve) => { acknowledge = resolve })
  })
  await mount()
  await act(async () => { registrations.filter((entry) => entry.name !== delayedName).forEach((entry) => entry.resolve()) })
  expect(emitMock).not.toHaveBeenCalled()
  expect(invokeMock).not.toHaveBeenCalled()
  await act(async () => { registrations.find((entry) => entry.name === delayedName)!.resolve() })
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('overlay_bootstrap_ready')
  expect(emitMock).not.toHaveBeenCalled()
  await act(async () => { order.push('native-ack'); acknowledge() })
  expect(emitMock).toHaveBeenCalledTimes(1)
  expect(emitMock).toHaveBeenCalledWith('overlay-ready')
  expect(order.indexOf('native-ack')).toBeLessThan(order.indexOf('emit:overlay-ready'))
})

it('does not signal ready when any listener registration fails', async () => {
  await mount()
  await act(async () => {
    for (const entry of registrations) {
      if (entry.name === 'gank-alert') entry.reject(new Error('listener rejected'))
      else entry.resolve()
    }
  })
  expect(invokeMock).not.toHaveBeenCalled()
  expect(emitMock).not.toHaveBeenCalled()
})

it('does not emit the settings handshake when native readiness is rejected', async () => {
  invokeMock.mockRejectedValue(new Error('native deadline expired'))
  await mount()
  await resolveAll()
  expect(emitMock).not.toHaveBeenCalled()
})

it('disposes all registrations that resolve after unmount without a late readiness handshake', async () => {
  await mount()
  await unmount()
  await resolveAll()
  expect(invokeMock).not.toHaveBeenCalled()
  expect(emitMock).not.toHaveBeenCalled()
  expect(registrations.length).toBeGreaterThan(1)
  for (const entry of registrations) expect(entry.dispose).toHaveBeenCalledTimes(1)
})

it('does not emit a late handshake when unmounted while native readiness is pending', async () => {
  let acknowledge!: () => void
  invokeMock.mockImplementation(() => new Promise<void>((resolve) => { acknowledge = resolve }))
  await mount()
  await resolveAll()
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('overlay_bootstrap_ready')
  await unmount()
  await act(async () => { acknowledge() })
  expect(emitMock).not.toHaveBeenCalled()
})

it('only acknowledges the active StrictMode mount and disposes every retired registration', async () => {
  await mount(true)
  await resolveAll()
  expect(invokeMock).toHaveBeenCalledTimes(1)
  expect(invokeMock).toHaveBeenCalledWith('overlay_bootstrap_ready')
  expect(emitMock).toHaveBeenCalledTimes(1)
  expect(emitMock).toHaveBeenCalledWith('overlay-ready')
  await unmount()
  for (const entry of registrations) expect(entry.dispose).toHaveBeenCalledTimes(1)
})
