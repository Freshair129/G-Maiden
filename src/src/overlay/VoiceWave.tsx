/**
 * Native playback owns the sound and supplies bounded spectrum metadata for
 * the same clip. Keep the visual playhead anchored to the banner's mount time,
 * so a late metadata response cannot restart the waveform from the beginning.
 * Cosmetic failures render nothing; no browser audio device is needed.
 *
 * Extracted from App.tsx so both the (dormant) lite overlay and the Full overlay
 * can render it without a circular App↔FullOverlay value import.
 */
import React, { useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

type Waveform = { interval_ms: number; duration_ms: number; frames: number[][] }

function validWaveform(value: unknown): value is Waveform {
  if (!value || typeof value !== 'object') return false
  const wave = value as Waveform
  return Number.isInteger(wave.interval_ms) && wave.interval_ms > 0
    && Number.isInteger(wave.duration_ms) && wave.duration_ms > 0 && wave.duration_ms <= 30_000
    && Array.isArray(wave.frames) && wave.frames.length > 0 && wave.frames.length <= 600
    && wave.frames.length >= Math.ceil(wave.duration_ms / wave.interval_ms)
    && wave.frames.every((frame) => Array.isArray(frame) && frame.length === 64
      && frame.every((bin) => Number.isInteger(bin) && bin >= 0 && bin <= 255))
}

export const VoiceWave: React.FC<{ clip: string }> = ({ clip }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const started = performance.now()
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    const clear = () => { if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height) }
    let raf: number | null = null
    let cancelled = false
    clear()
    ;(async () => {
      try {
        const wave = await invoke<unknown>('read_audio_waveform', { path: clip })
        if (cancelled || !canvas || !context || !validWaveform(wave)) return
        const draw = () => {
          raf = null
          if (cancelled) return
          const elapsed = Math.max(0, performance.now() - started)
          if (elapsed >= wave.duration_ms) { clear(); return }
          const bins = wave.frames[Math.floor(elapsed / wave.interval_ms)]
          const W = canvas.width, H = canvas.height, n = bins.length, bw = W / n
          clear()
          for (let i = 0; i < n; i++) {
            const v = bins[i] / 255
            const bh = Math.max(2, v * H)
            context.fillStyle = `rgba(91,227,167,${0.3 + 0.65 * v})`
            context.fillRect(i * bw + bw * 0.15, (H - bh) / 2, bw * 0.7, bh)
          }
          raf = requestAnimationFrame(draw)
        }
        draw()
      } catch { /* cosmetic — ignore */ }
    })()
    return () => {
      cancelled = true
      if (raf !== null) cancelAnimationFrame(raf)
      clear()
    }
  }, [clip])
  return <canvas ref={canvasRef} width={280} height={38} style={{ display: 'block', width: 280, height: 38 }} />
}
