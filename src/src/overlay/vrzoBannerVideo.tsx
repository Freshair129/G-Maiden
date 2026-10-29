import { useEffect, useRef } from 'react'
import type { ModuleCfg } from './modules'
import type { VrzoVisual } from './vrzoBanner'

export function VrzoBannerVideo({ visual, layout, fail }: { visual: VrzoVisual; layout: ModuleCfg; fail: (id: string) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = true
    void video.play().catch(() => {
      console.error('[G-Maiden] VRZO visual playback unavailable')
      fail(visual.id)
    })
    return () => { video.pause(); video.removeAttribute('src'); video.load() }
  }, [visual.id, fail])
  return <video ref={ref} key={visual.id} src={visual.url} muted playsInline autoPlay preload="auto" onEnded={() => fail(visual.id)}
    onError={() => { console.error('[G-Maiden] VRZO visual decoding unavailable'); fail(visual.id) }}
    style={{ position: 'fixed', left: `${layout.x}%`, top: `${layout.y}%`, width: 420,
      maxWidth: '40vw', transform: `translate(-50%, -50%) scale(${layout.scale})`,
      pointerEvents: 'none', zIndex: 40 }} aria-label="VRZO announcer visual" />
}
