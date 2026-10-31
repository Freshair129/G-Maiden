import React, { useCallback, useEffect, useRef, useState } from 'react'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { FullOverlay } from '../overlay/FullOverlay'
import { crossedLevelUpMilestones } from '../personaMilestones'
import type {
  GameTick, MinimapCv, GankAlert, MissingState, Advice, AdviceUpdate, ReviveAdvice, GsiStatus, SensorHealth,
  MatchSessionMetadata, BuybackIdentity, BuybackNarrative,
  Settings, GankState,
} from './types'
import { DEFAULTS } from './types'
import { C } from './theme'
import { heroName } from './primitives'
import { allowsSessionLifecycleAdvance } from '../live/session'
import { adviceAllowedBySettings, advicePolicyKey, isAdviceGenerationCurrent, validAdviceGeneration } from './adviceGeneration'
import { VrzoBannerController, type VrzoVisual } from '../overlay/vrzoBanner'
import { VrzoBannerVideo } from '../overlay/vrzoBannerVideo'

export const Overlay: React.FC<{ initialSettings?: Settings }> = ({ initialSettings = DEFAULTS }) => {
  const [lastTick, setLastTick] = useState<GameTick | null>(null)
  const [gsiStatus, setGsiStatus] = useState<GsiStatus | null>(null)
  const [s, setS] = useState<Settings>(initialSettings)
  // G-Signal gank banner + CV debug feed (item A & B).
  const [gank, setGank] = useState<GankState>(null)
  const [cv, setCv] = useState<MinimapCv | null>(null)
  // G2.6: set of hero names currently flagged as missing by G-Sentry.
  const [missingHeroes, setMissingHeroes] = useState<Set<string>>(new Set())
  const [warningStatus, setWarningStatus] = useState<MissingState | null>(null)
  const missingTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const sessionEpoch = useRef<number | null>(null)
  const sessionLifecycle = useRef<MatchSessionMetadata['session_lifecycle']>(null)
  const sessionMatchId = useRef<string | null>(null)
  // G5.4: latest advice from G-Master, shown as an in-overlay panel.
  const [overlayAdvice, setOverlayAdvice] = useState<string | null>(null)
  const adviceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const adviceRevision = useRef(0)
  const adviceEventRevision = useRef(0)
  const adviceNativeGeneration = useRef<number | null>(null)
  // G-Revive: buyback verdict shown while the player is dead. `advice` is the
  // deterministic verdict; `narrative` is the local-SLM voiced line that arrives
  // a beat later on `buyback-narrative`. Cleared on respawn.
  const [buyback, setBuyback] = useState<{ advice: ReviveAdvice; narrative: string | null } | null>(null)
  const buybackIdentity = useRef<BuybackIdentity | null>(null)
  const [previewTick, setPreviewTick] = useState<GameTick | null>(null)
  const previewMode = previewTick !== null
  const gsiFresh = gsiStatus?.gsi_freshness === 'fresh'
  const gsiActive = gsiFresh
  const tick = gsiFresh ? lastTick : null
  // Keep the session shell alive while Dota is still open, but do not expose
  // the last own-state tick after its source has crossed the freshness limit.
  const matchActive = !!gsiStatus?.dota_running && !!gsiStatus.in_game
  // Minimap-sensor truth. Starts NULL, and null is treated as "not healthy" —
  // fail-closed. Until a fresh capture status arrives, the overlay must not
  // report the sensor as healthy (audit B3).
  const [sensorHealth, setSensorHealth] = useState<SensorHealth | null>(null)
  const [vrzoVisual, setVrzoVisual] = useState<VrzoVisual | null>(null)
  const vrzo = useRef<VrzoBannerController | null>(null)
  if (!vrzo.current) vrzo.current = new VrzoBannerController(setVrzoVisual)
  const failVrzo = useCallback((id: string) => vrzo.current?.fail(id), [])
  const gankTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gankClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Volume toast — brief on-screen feedback when player uses Alt+Up/Down/M.
  const [volToast, setVolToast] = useState<number | null>(null)
  const volToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAdvice = useRef<{ level: number; deaths: number } | null>(null)
  const tickRef = useRef<GameTick | null>(null)
  // Auto-advice trigger memory (in clock_time seconds; -Infinity = never fired).
  // Per-key cooldown keeps the Plan quota honest even if multiple triggers fire close together.
  const recentDeathClock = useRef<number | null>(null)
  const advisedAt = useRef<Record<string, number>>({})
  const sRef = useRef(s)
  const gsiStatusRef = useRef(gsiStatus)
  sRef.current = s
  gsiStatusRef.current = gsiStatus
  const mayUseOwnState = () => gsiStatusRef.current?.gsi_freshness === 'fresh'
  const invalidateAdvice = useCallback(() => {
    adviceRevision.current += 1
    if (adviceTimer.current) clearTimeout(adviceTimer.current)
    adviceTimer.current = null
    setOverlayAdvice(null)
  }, [])
  const resetSessionUi = useCallback(() => {
    vrzo.current?.clearLive()
    adviceRevision.current += 1
    for (const timer of [gankTimer, gankClearTimer, adviceTimer]) {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
    for (const timer of missingTimers.current.values()) clearTimeout(timer)
    missingTimers.current.clear()
    setLastTick(null)
    setGank(null)
    setCv(null)
    setMissingHeroes(new Set())
    setWarningStatus(null)
    setOverlayAdvice(null)
    setBuyback(null)
    buybackIdentity.current = null
    prevAdvice.current = null
    prevAlive.current = null
    recentDeathClock.current = null
    advisedAt.current = {}
  }, [])
  const observeSessionAuthority = useCallback((event: MatchSessionMetadata): boolean => {
    const incoming = event.session_epoch
    if (incoming === undefined || incoming === null || !Number.isSafeInteger(incoming) || incoming < 0) return true
    if (sessionEpoch.current !== null && incoming < sessionEpoch.current) return false
    if (sessionEpoch.current === null || incoming > sessionEpoch.current) {
      resetSessionUi()
      sessionEpoch.current = incoming
      sessionLifecycle.current = event.session_lifecycle ?? null
      sessionMatchId.current = event.match_id ?? null
      return true
    }
    const lifecycle = event.session_lifecycle ?? null
    if (lifecycle && lifecycle !== sessionLifecycle.current) {
      if (!allowsSessionLifecycleAdvance(
        sessionLifecycle.current,
        lifecycle,
        sessionMatchId.current,
        event.match_id
      )) return false
      resetSessionUi()
      sessionLifecycle.current = lifecycle
    }
    if (event.match_id) sessionMatchId.current = event.match_id
    return true
  }, [resetSessionUi])
  const acceptsSessionEvent = useCallback((
    event: MatchSessionMetadata,
    allowed: readonly NonNullable<MatchSessionMetadata['session_lifecycle']>[] = ['draft', 'live', 'disconnected'],
    allowUntagged = false
  ): boolean => {
    const incoming = event.session_epoch
    if (incoming === undefined || incoming === null || !Number.isSafeInteger(incoming) || incoming < 0) {
      return allowUntagged || sessionEpoch.current === null
    }
    if (sessionEpoch.current === null || incoming > sessionEpoch.current) {
      // Events can race the periodic GSI status heartbeat. A higher backend
      // epoch is itself an authoritative boundary, so reset before accepting it.
      resetSessionUi()
      sessionEpoch.current = incoming
      sessionLifecycle.current = event.session_lifecycle ?? null
    } else if (incoming < sessionEpoch.current) {
      return false
    }
    const lifecycle = event.session_lifecycle ?? sessionLifecycle.current
    if (lifecycle && !allowed.includes(lifecycle)) return false
    if (sessionLifecycle.current && event.session_lifecycle && event.session_lifecycle !== sessionLifecycle.current) return false
    return true
  }, [resetSessionUi])
  tickRef.current = tick
  useEffect(() => {
    let active = true
    const missingTimerMap = missingTimers.current
    const u1 = listen<GameTick>('game-tick', (e) => {
      if (!observeSessionAuthority(e.payload)) return
      if (e.payload.alive || (buybackIdentity.current && buybackIdentity.current.death_episode !== e.payload.deaths)) {
        buybackIdentity.current = null
        setBuyback(null)
      }
      tickRef.current = e.payload
      if (e.payload.session_lifecycle === 'end' || e.payload.session_lifecycle === 'abandon') {
        setLastTick(null)
        return
      }
      setLastTick(e.payload)
    })
    const u2 = listen<Settings>('settings', (e) => {
      const next: Settings = { ...DEFAULTS, ...e.payload, uiMode: 'full' }
      if (!next.killVisuals || !next.layout?.banner?.enabled) vrzo.current?.clear()
      if (advicePolicyKey(next) !== advicePolicyKey(sRef.current)) invalidateAdvice()
      sRef.current = next
      setS(next)
    })
    const uMaster = listen<{ context_generation: number }>('master-context-changed', ({ payload }) => {
      if (!validAdviceGeneration(payload.context_generation)) return
      if (adviceNativeGeneration.current !== null && payload.context_generation <= adviceNativeGeneration.current) return
      adviceNativeGeneration.current = payload.context_generation
      invalidateAdvice()
    })
    // CV debug feed — fires 8–15 Hz. Cheap setState; only rendered when cvDebug is on.
    const u3 = listen<MinimapCv>('minimap-cv', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live', 'disconnected'])) return
      if (!sRef.current.cvDebug) return
      setCv(e.payload)
    })
    // G-Signal: show banner on alert, retract on clear (Belief Revision visual echo).
    const u4 = listen<GankAlert>('gank-alert', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live', 'disconnected'])) return
      if (gankClearTimer.current) { clearTimeout(gankClearTimer.current); gankClearTimer.current = null }
      setGank({ phase: 'alert', heroes: e.payload.missing_heroes ?? [], probability: e.payload.probability })
      if (gankTimer.current) clearTimeout(gankTimer.current)
      const epoch = sessionEpoch.current
      // auto-dismiss after ~6s if no gank-clear arrives
      gankTimer.current = setTimeout(() => {
        if (sessionEpoch.current === epoch) setGank(null)
      }, 6000)
    })
    const u5 = listen<MatchSessionMetadata>('gank-clear', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live', 'disconnected'])) return
      if (gankTimer.current) { clearTimeout(gankTimer.current); gankTimer.current = null }
      setGank({ phase: 'clear' })
      // brief soft echo, then fade out; don't re-show until a new gank-alert
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      const epoch = sessionEpoch.current
      gankClearTimer.current = setTimeout(() => {
        if (sessionEpoch.current === epoch) setGank(null)
      }, 2200)
    })
    const u6 = listen<GsiStatus>('gsi-status', (e) => {
      if (!observeSessionAuthority(e.payload)) return
      setGsiStatus(e.payload)
    })
    const uSH = listen<SensorHealth>('sensor-health', (e) => setSensorHealth(e.payload))
    let previewExpiry: ReturnType<typeof setTimeout> | undefined
    const u7 = listen<GameTick | null>('overlay-preview', (e) => {
      clearTimeout(previewExpiry)
      setPreviewTick(e.payload)
      if (e.payload) previewExpiry = setTimeout(() => setPreviewTick(null), 4000)
    })
    const u8 = listen<MissingState>('missing-state', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live', 'disconnected'])) return
      setMissingHeroes(new Set(e.payload.heroes))
      setWarningStatus(e.payload)
      if (!e.payload.ready) setGank(null)
      const epoch = sessionEpoch.current
      const old = missingTimerMap.get('snapshot')
      if (old) clearTimeout(old)
      missingTimerMap.set('snapshot', setTimeout(() => {
        if (sessionEpoch.current !== epoch) return
        setMissingHeroes(new Set())
        setWarningStatus(null)
        setGank(null)
        missingTimerMap.delete('snapshot')
      }, 3000))
    })
    // G5.4: Advice panel — show for 20s then dismiss.
    const u9 = listen<AdviceUpdate>('advice-update', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live'])) return
      if (!mayUseOwnState() || e.payload.cached || !adviceAllowedBySettings(e.payload, sRef.current)) return
      const revision = adviceRevision.current
      const eventRevision = ++adviceEventRevision.current
      const epoch = sessionEpoch.current
      void (async () => {
        if (adviceNativeGeneration.current !== null && e.payload.context_generation < adviceNativeGeneration.current) return
        if (!await isAdviceGenerationCurrent(e.payload)) return
        if (adviceRevision.current !== revision || adviceEventRevision.current !== eventRevision || sessionEpoch.current !== epoch || !mayUseOwnState()
          || !adviceAllowedBySettings(e.payload, sRef.current)) return
        if (adviceNativeGeneration.current !== null && e.payload.context_generation < adviceNativeGeneration.current) return
        adviceNativeGeneration.current = e.payload.context_generation
        setOverlayAdvice(e.payload.text)
        if (adviceTimer.current) clearTimeout(adviceTimer.current)
        adviceTimer.current = setTimeout(() => {
          if (sessionEpoch.current === epoch) setOverlayAdvice(null)
        }, 20_000)
      })()
    })
    // G-Revive: buyback verdict card. `buyback-advice` carries the deterministic
    // verdict (broadcast, so it shows regardless of which window triggered the
    // request); `buyback-narrative` follows with Maiden's voiced line.
    const uBA = listen<ReviveAdvice>('buyback-advice', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live'])) return
      const current = tickRef.current
      if (!mayUseOwnState() || !current?.in_game || current.alive || current.deaths !== e.payload.death_episode
        || !Number.isSafeInteger(e.payload.death_episode) || e.payload.death_episode < 0
        || !Number.isSafeInteger(e.payload.request_id) || e.payload.request_id <= 0) return
      if (buybackIdentity.current && e.payload.request_id <= buybackIdentity.current.request_id) return
      buybackIdentity.current = { death_episode: e.payload.death_episode, request_id: e.payload.request_id }
      setBuyback({ advice: e.payload, narrative: null })
    })
    const uBN = listen<BuybackNarrative>('buyback-narrative', (e) => {
      if (!acceptsSessionEvent(e.payload, ['live'])) return
      const current = tickRef.current
      const identity = buybackIdentity.current
      if (mayUseOwnState() && current?.in_game && !current.alive && current.deaths === e.payload.death_episode
        && identity?.death_episode === e.payload.death_episode && identity.request_id === e.payload.request_id) {
        setBuyback((b) => (b ? { ...b, narrative: e.payload.text } : b))
      }
    })
    const u10 = listen<number>('volume-change', (e) => {
      setVolToast(e.payload)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      volToastTimer.current = setTimeout(() => setVolToast(null), 1500)
    })
    const uVrzo = listen<unknown>('announcer-media-playback', ({ payload }) => {
      if (!sRef.current.killVisuals || !sRef.current.layout?.banner?.enabled) return
      vrzo.current?.receive(payload, sessionEpoch.current, Date.now())
    })
    const registrations = [u1, u2, uMaster, u3, u4, u5, u6, uSH, u7, u8, u9, uBA, uBN, u10, uVrzo]
    // Hydrated settings are already supplied by the provider. Native readiness
    // additionally requires every listener before the Control settings reply.
    void Promise.all(registrations).then(async () => {
      if (!active) return
      await invoke('overlay_bootstrap_ready')
      if (active) await emit('overlay-ready')
    }).catch(() => {})
    return () => {
      active = false
      vrzo.current?.destroy()
      for (const registration of registrations) void registration.then((unlisten) => unlisten()).catch(() => {})
      clearTimeout(previewExpiry)
      adviceRevision.current += 1
      if (gankTimer.current) clearTimeout(gankTimer.current)
      if (gankClearTimer.current) clearTimeout(gankClearTimer.current)
      if (adviceTimer.current) clearTimeout(adviceTimer.current)
      if (volToastTimer.current) clearTimeout(volToastTimer.current)
      for (const timer of missingTimerMap.values()) clearTimeout(timer)
      missingTimerMap.clear()
    }
  }, [acceptsSessionEvent, observeSessionAuthority, invalidateAdvice])

  // Reset streak on death + fire the G-Revive buyback verdict; clear on respawn.
  // Each transition consumer owns its baseline so effect ordering cannot hide edges.
  const prevAlive = useRef<boolean | null>(null)
  useEffect(() => {
    const currentTick = tickRef.current
    if (!currentTick) return
    const was = prevAlive.current
    prevAlive.current = currentTick.alive
    if (was === null) return
    if (was && !currentTick.alive) {
      // G-Revive: ask the backend for this death's buyback verdict. The verdict
      // returns immediately (deterministic) and is broadcast on `buyback-advice`
      // — the listener above owns display; the voiced narrative follows on
      // `buyback-narrative`. Fire-and-forget; ignore errors (SLM/CLI absent).
      if (currentTick.in_game) {
        const requestEpoch = currentTick.session_epoch ?? sessionEpoch.current
        if (requestEpoch !== null && Number.isSafeInteger(requestEpoch)) {
          void invoke('request_buyback_advice', { tick: currentTick, sessionEpoch: requestEpoch }).catch(() => {})
        }
      }
    }
    if (!was && currentTick.alive) {
      setBuyback(null) // respawned — dismiss the card
    }
  }, [tick?.alive, tick?.in_game])

  // Post-match reset (Boss 2026-07-20: "จบแมตช์แล้ว overlay ไม่ reset, buyback ค้าง").
  // A match that ends while the player is dead never produces the respawn edge
  // above, so every transient panel would linger over the post-game screen (and
  // the next match's pre-game). Clear them all on the in_game falling edge.
  const prevInGame = useRef(false)
  useEffect(() => {
    // The backend's process + lifecycle status keeps this true across a GSI
    // outage, so feed staleness cannot masquerade as a match-end transition.
    const now = matchActive
    if (prevInGame.current && !now) {
      setBuyback(null)
      setOverlayAdvice(null)
      setGank(null)
      setMissingHeroes(new Set())
    }
    prevInGame.current = now
  }, [matchActive])

  const wasFresh = useRef<boolean | null>(null)
  useEffect(() => {
    const nowFresh = gsiFresh
    if (wasFresh.current && !nowFresh) {
      setBuyback(null)
      setOverlayAdvice(null)
      prevAdvice.current = null
      prevAlive.current = null
      recentDeathClock.current = null
    }
    wasFresh.current = nowFresh
  }, [gsiFresh])

  // Auto-advice (G-Master proactive). Fires Claude Plan request + speaks the
  // result on key moments: ult level milestones and a death-streak (2 deaths
  // within 5 clock-min). Per-trigger cooldown 10 clock-min; server-side
  // throttle (30s wallclock) also caps quota use.
  useEffect(() => {
    const currentTick = tickRef.current
    if (!currentTick || !tick?.in_game) { prevAdvice.current = null; return }
    const p = prevAdvice.current
    prevAdvice.current = { level: currentTick.level, deaths: currentTick.deaths }
    if (!p || !sRef.current.masterEnabled || !sRef.current.autoAdvice || !sRef.current.voiceEnabled || sRef.current.personaPreset === 'silent') return
    const requestEpoch = currentTick.session_epoch ?? sessionEpoch.current
    if (requestEpoch === null || !Number.isSafeInteger(requestEpoch)) return

    type Trigger = { key: string }
    const triggers: Trigger[] = []

    for (const milestone of crossedLevelUpMilestones(p.level, currentTick.level)) {
      triggers.push({ key: `lvl${milestone}` })
    }
    if (currentTick.deaths > p.deaths) {
      const last = recentDeathClock.current
      if (last !== null && currentTick.clock_time - last > 0 && currentTick.clock_time - last < 300) {
        triggers.push({ key: 'deathStreak' })
      }
      recentDeathClock.current = currentTick.clock_time
    }

    for (const trig of triggers) {
      const last = advisedAt.current[trig.key] ?? -Infinity
      if (currentTick.clock_time - last < 600) continue
      advisedAt.current[trig.key] = currentTick.clock_time
      const requestRevision = adviceRevision.current
      const requestIsCurrent = () => adviceRevision.current === requestRevision
        && sessionEpoch.current === requestEpoch && mayUseOwnState()
        && sRef.current.masterEnabled && sRef.current.autoAdvice && sRef.current.voiceEnabled
        && sRef.current.personaPreset !== 'silent'
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
              if (!requestIsCurrent()) return
              if (typeof budget.sessionUsd === 'number' && budget.sessionUsd > 0
                  && stats.session.cost_usd >= budget.sessionUsd) return
              if (typeof budget.weeklyUsd === 'number' && budget.weeklyUsd > 0
                  && stats.weekly.cost_usd >= budget.weeklyUsd) return
            }
          }
        } catch { /* budget parse failure -> let the request through */ }
        if (!requestIsCurrent()) return
        return invoke<Advice>('request_advice', { tick: currentTick, sessionEpoch: requestEpoch })
        .then(async (a) => {
          if (!a?.text || !requestIsCurrent() || !adviceAllowedBySettings(a, sRef.current)) return
          if (!await isAdviceGenerationCurrent(a)) return
          if (!requestIsCurrent() || !adviceAllowedBySettings(a, sRef.current)) return
          if (adviceNativeGeneration.current !== null && a.context_generation < adviceNativeGeneration.current) return
          adviceNativeGeneration.current = a.context_generation
          if (sRef.current.calibration) void invoke('capture_calibration_clip', { event: 'advice', line: a.text, context: { clock: currentTick.clock_time, level: currentTick.level } }).catch(() => {})
          void invoke('speak_advice', {
            text: a.text,
            voice: sRef.current.voiceName || null,
            rate: sRef.current.voiceRate,
            adviceGeneration: a.context_generation,
            adviceSessionEpoch: requestEpoch,
          }).catch(() => {})
        })
        .catch(() => { /* claude CLI missing or login fail — silent in auto mode */ })
      })()
    }
  }, [tick])

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

  return <>
    {cvDebug}
    <FullOverlay
      tick={previewTick ?? tick} s={s} gank={gank} missingHeroes={missingHeroes} warningStatus={warningStatus}
      overlayAdvice={overlayAdvice} buyback={buyback}
      volToast={volToast} gsiActive={gsiActive} gsiFresh={gsiFresh || previewMode}
      gsiFreshness={gsiStatus?.gsi_freshness ?? 'unavailable'} gsiAgeMs={gsiStatus?.gsi_age_ms ?? null}
      matchActive={previewMode ? !!previewTick.in_game : matchActive} previewMode={previewMode}
      sensorOk={sensorHealth?.healthy ?? false}
    />
    {s.killVisuals && s.layout?.banner?.enabled && <VrzoBannerVideo visual={vrzoVisual} layout={s.layout.banner} fail={failVrzo} />}
  </>
}
