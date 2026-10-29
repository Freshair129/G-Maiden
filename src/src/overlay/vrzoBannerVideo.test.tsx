// @vitest-environment jsdom
import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VrzoBannerVideo } from './vrzoBannerVideo'
import type { VrzoVisual } from './vrzoBanner'

const visual: VrzoVisual = { id: '42', phase: 'start', clipId: 'kill_01', event: 'kill',
  session_epoch: 2, preview: false, expires_at_ms: 9000, url: '/vrzo-banners/kill_01.webm' }
afterEach(() => { vi.restoreAllMocks() })

describe('VRZO video', () => {
  it('uses only muted local media, reports decoding failure and releases the decoder', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = vi.fn(), container = document.createElement('div'), root = createRoot(container)
    await act(async () => root.render(<VrzoBannerVideo visual={visual} fail={fail} layout={{ x: 80, y: 40, scale: 1, enabled: true }} />))
    const video = container.querySelector('video')!
    expect(video.muted).toBe(true)
    expect(video.getAttribute('src')).toBe('/vrzo-banners/kill_01.webm')
    expect(play).toHaveBeenCalledOnce()
    await act(async () => video.dispatchEvent(new Event('error')))
    expect(fail).toHaveBeenCalledWith('42')
    await act(async () => root.unmount())
    expect(pause).toHaveBeenCalledOnce()
    expect(load).toHaveBeenCalledOnce()
  })
})
