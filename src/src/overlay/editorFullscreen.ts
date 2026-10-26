import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

type EditorWindow = Pick<ReturnType<typeof getCurrentWindow>, 'isFullscreen' | 'isMaximized' | 'innerSize' | 'outerPosition' | 'setFullscreen' | 'setSize' | 'setPosition'>

/** Own only the temporary control-window change; restore the exact previous geometry. */
export async function enterNativeEditorFullscreen(win: EditorWindow): Promise<() => Promise<void>> {
  const [fullscreen, maximized, size, position] = await Promise.all([
    win.isFullscreen(), win.isMaximized(), win.innerSize(), win.outerPosition(),
  ])
  if (!fullscreen) await win.setFullscreen(true)
  let restored = false
  let restoring: Promise<void> | null = null
  return () => {
    if (restored) return Promise.resolve()
    if (restoring) return restoring
    restoring = (async () => {
      if (!fullscreen) {
        await win.setFullscreen(false)
        if (!maximized) {
          await win.setSize(size)
          await win.setPosition(position)
        }
      }
      restored = true
    })().finally(() => { restoring = null })
    return restoring
  }
}

export async function enterEditorFullscreen(): Promise<() => Promise<void>> {
  if (isTauri()) return enterNativeEditorFullscreen(getCurrentWindow())
  const alreadyFullscreen = !!document.fullscreenElement
  if (!alreadyFullscreen) await document.documentElement.requestFullscreen()
  return async () => { if (!alreadyFullscreen && document.fullscreenElement) await document.exitFullscreen() }
}
