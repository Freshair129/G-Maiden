import { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { ModuleCfg } from './modules'
import type { VrzoVisual } from './vrzoBanner'
import { VrzoVideoPool } from './vrzoVideoPool'

export function VrzoBannerVideo({ visual, layout, fail }: { visual: VrzoVisual | null; layout: ModuleCfg; fail: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const pool = useRef<VrzoVideoPool | null>(null)
  const failRef = useRef(fail)
  failRef.current = fail
  useEffect(() => {
    if (!host.current) return
    const current = new VrzoVideoPool(host.current, id => failRef.current(id), receipt => {
      void invoke('record_announcer_visual', { ...receipt }).catch(() => {})
    })
    pool.current = current
    let active = true
    const subscription = listen<unknown>('announcer-visual-warm', ({ payload }) => { if (active) current.candidates(payload) })
    void subscription.then(() => {
      if (active) void invoke<unknown>('announcer_visual_warm_candidates').then(batch => { if (active) current.candidates(batch) }).catch(() => {})
    }).catch(() => {})
    return () => {
      active = false; current.dispose(); pool.current = null
      void subscription.then(unlisten => unlisten()).catch(() => {})
    }
  }, [])
  useEffect(() => { pool.current?.show(visual, layout) }, [visual, layout])
  return <div ref={host} data-vrzo-video-pool="" />
}
