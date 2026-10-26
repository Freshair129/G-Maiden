import { describe, expect, it, vi } from 'vitest'
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window'
import { enterNativeEditorFullscreen } from '../overlay/editorFullscreen'

function windowMock(fullscreen = false, maximized = false) {
  return {
    isFullscreen: vi.fn().mockResolvedValue(fullscreen), isMaximized: vi.fn().mockResolvedValue(maximized),
    innerSize: vi.fn().mockResolvedValue(new PhysicalSize(1200, 780)),
    outerPosition: vi.fn().mockResolvedValue(new PhysicalPosition(-1600, 120)),
    setFullscreen: vi.fn().mockResolvedValue(undefined), setSize: vi.fn().mockResolvedValue(undefined), setPosition: vi.fn().mockResolvedValue(undefined),
  }
}
describe('temporary fullscreen editor', () => {
  it('restores physical size and position, including a secondary monitor, only once', async () => {
    const win = windowMock()
    const restore = await enterNativeEditorFullscreen(win)
    expect(win.setFullscreen).toHaveBeenCalledWith(true)
    await restore(); await restore()
    expect(win.setFullscreen.mock.calls).toEqual([[true], [false]])
    expect(win.setSize).toHaveBeenCalledWith(new PhysicalSize(1200, 780))
    expect(win.setPosition).toHaveBeenCalledWith(new PhysicalPosition(-1600, 120))
    expect(win.setPosition).toHaveBeenCalledTimes(1)
  })
  it('does not exit a pre-existing fullscreen state', async () => {
    const win = windowMock(true)
    await (await enterNativeEditorFullscreen(win))()
    expect(win.setFullscreen).not.toHaveBeenCalled()
    expect(win.setSize).not.toHaveBeenCalled()
  })
  it('lets the OS restore a maximized window without overwriting its geometry', async () => {
    const win = windowMock(false, true)
    await (await enterNativeEditorFullscreen(win))()
    expect(win.setFullscreen.mock.calls).toEqual([[true], [false]])
    expect(win.setSize).not.toHaveBeenCalled()
  })
  it('propagates entry failure', async () => {
    const win = windowMock()
    win.setFullscreen.mockRejectedValueOnce(new Error('denied'))
    await expect(enterNativeEditorFullscreen(win)).rejects.toThrow('denied')
  })
  it('coalesces close and unmount restoration', async () => {
    const win = windowMock()
    const restore = await enterNativeEditorFullscreen(win)
    await Promise.all([restore(), restore()])
    expect(win.setFullscreen.mock.calls).toEqual([[true], [false]])
    expect(win.setPosition).toHaveBeenCalledTimes(1)
  })
  it('allows retry after restoring geometry fails', async () => {
    const win = windowMock()
    win.setPosition.mockRejectedValueOnce(new Error('busy'))
    const restore = await enterNativeEditorFullscreen(win)
    await expect(restore()).rejects.toThrow('busy')
    await restore()
    expect(win.setPosition).toHaveBeenCalledTimes(2)
  })
})
