import React, { useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { FullOverlay } from '../overlay/FullOverlay'
import { VoiceWave } from '../overlay/VoiceWave'
import { STREAK_LABELS } from '../overlay/streaks'
import { crossedAnyLevelUpMilestone, crossedLevelUpMilestones } from '../personaMilestones'
import type {
  GameTick, MinimapCv, GankAlert, EnemyMissing, AdviceUpdate, ReviveAdvice, GsiStatus,
  Settings, GankState, PersonaEvent,
} from './types'
import { DEFAULTS } from './types'
import { C } from './theme'
import { DANGER_LINE, PERSONA_LINES, REVISION_LINES } from './lines'
import { fmtClock, heroName, overlayPanel, Bar, Stat, sep, dangerStyle, gankStyle, gankClearStyle, killBannerStyle, packBannerStyle } from './primitives'

export const Overlay: React.FC = () => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(DEFAULTS)
  // G-Signal gank banner + CV debug feed (item A & B).
  const [gank, setGank] = useState<GankState>(null)
  const [cv, setCv] = useState<MinimapCv | null>(null)
  // G2.6: set of hero names currently flagged as missing by G-Sentry.
  const [missingHeroes, setMissingHeroes] = useState<Set<string>>(new Set())
  // G5.4: latest advice from G-Master, shown as an in-overlay panel.
  const [overlayAdvice, setOverlayAdvice] = useState<string | null>(null)
  const adviceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // G-Revive: buyback verdict shown while the player is dead. `advice` is the
  // deterministic verdict; `narrative` is the local-SLM voiced line that arrives
  // a beat later on `buyback-narrative`. Cleared on respawn.
  const [buyback, setBuyback] = useState<{ advice: ReviveAdvice; narrative: string | null } | null>(null)
  // GSI activity from the watchdog — so the HUD disappears when Dota closes
  // (Dota stops POSTing without a final tick; `tick` would otherwise stay stale).
  const [gsiActive, setGsiActive] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)
  // #6: mirror each Maiden voice line as a transient on-screen toast so triggers
  // are verifiable even before the voice pack / TTS is finalized (debug aid —
  // becomes a user toggle in the overlay redesign). The voice still fires too.
  const [toast, setToast] = useState<{ event: string; text: string } | null>(null)
  // Kill banner state: 'show' → visible, 'exit' → fading out, null → hidden.
  const [killBanner, setKillBanner] = useState<{
    phase: 'show' | 'exit'; kills: number; streak: number; victim: string | null
  } | null>(null)
  const killTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const killStreak = useRef(0)
  const lastKillHeroes = useRef<Set<string>>(new Set())
  // Pack banner (announcer bundle) — the active voice pack's image for a fired
  // event. When present it REPLACES the built-in kill card; falls back to the
  // card when the pack has no banner for that event. Driven by the backend
  // `announcer-banner` event so the image and the voiced clip fire together.
  const [packBanner, setPackBanner] = useState<{
    phase: 'show' | 'exit'; url: string | null; text: string; thai: string; clip: string | null
  } | null>(null)
  const packBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Volume toast — brief on-screen feedback when player uses Alt+Up/Down/M.
  const [volToast, setVolToast] = useState<number | null>(null)
  const volToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // rising-edge state for danger: speak once when HP crosses the threshold down,
  // not every tick. Reset when HP recovers or the hero dies/respawns.
  const dangerActive = useRef(false)
  const lastSpokeAt = useRef(0)
  // What Maiden last said (so Belief Revision can retract a danger line specifically)
  // and the HP at the moment she warned, so we can detect a real recovery.
  const lastSpokeKind = useRef<'danger' | 'persona' | 'revision' | null>(null)
  const dangerHpAtSpeak = useRef(0)
  // Previous tick for transition detection (level up, kill, death, respawn).
  // We don't snapshot the whole tick — only the fields that drive a persona line.
  const prev = useRef<{ level: number; kills: number; deaths: number; alive: boolean; mana: number; hp: number } | null>(null)
  const manaActive = useRef(false)
  // Auto-advice trigger memory (in clock_time seconds; -Infinity = never fired).
  // Per-key cooldown keeps the Plan quota honest even if multiple triggers fire close together.
  const recentDeathClock = useRef<number | null>(null)
  const advisedAt = useRef<Record<string, number>>({})
  const sRef = useRef(s)
  sRef.current = s
  useEffect(() => {
    const u1 = listen<GameTick>('game-tick', (e) => { setTick(e.payload); setSeen(true) })
    const u2 = listen<Settings>('settings', (e) => setS({ ...DEFAULTS, ...e.payload, uiMode: 'full' }))
    // CV debug feed — fires 8–15 Hz. Cheap setState; only rendered when cvDebug is on.
    const u3 = listen<MinimapCv>('minimap-cv', (e) => {
      if (!sRef.current.cvDebug) return
      setCv(e.payload)
    })
    // G-Signal: show banner on alert, retract on clear (Belief Revision visual echo).
    const u4 = listen<GankAlert>('gank-alert', (e) => {
      if (gankClearTimer.current) { clearTimeout(gankClearTimer.current); gankClearTimer.current = null }
      setGank({ phase: 'alert', heroes: e.payload.missing_heroes ?? [], probability: e.payload.probability })
      if (gankTimer.current) clearTimeout(gankTimer.current)
      // auto-dismiss after ~6s if no gank-clear arrives
      gankTimer.current = setTimeout(() => setGank(null), 6000)
    })
    const u5 = listen('gank-clear', () => {
      if (gankTimer.current) { clearTimeout(gankTimer.current); gankTimer.current = null }
      setGank({ phase: 'clear' })
      // G2.6: clear the missing-hero indicator when G-Signal retracts.
      setMissingHeroes(new Set())
      // brief soft echo, then fade out; don't re-show until a new gank-alert
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      gankClearTimer.current = setTimeout(() => setGank(null), 2200)
    })
    const u6 = listen<GsiStatus>('gsi-status', (e) => setGsiActive(e.payload.gsi_active))
    const u7 = listen<boolean>('preview-mode', (e) => setPreviewMode(e.payload))
    // G2.6: G-Sentry missing-hero events — accumulate into a set; clear when gank clears.
    const u8 = listen<EnemyMissing>('enemy-missing', (e) => {
      setMissingHeroes((prev) => new Set([...prev, e.payload.hero]))
      // auto-clear the hero from the indicator after 30s (they probably re-appeared)
      setTimeout(() => setMissingHeroes((prev) => { const n = new Set(prev); n.delete(e.payload.hero); return n }), 30_000)
    })
    // G5.4: Advice panel — show for 20s then dismiss.
    const u9 = listen<AdviceUpdate>('advice-update', (e) => {
      if (!e.payload.cached) {
        setOverlayAdvice(e.payload.text)
        if (adviceTimer.current) clearTimeout(adviceTimer.current)
        adviceTimer.current = setTimeout(() => setOverlayAdvice(null), 20_000)
      }
    })
    // G-Revive: buyback verdict card. `buyback-advice` carries the deterministic
    // verdict (broadcast, so it shows regardless of which window triggered the
    // request); `buyback-narrative` follows with Maiden's voiced line.
    const uBA = listen<ReviveAdvice>('buyback-advice', (e) => {
      setBuyback({ advice: e.payload, narrative: null })
    })
    const uBN = listen<string>('buyback-narrative', (e) => {
      setBuyback((b) => (b ? { ...b, narrative: e.payload } : b))
    })
    const u10 = listen<number>('volume-change', (e) => {
      setVolToast(e.payload)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      volToastTimer.current = setTimeout(() => setVolToast(null), 1500)
    })
    // Kill-banner preview (fired from the settings panel so users can see/hear
    // the kill/streak banner without being in a match).
    const uK = listen<{ streak: number; victim: string | null }>('preview-kill', (e) => {
      if (killTimer.current) clearTimeout(killTimer.current)
      setKillBanner({ phase: 'show', kills: 0, streak: e.payload.streak, victim: e.payload.victim })
      killTimer.current = setTimeout(() => {
        setKillBanner((kb) => kb ? { ...kb, phase: 'exit' } : null)
        killTimer.current = setTimeout(() => setKillBanner(null), 800)
      }, 4000)
    })
    // Announcer bundle: the active pack's banner image for a fired event. Only
    // shows when the pack actually maps an image (bannerUrl); otherwise we leave
    // the built-in kill card to handle it. Clears the card so we never stack both.
    const uPB = listen<{ event: string; bannerData: string | null; bannerText: string; thai: string; clip: string | null }>('announcer-banner', (e) => {
      // Show the bundle banner when the pack maps an image OR a voice clip fired —
      // a voice-only event still gets the transcript + reactive waveform strip.
      if ((!e.payload.bannerData && !e.payload.clip) || !sRef.current.killVisuals) return
      if (killTimer.current) { clearTimeout(killTimer.current); killTimer.current = null }
      setKillBanner(null)
      if (packBannerTimer.current) clearTimeout(packBannerTimer.current)
      setPackBanner({ phase: 'show', url: e.payload.bannerData, text: e.payload.bannerText, thai: e.payload.thai, clip: e.payload.clip })
      packBannerTimer.current = setTimeout(() => {
        setPackBanner((pb) => pb ? { ...pb, phase: 'exit' } : null)
        packBannerTimer.current = setTimeout(() => setPackBanner(null), 800)
      }, 4000)
    })
    void emit('overlay-ready')
    return () => {
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f())
      void u4.then((f) => f()); void u5.then((f) => f()); void u6.then((f) => f())
      void u7.then((f) => f()); void u8.then((f) => f()); void u9.then((f) => f())
      void u10.then((f) => f()); void uK.then((f) => f()); void uPB.then((f) => f())
      void uBA.then((f) => f()); void uBN.then((f) => f())
      if (gankTimer.current) clearTimeout(gankTimer.current)
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      if (adviceTimer.current) clearTimeout(adviceTimer.current)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      if (packBannerTimer.current) clearTimeout(packBannerTimer.current)
    }
  }, [])

  // #6: auto-dismiss the event toast 4s after the most recent voice event.
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  // ── All hooks below run EVERY render, before any early return. React requires
  // a constant hook order; an early `return` above these (as there was) makes the
  // hook count change when a match starts and crashes the overlay. They guard on
  // `tick` internally instead. ──
  const lowHp = !!tick && tick.in_game && s.alertEnabled && tick.alive
    && tick.hp_percent > 0 && tick.hp_percent <= s.alertThreshold

  // Speak on the rising edge (alive + crossing the line). Re-arm when safe again,
  // and throttle to at most once every 8s in case HP flickers across the line.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    if (!tick.alive || tick.hp_percent > s.alertThreshold + 5) {
      dangerActive.current = false
      return
    }
    if (lowHp && !dangerActive.current && s.voiceEnabled) {
      const now = Date.now()
      if (now - lastSpokeAt.current > 8000) {
        lastSpokeAt.current = now
        dangerActive.current = true
        lastSpokeKind.current = 'danger'
        dangerHpAtSpeak.current = tick.hp_percent
        setToast({ event: 'danger', text: DANGER_LINE })
        if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'danger', line: DANGER_LINE, context: { hp: tick.hp_percent, clock: tick.clock_time, level: tick.level } }).catch(() => {})
        void invoke('speak_event', { event: 'danger', fallback: DANGER_LINE, voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})
      }
    }
  }, [lowHp, tick, tick?.in_game, tick?.alive, tick?.hp_percent, s.alertThreshold, s.voiceEnabled, s.voiceName, s.voiceRate])

  // Belief Revision (CLAUDE.md): if Maiden just yelled "ถอย!" but the danger
  // evaporated within ~2.5s (player got a kill, or HP swung well above safe),
  // kill the in-flight line and replace with a self-correcting one.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || lastSpokeKind.current !== 'danger') return
    const sinceSpoke = Date.now() - lastSpokeAt.current
    if (sinceSpoke > 2500 || sinceSpoke < 100) return  // out of window / same tick
    const hpRecovered = tick.hp_percent >= dangerHpAtSpeak.current + 25 && tick.hp_percent > s.alertThreshold + 15
    const gotKill = tick.kills > p.kills
    if (!hpRecovered && !gotKill) return
    const pool = REVISION_LINES.dangerRetracted
    const line = pool[Math.floor(Math.random() * pool.length)]
    lastSpokeAt.current = Date.now()
    lastSpokeKind.current = 'revision'
    dangerActive.current = false  // arm danger again so a fresh crossing can re-warn
    setToast({ event: 'revision', text: line })
    if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'revision', line, context: { hp: tick.hp_percent, clock: tick.clock_time } }).catch(() => {})
    void invoke('cancel_speech').catch(() => {})
    // brief gap lets the killed SAPI process die before the new one starts,
    // otherwise Windows audio sometimes squashes the first syllable
    setTimeout(() => {
      void invoke('speak_event', { event: 'revision', fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
    }, 90)
  }, [tick, tick?.in_game, tick?.hp_percent, tick?.kills, s.alertThreshold])

  // Persona events — detect transitions vs. the previous tick. We minimum-gap
  // every utterance to 6s and skip persona lines whenever a danger line is
  // already due, so Maiden never talks over her own warnings.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    prev.current = { level: tick.level, kills: tick.kills, deaths: tick.deaths, alive: tick.alive, mana: tick.mana_percent, hp: tick.hp_percent }
    if (!p || !sRef.current.voiceEnabled || !sRef.current.personaLines) return
    if (lowHp) return // don't talk over a danger warning

    const events: PersonaEvent[] = []
    if (crossedAnyLevelUpMilestone(p.level, tick.level)) events.push('levelUp')
    if (tick.kills > p.kills) events.push('kill')
    if (p.alive && !tick.alive) events.push('death')
    if (!p.alive && tick.alive) events.push('respawn')

    // mana-low rising edge: <= 15% while alive; clear at > 25%.
    if (tick.alive && tick.mana_percent > 0 && tick.mana_percent <= 15 && !manaActive.current) {
      events.push('manaLow')
      manaActive.current = true
    } else if (tick.mana_percent > 25) {
      manaActive.current = false
    }
    if (events.length === 0) return

    const now = Date.now()
    if (now - lastSpokeAt.current < 6000) return
    // Pick the highest-priority event in order: death > respawn > kill > levelUp > manaLow
    const order: PersonaEvent[] = ['death', 'respawn', 'kill', 'levelUp', 'manaLow']
    const evt = order.find((e) => events.includes(e))!
    const pool = PERSONA_LINES[evt]
    const line = pool[Math.floor(Math.random() * pool.length)]
    lastSpokeAt.current = now
    lastSpokeKind.current = 'persona'
    setToast({ event: evt, text: line })
    if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: evt, line, context: { clock: tick.clock_time, level: tick.level, kills: tick.kills, deaths: tick.deaths } }).catch(() => {})
    void invoke('speak_event', { event: evt, fallback: line, voice: sRef.current.voiceName || null, rate: sRef.current.voiceRate }).catch(() => {})
  }, [tick, tick?.in_game, tick?.level, tick?.kills, tick?.deaths, tick?.alive, tick?.mana_percent, lowHp])

  // Kill banner — pop variant-B banner for 3.5s whenever the player scores a kill.
  // Guess victim from the set of heroes G-Sentry flagged missing (best we can do
  // without a dedicated kill-feed in GSI). Track consecutive kills for streak badge.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || tick.kills <= p.kills) return
    if (killTimer.current) clearTimeout(killTimer.current)
    killStreak.current += 1
    const missing = [...missingHeroes]
    const seen = lastKillHeroes.current
    // exact victim from the backend (CR-010) if resolved, else guess from the
    // G-Sentry missing set (best we can do without a dedicated GSI kill feed).
    const victim = tick.last_victim_hero || missing.find((h) => !seen.has(h)) || missing[0] || null
    if (victim) seen.add(victim)
    setKillBanner({ phase: 'show', kills: tick.kills, streak: killStreak.current, victim })
    killTimer.current = setTimeout(() => {
      setKillBanner((kb) => kb ? { ...kb, phase: 'exit' } : null)
      killTimer.current = setTimeout(() => setKillBanner(null), 800)
    }, 4000)
  }, [tick?.in_game, tick?.kills])
  // Reset streak on death + fire the G-Revive buyback verdict; clear on respawn.
  // Uses its OWN prev-alive ref rather than the shared `prev.current`: the persona
  // effect above overwrites `prev.current` at the top of its body (and runs first,
  // every tick), so reading it here would always miss the alive→dead edge.
  const prevAlive = useRef<boolean | null>(null)
  useEffect(() => {
    if (!tick) return
    const was = prevAlive.current
    prevAlive.current = tick.alive
    if (was === null) return
    if (was && !tick.alive) {
      killStreak.current = 0
      lastKillHeroes.current.clear()
      // G-Revive: ask the backend for this death's buyback verdict. The verdict
      // returns immediately (deterministic) and is broadcast on `buyback-advice`
      // — the listener above owns display; the voiced narrative follows on
      // `buyback-narrative`. Fire-and-forget; ignore errors (SLM/CLI absent).
      if (tick.in_game) void invoke('request_buyback_advice', { tick }).catch(() => {})
    }
    if (!was && tick.alive) {
      setBuyback(null) // respawned — dismiss the card
    }
  }, [tick?.alive])

  // Auto-advice (G-Master proactive). Fires Claude Plan request + speaks the
  // result on key moments: ult level milestones and a death-streak (2 deaths
  // within 5 clock-min). Per-trigger cooldown 10 clock-min; server-side
  // throttle (30s wallclock) also caps quota use.
  useEffect(() => {
    if (!tick || !tick.in_game) return
    const p = prev.current
    if (!p || !sRef.current.masterEnabled || !sRef.current.autoAdvice || !sRef.current.voiceEnabled) return

    type Trigger = { key: string }
    const triggers: Trigger[] = []

    for (const milestone of crossedLevelUpMilestones(p.level, tick.level)) {
      triggers.push({ key: `lvl${milestone}` })
    }
    if (tick.deaths > p.deaths) {
      const last = recentDeathClock.current
      if (last !== null && tick.clock_time - last > 0 && tick.clock_time - last < 300) {
        triggers.push({ key: 'deathStreak' })
      }
      recentDeathClock.current = tick.clock_time
    }

    for (const trig of triggers) {
      const last = advisedAt.current[trig.key] ?? -Infinity
      if (tick.clock_time - last < 600) continue
      advisedAt.current[trig.key] = tick.clock_time
      void (async () => {
        // Budget gate — silent throttle when the user set a USD ceiling in the
        // QuotaCard and we've blown past it. Only auto-triggers are gated;
        // the manual ask button stays available (= explicit user intent).
        try {
          const raw = localStorage.getItem('gm-quota-budget')
          if (raw) {
            const budget = JSON.parse(raw) as Partial<{ sessionUsd: number; weeklyUsd: number }>
            const hasBudget = (typeof budget.sessionUsd === 'number' && budget.sessionUsd > 0)
              || (typeof budget.weeklyUsd === 'number' && budget.weeklyUsd > 0)
            if (hasBudget) {
              const stats = await invoke<{ session: { cost_usd: number }; weekly: { cost_usd: number } }>('read_usage')
              if (typeof budget.sessionUsd === 'number' && budget.sessionUsd > 0
                  && stats.session.cost_usd >= budget.sessionUsd) return
              if (typeof budget.weeklyUsd === 'number' && budget.weeklyUsd > 0
                  && stats.weekly.cost_usd >= budget.weeklyUsd) return
            }
          }
        } catch { /* budget parse failure -> let the request through */ }
        return invoke<{ text: string; cached: boolean }>('request_advice', { tick })
        .then((a) => {
          if (!a?.text) return
          setToast({ event: 'advice', text: a.text })
          if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'advice', line: a.text, context: { clock: tick.clock_time, level: tick.level } }).catch(() => {})
          void invoke('speak_event', {
            event: 'advice',
            fallback: a.text,
            voice: sRef.current.voiceName || null,
            rate: sRef.current.voiceRate,
          }).catch(() => {})
        })
        .catch(() => { /* claude CLI missing or login fail — silent in auto mode */ })
      })()
    }
  }, [tick?.in_game, tick?.level, tick?.deaths, tick?.clock_time])

  const wrap: React.CSSProperties = s.position === 'custom'
    ? { position: 'fixed', left: `${s.customX}%`, top: `${s.customY}%`, transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }
    : {
        position: 'fixed', inset: 0, background: 'transparent', display: 'flex',
        justifyContent: s.position === 'left' ? 'flex-start' : s.position === 'right' ? 'flex-end' : 'center',
        alignItems: 'flex-start', padding: 12, pointerEvents: 'none',
      }

  // B. CV debug overlay (calibration) — full-screen, screen px == overlay px.
  // OFF by default; drawn only when settings.cvDebug is on.
  const cvDebug = s.cvDebug && cv ? (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <div style={{
        position: 'absolute', left: cv.region.x, top: cv.region.y, width: cv.region.side, height: cv.region.side,
        border: `1px solid ${C.ice}`, boxShadow: '0 0 8px rgba(143,212,255,0.4)',
      }} />
      {cv.candidates.map(([cx, cy], i) => (
        <div key={`c${i}`} style={{
          position: 'absolute', left: cv.region.x + cx, top: cv.region.y + cy, width: cv.icon, height: cv.icon,
          border: '1px solid rgba(143,212,255,0.35)', borderRadius: 2,
        }} />
      ))}
      {cv.detections.map((d, i) => (
        <div key={`d${i}`} style={{ position: 'absolute', left: cv.region.x + d.x, top: cv.region.y + d.y }}>
          <div style={{ width: cv.icon, height: cv.icon, border: `1.5px solid ${C.warn}`, borderRadius: 2, boxShadow: '0 0 6px rgba(255,207,107,0.5)' }} />
          <div style={{ fontSize: 9.5, color: C.warn, whiteSpace: 'nowrap', marginTop: 1, textShadow: '0 0 3px #000' }}>{heroName(d.name)} {(d.score * 100).toFixed(0)}%</div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: cv.region.x, top: cv.region.y - 16, fontSize: 10.5, color: C.ice, textShadow: '0 0 3px #000', whiteSpace: 'nowrap' }}>
        CV: {cv.count} cand · {cv.detections.length} det · {cv.classifier ? 'ONNX' : 'candidate-only'}
      </div>
    </div>
  ) : null

  // G2.6: Enemy-missing indicator — compact badge list. Shows which heroes
  // G-Sentry has flagged missing >5s but haven't yet hit the 85% gank threshold.
  // Only shown when NOT already in a full gank-alert (to avoid double-messaging).
  const missingBadge = missingHeroes.size > 0 && !gank && s.gankVisuals ? (
    <div style={{
      background: 'rgba(18,20,28,0.78)', border: `1px solid rgba(255,207,107,0.45)`,
      borderRadius: 10, padding: '6px 14px', fontFamily: '"Segoe UI", system-ui, sans-serif',
      fontSize: 12.5, color: C.warn, display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
    }}>
      <span style={{ opacity: 0.7 }}>👁️</span>
      <span>หาย: {[...missingHeroes].map(heroName).join(', ')}</span>
    </div>
  ) : null

  // G5.4: Overlay advice panel — shows G-Master response for 20s, dismissable.
  const advicePanel = overlayAdvice && s.gankVisuals ? (
    <div style={{
      ...overlayPanel(s.opacity), padding: '10px 16px', maxWidth: 380, fontSize: 13,
      lineHeight: 1.5, position: 'relative',
    }}>
      <div style={{ fontSize: 10.5, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>Maiden แนะนำ</div>
      <div style={{ color: C.txt }}>{overlayAdvice}</div>
      <button onClick={() => setOverlayAdvice(null)} style={{
        position: 'absolute', top: 6, right: 8, background: 'transparent', border: 'none',
        color: C.mut, cursor: 'pointer', fontSize: 13, lineHeight: 1,
      }}>✕</button>
    </div>
  ) : null

  // G-Revive: buyback verdict card — shown while dead, dismissed on respawn.
  // Accent tracks urgency: Strong = red (buy back NOW), Consider = amber, else ice.
  const buybackPanel = buyback && s.gankVisuals ? (() => {
    const a = buyback.advice
    const accent = a.urgency === 'Strong' ? C.bad : a.urgency === 'Consider' ? C.warn : C.ice
    const verdict = a.recommend_buyback ? (a.urgency === 'Strong' ? 'ซื้อเกิดเลย!' : 'ควรซื้อเกิด') : 'รอเกิด'
    const secs = Math.max(0, Math.round(a.natural_respawn_remaining))
    return (
      <div style={{
        ...overlayPanel(s.opacity), padding: '10px 16px', maxWidth: 380, fontSize: 13,
        lineHeight: 1.5, position: 'relative', border: `1px solid ${accent}`,
      }}>
        <div style={{ fontSize: 10.5, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>💀 Buyback</span>
          <span style={{ background: accent, color: C.bg, borderRadius: 6, padding: '1px 7px', fontWeight: 700, letterSpacing: 0.4 }}>{verdict}</span>
        </div>
        <div style={{ color: C.txt }}>{buyback.narrative || a.reason}</div>
        <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
          เกิดเองใน {secs}s{a.affordable === false ? ' · เงินไม่พอซื้อเกิด' : ''}
        </div>
        <button onClick={() => setBuyback(null)} style={{
          position: 'absolute', top: 6, right: 8, background: 'transparent', border: 'none',
          color: C.mut, cursor: 'pointer', fontSize: 13, lineHeight: 1,
        }}>✕</button>
      </div>
    )
  })() : null

  // A. Gank warning banner — top-center, above the stat HUD, never over the minimap.
  const gankBanner = s.gankVisuals && gank ? (
    gank.phase === 'clear'
      ? <div className="gm-gank-clear" style={gankClearStyle}>{REVISION_LINES.gankCleared[0]}</div>
      : <div className="gm-gank" style={gankStyle}>
          ⚠️ ระวังแก๊งค์! {gank.heroes.length ? gank.heroes.map(heroName).join(', ') + ' หาย — ' : ''}{Math.round(gank.probability * 100)}%
        </div>
  ) : null

  // #6: transient event toast — same lifetime as a voice cue, near the alert zone.
  const eventToast = toast ? (
    <div style={{
      background: 'rgba(18,20,28,0.86)', border: `1px solid ${C.ice}`, borderRadius: 10,
      padding: '7px 16px', fontFamily: '"Segoe UI", system-ui, sans-serif', fontSize: 12.5,
      color: C.txt, display: 'flex', alignItems: 'center', gap: 8, maxWidth: 440,
      boxShadow: '0 6px 18px rgba(0,0,0,0.24)',
    }}>
      <span style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.6, flex: 'none' }}>🔔 {toast.event}</span>
      <span style={{ opacity: 0.92 }}>{toast.text}</span>
    </div>
  ) : null

  // Single overlay: the merged Full tier (positionable modules + all the
  // announcer/persona visuals ported from lite). uiMode is coerced to 'full'
  // everywhere (loadSettings / settings broadcast), so the lite render below is
  // dormant — kept one release as a fallback, not user-reachable.
  if (s.uiMode === 'full') {
    return (
      <FullOverlay
        tick={tick} s={s} gank={gank} missingHeroes={missingHeroes}
        overlayAdvice={overlayAdvice} buyback={buyback} toast={toast}
        killBanner={killBanner} packBanner={packBanner} lowHp={lowHp}
        volToast={volToast} gsiActive={gsiActive} previewMode={previewMode}
      />
    )
  }

  if (!seen || !tick || !tick.in_game || (!gsiActive && !previewMode)) {
    // Boss 2026-07-18 "กรอบทะลุตลอด": the standby chip used to render
    // UNCONDITIONALLY here, so with no game running the always-on-top overlay
    // window painted a floating "G-Maiden / GSI Signal" pill on the bare
    // desktop, permanently. Only show it when there's a live GSI feed (Dota
    // menus — useful "I'm alive" feedback over the game) or during the
    // settings overlay-preview; on a plain desktop the overlay draws nothing.
    const showStandbyChip = gsiActive || previewMode
    return (
      <>
        {cvDebug}
        <div style={wrap}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {gankBanner}
            {missingBadge}
            {eventToast}
            {showStandbyChip && (
              <div style={{ ...overlayPanel(s.opacity), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: gsiActive ? C.ok : C.bad }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>G-Maiden</div>
                  <div style={{ fontSize: 11, color: C.mut }}>GSI Signal</div>
                </div>
              </div>
            )}
          </div>
        </div>
        {volToast !== null && (
          <div style={{
            position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
            ...overlayPanel(s.opacity), padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10,
            fontSize: 13, pointerEvents: 'none', transition: 'opacity .2s', zIndex: 20,
          }}>
            <span>{volToast === 0 ? '🔇' : volToast <= 30 ? '🔈' : volToast <= 70 ? '🔉' : '🔊'}</span>
            <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${volToast}%`, background: C.ice, borderRadius: 99, transition: 'width .15s' }} />
            </div>
            <span style={{ color: C.ice, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{volToast}%</span>
          </div>
        )}
      </>
    )
  }
  const t = tick

  return (
    <>
    {cvDebug}
    <div style={wrap}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {gankBanner}
        {missingBadge}
        {eventToast}
        {lowHp && <div className="gm-danger" style={dangerStyle}>⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!</div>}
        {/* Announcer bundle: the active pack's queue banner image (replaces the
            built-in card when the pack maps an image for the fired event). */}
        {s.killVisuals && packBanner && (
          <div className={packBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={packBannerStyle}>
            {packBanner.url && (
              <img
                src={packBanner.url}
                alt={packBanner.text}
                style={{ display: 'block', maxWidth: 420, maxHeight: 150, width: 'auto', height: 'auto', objectFit: 'contain' }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            {packBanner.url && (packBanner.text || packBanner.thai) && (
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center', pointerEvents: 'none' }}>
                {packBanner.text && (
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.text}</div>
                )}
                {packBanner.thai && (
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ice, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.thai}</div>
                )}
              </div>
            )}
            {/* Voice strip: the transcript caption + a waveform reactive to the
                clip the overlay is playing (silently). Footer under an image, or
                the whole banner when the pack maps no image for this event. */}
            {packBanner.clip && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center',
                padding: packBanner.url ? '6px 10px 8px' : '10px 14px',
                background: 'rgba(12,14,20,0.82)', lineHeight: 1.25,
              }}>
                {!packBanner.url && (packBanner.text || packBanner.thai) && (
                  <div style={{ textAlign: 'center' }}>
                    {packBanner.text && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.text}</div>
                    )}
                    {packBanner.thai && (
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ice, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{packBanner.thai}</div>
                    )}
                  </div>
                )}
                <VoiceWave key={packBanner.clip} clip={packBanner.clip} />
              </div>
            )}
          </div>
        )}
        {s.killVisuals && killBanner && !packBanner && (
          <div className={killBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={killBannerStyle}>
            {/* Hero portrait circle + animated red X */}
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', overflow: 'hidden',
                background: 'rgba(18,20,28,0.9)', border: '2px solid rgba(91,227,167,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {killBanner.victim ? (
                  <img
                    src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${killBanner.victim.replace(/^npc_dota_hero_/, '')}.png`}
                    alt="" style={{ width: '110%', height: '110%', objectFit: 'cover' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span style={{ fontSize: 22, opacity: 0.6 }}>💀</span>
                )}
              </div>
              <svg className="gm-kill-cross" viewBox="0 0 56 56" style={{
                position: 'absolute', inset: 0, width: 56, height: 56, pointerEvents: 'none',
              }}>
                <line x1="12" y1="12" x2="44" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
                <line x1="44" y1="12" x2="12" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
              </svg>
            </div>
            {/* Kill text + victim name */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: C.ok, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8 }}>
                {killBanner.streak >= 3 ? (STREAK_LABELS[Math.min(killBanner.streak, 10)] ?? 'BEYOND GODLIKE') : 'ENEMY SLAIN'}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {killBanner.victim ? heroName(killBanner.victim) : 'ฆ่าได้สวยค่ะ!'}
              </div>
            </div>
            {/* YOU : FOE score */}
            <div style={{
              background: 'rgba(143,212,255,0.06)', border: '1px solid rgba(143,212,255,0.18)',
              borderRadius: 10, padding: '5px 16px', textAlign: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap', letterSpacing: 1 }}>
                <span style={{ color: C.ok }}>{t.kills}</span>
                <span style={{ color: C.mut, fontSize: 14, margin: '0 6px' }}>:</span>
                <span style={{ color: C.bad }}>{t.deaths}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, letterSpacing: 0.8, marginTop: 2 }}>
                <span style={{ color: C.ok, fontWeight: 600 }}>YOU</span>
                <span style={{ color: C.bad, fontWeight: 600 }}>FOE</span>
              </div>
            </div>
          </div>
        )}
        {buybackPanel}
        {advicePanel}
        {(s.showTimer || s.showScore || s.showHeroBar || s.showKda || s.showGold) && (
        <div style={{ ...overlayPanel(s.opacity), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {s.showTimer && (
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ice, lineHeight: 1 }}>{fmtClock(t.clock_time)}</div>
              <div style={{ fontSize: 10, color: C.mut, marginTop: 3 }}>{t.daytime ? '☀' : '🌙'}</div>
            </div>
          )}
          {s.showScore && (
            <div style={{ textAlign: 'center', minWidth: 54 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>
                <span style={{ color: C.ok }}>{t.radiant_score}</span>
                <span style={{ margin: '0 4px', opacity: 0.5, color: C.mut }}>:</span>
                <span style={{ color: C.bad }}>{t.dire_score}</span>
              </div>
              <div style={{ fontSize: 10, color: C.mut }}>SCORE</div>
            </div>
          )}
          {s.showHeroBar && (
            <>
              {(s.showTimer || s.showScore) && sep}
              <div style={{ minWidth: 120 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: t.alive ? C.txt : C.bad }}>{heroName(t.hero)} {!t.alive && '💀'}</div>
                <div style={{ fontSize: 11, color: C.mut, marginBottom: 5 }}>Lvl {t.level}</div>
                <div style={{ marginBottom: 3 }}><Bar pct={t.hp_percent} color={C.ok} /></div>
                <Bar pct={t.mana_percent} color={C.ice} />
              </div>
            </>
          )}
          {s.showKda && (
            <>
              {(s.showTimer || s.showScore || s.showHeroBar) && sep}
              <Stat label="K / D / A" value={`${t.kills}/${t.deaths}/${t.assists}`} />
              <Stat label="LH / DN" value={`${t.last_hits}/${t.denies}`} />
            </>
          )}
          {s.showGold && (
            <>
              {(s.showTimer || s.showScore || s.showHeroBar || s.showKda) && sep}
              <Stat label="Gold" value={t.gold.toLocaleString()} color={C.warn} />
              <Stat label="NW" value={t.net_worth.toLocaleString()} color={C.ice} />
              <Stat label="GPM" value={t.gpm} />
              <Stat label="XPM" value={t.xpm} />
            </>
          )}
        </div>
        )}
      </div>
    </div>
    {volToast !== null && (
      <div style={{
        position: 'fixed', bottom: 60, left: '50%', transform: 'translateX(-50%)',
        ...overlayPanel(s.opacity), padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10,
        fontSize: 13, pointerEvents: 'none', transition: 'opacity .2s', zIndex: 20,
      }}>
        <span>{volToast === 0 ? '🔇' : volToast <= 30 ? '🔈' : volToast <= 70 ? '🔉' : '🔊'}</span>
        <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${volToast}%`, background: C.ice, borderRadius: 99, transition: 'width .15s' }} />
        </div>
        <span style={{ color: C.ice, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{volToast}%</span>
      </div>
    )}
    </>
  )
}
