import React, { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emitTo, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { type Layout } from '../overlay/modules'
import { OverlayLayoutEditor } from '../overlay/OverlayLayoutEditor'
import { OVERLAY_PREVIEW_TICK } from '../overlay/preview'
import { normalizeLayout } from '../overlay/layoutGeometry'
import QuotaCard from '../QuotaCard'
import type {
  GameTick, Settings, SettingsCat, GsiStatus, ResourceStats, OverlayProfile, VoiceInfo,
} from './types'
import { loadProfiles, C, APP_VERSION, CHANGELOG } from './theme'
import { panel, Row, Toggle, Card, Stat, fmtClock, heroName } from './primitives'
import { SetupCard } from './cards/SetupCard'
import { VoiceSettings } from './VoiceSettings'
import { MasterCard } from './cards/MasterCard'
import { EfficacyCard } from './cards/EfficacyCard'
import { LogCard } from './cards/LogCard'
import { Welcome } from './cards/Welcome'
import { useStartupSettings } from './settingsContext'
import { RAM_BUDGET_MB } from './resourceBudget'

// CR-002 Phase 1: the command deck (<CommandDeck/>) renders in the control
// window. CR-013 W3: `Control` now only ever renders one settings category
// (the deck's iOS-style split view always supplies `category`) — the old
// standalone full-page render + its `embedded` toggle were dead code and
// were deleted.
export const Control: React.FC<{ category: SettingsCat }> = ({ category }) => {
  const { settings: s, setSettings: setS, clearLegacyMasterApiKey } = useStartupSettings()
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  // CR-008 WP-2: reflects whether an Anthropic key is stored in the DPAPI secret
  // store (backend `has_master_api_key`) — the plaintext is never held here.
  const [apiKeyPresent, setApiKeyPresent] = useState(false)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [status, setStatus] = useState<GsiStatus | null>(null)
  const freshTick = status?.gsi_freshness === 'fresh' ? tick : null
  const [resources, setResources] = useState<ResourceStats | null>(null)
  const ramAvailable = resources !== null && Number.isFinite(resources.ram_mb) && resources.ram_mb >= 0
  const [captureMode, setCaptureMode] = useState<string>('initializing')
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('gm-onboarded') !== '1')
  const dismissWelcome = () => { localStorage.setItem('gm-onboarded', '1'); setShowWelcome(false) }
  // Preview is render-only and never enters the live game event stream.
  const [preview, setPreview] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [quotaTick, setQuotaTick] = useState(0)
  const [profiles, setProfiles] = useState<OverlayProfile[]>(loadProfiles)
  const [profileName, setProfileName] = useState('')
  const sRef = useRef(s)
  sRef.current = s
  const controlActiveRef = useRef(true)

  const saveProfile = (name: string) => {
    const p: OverlayProfile = { name, layout: normalizeLayout(s.layout), position: s.position, customX: s.customX, customY: s.customY, opacity: s.opacity, showTimer: s.showTimer, showScore: s.showScore, showHeroBar: s.showHeroBar, showKda: s.showKda, showGold: s.showGold }
    const updated = [...profiles.filter(x => x.name !== name), p]
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }
  const applyProfile = (p: OverlayProfile) => {
    setS(prev => ({ ...prev, opacity: p.opacity, layout: p.layout ? normalizeLayout(p.layout) : normalizeLayout({ ...prev.layout, clock: { ...prev.layout.clock, enabled: p.showTimer }, score: { ...prev.layout.score, enabled: p.showScore }, hero: { ...prev.layout.hero, enabled: p.showHeroBar }, kda: { ...prev.layout.kda, enabled: p.showKda }, gold: { ...prev.layout.gold, enabled: p.showGold } }) }))
  }
  const deleteProfile = (name: string) => {
    const updated = profiles.filter(x => x.name !== name)
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }

  useEffect(() => {
    if (!preview || category !== 'overlay') return
    const send = () => { void emitTo('overlay', 'overlay-preview', OVERLAY_PREVIEW_TICK).catch(() => {}) }
    send()
    const timer = setInterval(send, 1500)
    return () => {
      clearInterval(timer)
      void emitTo('overlay', 'overlay-preview', null).catch(() => {})
      void invoke('set_overlay_visible', { visible: sRef.current.overlayVisible }).catch(() => {})
    }
  }, [preview, category])

  useEffect(() => {
    if (preview && category === 'overlay') void invoke('set_overlay_visible', { visible: true }).catch(() => {})
  }, [preview, category, s.overlayVisible])

  // CR-013 W2 gate fix (Opus F1): the launch auto-check + install action moved
  // to useAppUpdate (owned by CommandDeck) so it fires regardless of which
  // settings category — or tab — is open. The old `checkUpdateNow`/
  // `installUpdate` here only served the legacy full-page render and were
  // deleted alongside it in CR-013 W3.

  // Load installed voices once; if Maiden has never been assigned one, prefer the
  // first Female voice so the default sounds like her instead of a male advisor.
  useEffect(() => {
    void (async () => {
      try {
        const list = await invoke<VoiceInfo[]>('list_voices')
        setVoices(list)
        setS((prev) => {
          if (prev.voiceName) return prev
          const female = list.find((v) => v.gender === 'Female')
          return female ? { ...prev, voiceName: female.name } : prev
        })
      } catch { /* command unavailable */ }
    })()
  }, [setS])

  // Bind status listeners once; the startup provider owns settings and overlay sync.
  useEffect(() => {
    // NOTE — no document-level styling here. The old standalone-window version
    // painted document.body black (C.bg) and force-enabled page scroll; since
    // CR-013 Control only ever mounts INSIDE the CommandDeck (App.tsx render
    // prop), where those globals bled a black edge around the stage and a
    // scrollbar gutter that survived tab switches (Boss 2026-07-20 "ขอบดำทะลุ
    // หน้า setting"). The deck owns the page background; R1 says only bounded
    // regions scroll.
    const syncControlActive = (focused?: boolean) => {
      const docVisible = document.visibilityState !== 'hidden'
      controlActiveRef.current = focused == null ? docVisible : (docVisible && focused)
    }
    syncControlActive()
    const onVisibility = () => syncControlActive()
    document.addEventListener('visibilitychange', onVisibility)
    let disposed = false
    let offFocus: (() => void) | null = null
    try {
      void getCurrentWindow().onFocusChanged(({ payload }) => {
        syncControlActive(payload)
      }).then((fn) => { if (disposed) fn(); else offFocus = fn }).catch(() => {})
    } catch { /* plain-browser dev / non-Tauri runtime */ }
    const u1 = listen<GameTick>('game-tick', (e) => {
      if (!controlActiveRef.current) return
      setTick(e.payload); setSeen(true)
    })
    const u2 = listen<GsiStatus>('gsi-status', (e) => {
      if (!controlActiveRef.current) return
      setStatus(e.payload)
    })
    const u3 = listen<ResourceStats>('resource-stats', (e) => {
      if (!controlActiveRef.current) return
      setResources(e.payload)
    })
    const u4cap = listen<string>('capture-mode', (e) => {
      setCaptureMode(e.payload)
    })
    void invoke<string>('get_capture_mode').then((mode) => {
      setCaptureMode((current) => current === 'initializing' ? mode : current)
    }).catch(() => {})
    const u5layout = listen<Layout>('overlay-layout-sync', (e) => {
      setS((prev) => ({ ...prev, layout: e.payload }))
    })
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      offFocus?.()
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f()); void u4cap.then((f) => f()); void u5layout.then((f) => f())
    }
  }, [setS])

  // CR-008 WP-2: store/clear the Anthropic key in the DPAPI secret store (backend
  // owns the plaintext). Passing '' clears it. Refresh saved-state from the
  // backend rather than trusting the local string.
  const saveMasterApiKey = async (k: string) => {
    try {
      await invoke('set_master_api_key', { key: k })
      clearLegacyMasterApiKey()
      setApiKeyPresent(await invoke<boolean>('has_master_api_key'))
    } catch { /* not under Tauri (browser dev) — nothing to persist */ }
  }

  // StartupSettingsProvider migrates any legacy plaintext key before it
  // rewrites the settings snapshot. Read only the DPAPI-backed saved-state here.
  useEffect(() => {
    void invoke<boolean>('has_master_api_key').then(setApiKeyPresent).catch(() => {})
  }, [])

  // Listen for hotkey-driven volume changes from the backend (Alt+Up/Down/M).
  useEffect(() => {
    const u = listen<number>('volume-change', (e) => {
      setS((prev) => ({ ...prev, volume: e.payload }))
    })
    return () => { void u.then((f) => f()) }
  }, [setS])

  const set = useCallback(<K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v })), [setS])

  // CR-013 W2 (§4 + §4.3 "move the skin, not the brain"): render ONLY the
  // given category's groups — bare, no outer page chrome (no app header, no
  // update/exclusive-fullscreen banners floating loose, no 2-col grid). The
  // deck (CommandDeck.tsx) always supplies a `category`; the old full-page
  // render (app header, 2-col grid, updater banner) was dead code and was
  // deleted in CR-013 W3.
  return (
    <>
      {showWelcome && <Welcome onDone={dismissWelcome} />}
      <div className="settings-detail-body">
        {category === 'overlay' && (
          <>
            <Card title="Overlay (OSD)">
              <Row label="แสดง overlay บนเกม"><Toggle on={s.overlayVisible} onChange={(v) => set('overlayVisible', v)} /></Row>
              <Row label={`ความทึบพาเนล: ${Math.round(s.opacity * 100)}%`}>
                <input type="range" min={40} max={100} value={Math.round(s.opacity * 100)} onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 150 }} />
              </Row>
              <Row label="ทดสอบ overlay (จำลอง ไม่ต้องเปิดเกม)"><Toggle on={preview} onChange={setPreview} /></Row>
              {profiles.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 8, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: C.mut }}>โปรไฟล์:</span>
                  {profiles.map(p => (
                    <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'rgba(143,212,255,0.08)', border: `1px solid ${C.line}`, borderRadius: 7, padding: '3px 8px', fontSize: 11.5 }}>
                      <button onClick={() => applyProfile(p)} style={{ background: 'none', border: 'none', color: C.ice, cursor: 'pointer', padding: 0, fontSize: 11.5 }}>{p.name}</button>
                      <button onClick={() => deleteProfile(p.name)} style={{ background: 'none', border: 'none', color: C.mut, cursor: 'pointer', padding: 0, fontSize: 10, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.6 }}>
                  💡 <b style={{ color: C.ice }}>Ctrl+Alt+S</b> ซ่อน/แสดง · <b style={{ color: C.ice }}>Alt+↑/↓</b> ระดับเสียง · <b style={{ color: C.ice }}>Alt+M</b> ปิด/เปิดเสียง
                </div>
                <input aria-label="ชื่อโปรไฟล์ overlay" placeholder="ชื่อโปรไฟล์" value={profileName} onChange={e => setProfileName(e.target.value)} style={{ width: 120, background: C.bg, color: C.txt, border: `1px solid ${C.line}`, padding: 5 }} />
                <button disabled={!profileName.trim()} onClick={() => { saveProfile(profileName.trim()); setProfileName('') }}
                  style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                  + บันทึกโปรไฟล์
                </button>
              </div>
            </Card>

            <Card title="จัดวาง Overlay ใน G-Maiden">
              <OverlayLayoutEditor settings={s} onEnterFullscreen={() => setPreview(false)} onChange={layout => set('layout', layout)} />
            </Card>
          </>
        )}

        {category === 'voice' && (
          <VoiceSettings settings={s} voices={voices} set={set} />
        )}

        {category === 'ai' && (
          <>
            <MasterCard tick={freshTick} voice={s.voiceName} rate={s.voiceRate} enabled={s.masterEnabled} onEnabledChange={(v) => set('masterEnabled', v)} autoAdvice={s.autoAdvice} onAutoAdviceChange={(v) => set('autoAdvice', v)} backend={s.masterBackend} onBackendChange={(b) => set('masterBackend', b)} cloudContextOptIn={s.cloudContextOptIn} onCloudContextOptInChange={(v) => set('cloudContextOptIn', v)} auth={s.masterAuth} onAuthChange={(a) => set('masterAuth', a)} apiKeyPresent={apiKeyPresent} onApiKeySave={saveMasterApiKey} ollamaModel={s.masterOllamaModel} onOllamaModelChange={(m) => set('masterOllamaModel', m)} onUsageChanged={() => setQuotaTick((n) => n + 1)} />
            <QuotaCard refreshTrigger={quotaTick} />
          </>
        )}

        {category === 'modules' && (
          <>
            <Card title="Modules &amp; System">
              {(() => {
                const capAcc = captureMode === 'dxgi' ? C.ok : ['lite', 'gdi', 'retrying'].includes(captureMode) ? C.warn : C.mut
                const capLabel = captureMode === 'dxgi' ? 'DXGI' : captureMode === 'gdi' ? 'GDI' : captureMode === 'lite' ? 'Lite' : captureMode === 'retrying' ? 'Retrying' : '…'
                const capTitle = captureMode === 'dxgi'
                  ? 'DXGI Desktop Duplication — minimap detection active'
                  : captureMode === 'gdi'
                    ? 'DXGI unavailable — minimap frames are coming from the GDI fallback'
                  : captureMode === 'lite'
                    ? 'Minimap CV is unavailable. GSI, voice, and overlay continue to work.'
                    : captureMode === 'retrying'
                      ? 'กำลังกู้คืน capture — GSI และเสียงยังทำงานต่อ'
                      : 'กำลังเริ่มต้น capture'
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, fontSize: 11.5, color: C.mut }}>
                      <span>Capture</span>
                      <span title={capTitle} style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: capAcc, background: `${capAcc}1f`, border: `1px solid ${capAcc}` }}>{capLabel}</span>
                      {['lite', 'gdi', 'retrying'].includes(captureMode) && (
                        <button
                          onClick={() => {
                            setCaptureMode('retrying')
                            void invoke('retry_capture').catch(() => {
                              void invoke<string>('get_capture_mode').then(setCaptureMode).catch(() => setCaptureMode('lite'))
                            })
                          }}
                          disabled={captureMode === 'retrying'}
                          style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 7, padding: '3px 9px', fontSize: 11, cursor: captureMode === 'retrying' ? 'wait' : 'pointer', opacity: captureMode === 'retrying' ? 0.65 : 1 }}
                        >
                          {captureMode === 'retrying' ? 'กำลังกู้คืน…' : captureMode === 'lite' ? 'ลองกู้คืน CV' : 'ลองกลับไปใช้ DXGI'}
                        </button>
                      )}
                    </div>
                    {captureMode === 'lite' && (
                      <div style={{ fontSize: 11.5, color: C.warn, paddingTop: 5, lineHeight: 1.5 }}>
                        Minimap CV หยุดทำงาน; GSI, เสียง และ overlay ยังใช้ได้ หาก Dota เปิดอยู่ให้ใช้ borderless fullscreen แล้วลองกู้คืน
                      </div>
                    )}
                    {captureMode === 'gdi' && (
                      <div style={{ fontSize: 11.5, color: C.mut, paddingTop: 5, lineHeight: 1.5 }}>
                        ใช้ GDI fallback อยู่; ลองกลับไปใช้ DXGI ได้เมื่อสลับโหมดหน้าจอหรือออกจาก Alt-Tab แล้ว
                      </div>
                    )}
                  </>
                )
              })()}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, paddingTop: 6, fontSize: 12.5 }}>
                {[
                  ['G-Sentry', 'fog-of-war monitor'],
                  ['G-Motion', 'gank prediction'],
                  ['G-Signal', 'voice gank warning'],
                  ['G-Master', 'advisor (Claude Plan + SLM fallback)'],
                  ['G-Damage', 'burst lethality engine'],
                  ['G-Log', 'match history'],
                ].map(([mod, desc]) => (
                  <span key={mod} style={{ color: C.ok }}>
                    <span style={{ color: C.ok }}>✓</span> <b style={{ color: C.ice }}>{mod}</b>
                    <span style={{ color: C.mut }}> — {desc}</span>
                  </span>
                ))}
              </div>
              {resources && (
                <div style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 8, display: 'flex', gap: 20, fontSize: 12 }}>
                  <span style={{ color: !ramAvailable ? C.warn : resources.ram_mb > RAM_BUDGET_MB ? C.bad : C.ok }}>
                    RAM: <b>{ramAvailable ? `${resources.ram_mb.toFixed(0)} MB` : '—'}</b> / {RAM_BUDGET_MB} MB
                  </span>
                  <span style={{ color: resources.cpu_pct > 10 ? C.bad : resources.cpu_pct < 0 ? C.warn : C.ok }}>
                    CPU: <b>{resources.cpu_pct >= 0 ? `${resources.cpu_pct.toFixed(1)}%` : '—'}</b> / 10%
                  </span>
                  {(resources.cpu_pct > 10 || (ramAvailable && resources.ram_mb > RAM_BUDGET_MB)) && (
                    <span style={{ color: C.warn }}>⚠ เกิน budget — อาจลดความถี่ CV</span>
                  )}
                  {!ramAvailable && (
                    <span style={{ color: C.warn }}>RAM reading unavailable</span>
                  )}
                  {resources.cpu_pct < 0 && (
                    <span style={{ color: C.warn }}>CPU reading unavailable — capture throttle active</span>
                  )}
                </div>
              )}
            </Card>

            <Card title="G-Signal / CV (calibrate)">
              <Row label="CV debug overlay (calibrate)"><Toggle on={s.cvDebug} onChange={(v) => set('cvDebug', v)} /></Row>
              <Row label="Calibration capture (audit: screenshot + clip) — QA"><Toggle on={s.calibration} onChange={(v) => set('calibration', v)} /></Row>
              <Row label="แหล่งข้อมูล GPU/อุณหภูมิ (telemetry)">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['auto','feeder','gtelemetry','off'] as Settings['telemetrySource'][]).map((src) => (
                    <button key={src} onClick={() => set('telemetrySource', src)}
                      title={src === 'auto' ? 'ใช้ G-Telemetry ถ้ามี ไม่งั้น feeder' : src === 'feeder' ? 'gpu-feeder ในตัว (เบา, GPU อย่างเดียว)' : src === 'gtelemetry' ? 'G-Telemetry (ละเอียด: CPU temp, ~200ms)' : 'ปิด'}
                      style={{ background: s.telemetrySource === src ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.telemetrySource === src ? C.ice : C.mut, border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: 12 }}>
                      {src === 'auto' ? 'อัตโนมัติ' : src === 'feeder' ? 'Feeder' : src === 'gtelemetry' ? 'G-Telemetry' : 'ปิด'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                CV debug แสดงกรอบมินิแมพ + จุดที่ตรวจจับได้ — เปิดเฉพาะตอนปรับเทียบ. แหล่ง telemetry: <b>Feeder</b> = gpu-feeder ในตัว (GPU); <b>G-Telemetry</b> = แอปแยก (เพิ่ม CPU temp, ~200ms) ต้องเปิดแอปนั้น.
              </div>
            </Card>
          </>
        )}

        {category === 'privacy' && (
          <>
            <Card title="ความเป็นส่วนตัว">
              <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.6, paddingTop: 6 }}>
                ข้อมูลแมตช์ (G-Log), สถานะเกมสด และผลตรวจจับจาก CV <b style={{ color: C.txt }}>อยู่ในเครื่องนี้เท่านั้น</b> โดยดีฟอลต์ —
                ผลตรวจจับ CV จะไม่ถูกส่งออกจากเครื่องไม่ว่ากรณีใด การเข้าสู่ระบบ (บัญชี) และการแชร์ข้อมูลแมตช์เพื่อแลกเครดิตเป็นคนละ opt-in
                แยกจากกัน และไม่ผูกกัน — ล็อกอินไม่ได้แปลว่าข้อมูลแมตช์ถูกแชร์ไปด้วย
              </div>
              <Row label="การศึกษาประสิทธิภาพ (สุ่มปิดเสียงเตือนบางแมตช์เพื่อวัดผล — ข้อมูลอยู่ในเครื่องเท่านั้น)">
                <Toggle on={s.efficacyStudy} onChange={(v) => set('efficacyStudy', v)} />
              </Row>
            </Card>
            {s.efficacyStudy && <EfficacyCard />}
          </>
        )}

        {category === 'system' && (
          <>
            {status?.display_exclusive && (
              <div style={{ ...panel(0.9), padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, border: `1px solid ${C.warn}` }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.warn }}>Dota อยู่ในโหมด Exclusive Fullscreen</div>
                  <div style={{ fontSize: 11.5, color: C.mut, lineHeight: 1.55, marginTop: 2 }}>
                    Overlay และการอ่าน minimap จะไม่ทำงาน และจออาจค้าง — สลับเป็น <b style={{ color: C.txt }}>Borderless</b> ที่
                    Dota → Settings → Video → Display Mode (บน Windows ยุคนี้ FPS แทบไม่ต่างจาก fullscreen)
                  </div>
                </div>
              </div>
            )}

            {/* CR-013 W2 gate fix (Opus F1): the update banner + version/
                update-check moved to the deck-owned settings shell (always
                visible, launch auto-check) — see CommandDeck.tsx + useAppUpdate.
                This category keeps GSI/diagnostics only. */}

            <Card title="Live (จาก GSI)">
              {freshTick && freshTick.in_game ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', paddingTop: 6 }}>
                  <Stat label="Clock" value={fmtClock(freshTick.clock_time)} color={C.ice} />
                  <Stat label="Hero" value={heroName(freshTick.hero)} />
                  <Stat label="Lvl" value={freshTick.level} />
                  <Stat label="K/D/A" value={`${freshTick.kills}/${freshTick.deaths}/${freshTick.assists}`} />
                  <Stat label="Net Worth" value={freshTick.net_worth.toLocaleString()} color={C.ice} />
                  <Stat label="HP" value={`${freshTick.hp_percent}%`} color={freshTick.hp_percent <= s.alertThreshold ? C.bad : C.ok} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.mut, paddingTop: 10 }}>
                  {status?.gsi_freshness === 'stale'
                    ? `ข้อมูล GSI ล้าสมัย${status.gsi_age_ms === null ? '' : ` (${(status.gsi_age_ms / 1000).toFixed(1)} วินาที)`} — พักข้อมูลผู้เล่นไว้จนกว่า feed จะกลับมา; CV ยังประเมิน minimap ต่อได้`
                    : seen ? 'เชื่อมต่อแล้ว — รอเข้าเกม Dota 2' : 'เปิด Dota 2 (ติดตั้ง GSI config แล้ว) เพื่อดูข้อมูลสด'}
                </div>
              )}
            </Card>

            <SetupCard />
            <LogCard live={!!status?.dota_running && !!status.in_game} clockTime={freshTick?.clock_time ?? 0} />

            <Card title="ระบบ">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, flexWrap: 'wrap', gap: 10 }}>
                <span style={{ fontSize: 11.5, color: C.mut }}>GSI: http://127.0.0.1:3000/gsi</span>
                <button onClick={() => setShowChangelog(true)}
                  style={{ background: 'transparent', color: C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>
                  มีอะไรใหม่
                </button>
              </div>
            </Card>

            {showChangelog && (
              <div onClick={() => setShowChangelog(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div onClick={e => e.stopPropagation()} style={{ ...panel(0.94), maxWidth: 520, maxHeight: '80vh', overflow: 'auto', padding: '24px 28px', width: '90%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.ice }}>Changelog</span>
                    <button onClick={() => setShowChangelog(false)}
                      style={{ background: 'transparent', color: C.mut, border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
                  </div>
                  {CHANGELOG.map(entry => (
                    <div key={entry.ver} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: entry.ver === APP_VERSION ? C.ice : C.txt }}>
                        v{entry.ver} <span style={{ fontWeight: 400, color: C.mut, fontSize: 11.5 }}>{entry.date}</span>
                        {entry.ver === APP_VERSION && <span style={{ marginLeft: 8, fontSize: 10, background: C.ice, color: '#0c1018', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>ปัจจุบัน</span>}
                      </div>
                      <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12.5, color: C.txt, lineHeight: 1.7 }}>
                        {entry.items.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
