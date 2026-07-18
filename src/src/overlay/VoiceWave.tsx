/**
 * Reactive waveform for a fired announcer clip. The BACKEND plays the audible
 * copy; here we decode the SAME clip and run it through an AnalyserNode at gain 0
 * (silent) purely to drive the bars — so the waveform moves with the real sound,
 * not a synthetic playhead. Cosmetic: any failure is swallowed and it renders
 * nothing. Cleans up its AudioContext + rAF on unmount (single-slot banner, so a
 * new event unmounts the old wave and stops its silent source).
 *
 * Extracted from App.tsx so both the (dormant) lite overlay and the Full overlay
 * can render it without a circular App↔FullOverlay value import.
 */
import React, { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export const VoiceWave: React.FC<{ clip: string }> = ({ clip }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    let ctx: AudioContext | null = null
    let src: AudioBufferSourceNode | null = null
    let raf = 0
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await invoke<number[]>('read_audio_bytes', { path: clip })
        if (cancelled) return
        const buf = new Uint8Array(bytes).buffer
        ctx = new AudioContext()
        await ctx.resume().catch(() => {})
        const audio = await ctx.decodeAudioData(buf)
        if (cancelled) { void ctx.close(); return }
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.75
        const gain = ctx.createGain()
        gain.gain.value = 0 // silent — the backend owns the audible playback
        src = ctx.createBufferSource()
        src.buffer = audio
        src.connect(analyser); analyser.connect(gain); gain.connect(ctx.destination)
        src.start()
        const bins = new Uint8Array(analyser.frequencyBinCount)
        const draw = () => {
          const cvs = canvasRef.current
          if (cvs) {
            const c = cvs.getContext('2d')
            if (c) {
              analyser.getByteFrequencyData(bins)
              const W = cvs.width, H = cvs.height, n = bins.length, bw = W / n
              c.clearRect(0, 0, W, H)
              for (let i = 0; i < n; i++) {
                const v = bins[i] / 255
                const bh = Math.max(2, v * H)
                c.fillStyle = `rgba(91,227,167,${0.3 + 0.65 * v})`
                c.fillRect(i * bw + bw * 0.15, (H - bh) / 2, bw * 0.7, bh)
              }
            }
          }
          raf = requestAnimationFrame(draw)
        }
        draw()
      } catch { /* cosmetic — ignore */ }
    })()
    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      try { src?.stop() } catch { /* already stopped */ }
      void ctx?.close()
    }
  }, [clip])
  return <canvas ref={canvasRef} width={280} height={38} style={{ display: 'block', width: 280, height: 38 }} />
}
