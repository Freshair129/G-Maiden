// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppUpdate } from '../useAppUpdate'
const mocks = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), relaunch: vi.fn() }))
vi.mock('../updateChannel', () => ({ checkChannelUpdate: mocks.check, installPendingUpdate: mocks.install }))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: mocks.relaunch }))
let root: Root
let container: HTMLDivElement
let snapshot: ReturnType<typeof useAppUpdate>
function Probe() { snapshot = useAppUpdate(); return null }
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  root = createRoot(container)
  vi.clearAllMocks()
  mocks.check.mockResolvedValue({ version: '1.0.0', notes: '', channel: 'stable' })
})
afterEach(async () => { await act(async () => root.unmount()) })
it('keeps the update available and explains native match deferral without relaunching', async () => {
  mocks.install.mockRejectedValue('ปิด Dota 2 ก่อนติดตั้งอัปเดต')
  await act(async () => root.render(<Probe />))
  expect(snapshot.available).not.toBeNull()
  await act(() => snapshot.install())
  expect(snapshot.phase).toBe('error')
  expect(snapshot).toHaveProperty('error', 'ปิด Dota 2 ก่อนติดตั้งอัปเดต')
  expect(snapshot.available?.version).toBe('1.0.0')
  expect(mocks.relaunch).not.toHaveBeenCalled()
})
