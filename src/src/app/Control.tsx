import React, { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { emit, listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { LayoutEditor } from '../overlay/LayoutEditor'
import type { Layout } from '../overlay/modules'
import QuotaCard from '../QuotaCard'
import type {
  GameTick, Settings, SettingsCat, GsiStatus, ResourceStats, OverlayProfile, VoiceInfo, Sensitivity,
} from './types'
import { loadSettings, loadProfiles, C, APP_VERSION, CHANGELOG } from './theme'
import { panel, Row, Toggle, Seg, Card, Stat, fmtClock, heroName } from './primitives'
import { SetupCard } from './cards/SetupCard'
import { AudioSettingsCard } from './cards/AudioSettingsCard'
import { MasterCard } from './cards/MasterCard'
import { EfficacyCard } from './cards/EfficacyCard'
import { LogCard } from './cards/LogCard'
import { Welcome } from './cards/Welcome'

// CR-002 Phase 1: the command deck (<CommandDeck/>) renders in the control
// window. CR-013 W3: `Control` now only ever renders one settings category
// (the deck's iOS-style split view always supplies `category`) — the old
// standalone full-page render + its `embedded` toggle were dead code and
// were deleted.
export const Control: React.FC<{ category: SettingsCat }> = ({ category }) => {
  const [tick, setTick] = useState<GameTick | null>(null)
  const [seen, setSeen] = useState(false)
  const [s, setS] = useState<Settings>(loadSettings)
  // CR-008 WP-2: reflects whether an Anthropic key is stored in the DPAPI secret
  // store (backend `has_master_api_key`) — the plaintext is never held here.
  const [apiKeyPresent, setApiKeyPresent] = useState(false)
  const [voices, setVoices] = useState<VoiceInfo[]>([])
  const [status, setStatus] = useState<GsiStatus | null>(null)
  const [resources, setResources] = useState<ResourceStats | null>(null)
  const [captureMode, setCaptureMode] = useState<string>('initializing')
  const [showWelcome, setShowWelcome] = useState(() => localStorage.getItem('gm-onboarded') !== '1')
  const dismissWelcome = () => { localStorage.setItem('gm-onboarded', '1'); setShowWelcome(false) }
  // Overlay preview: feed the overlay a fake in-game tick so you can see the HUD
  // + danger banner (and hear the voice) without launching Dota.
  const [preview, setPreview] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [quotaTick, setQuotaTick] = useState(0)
  const [profiles, setProfiles] = useState<OverlayProfile[]>(loadProfiles)
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const previewClock = useRef(600)
  const sRef = useRef(s)
  const controlActiveRef = useRef(true)
  sRef.current = s

  const saveProfile = (name: string) => {
    const p: OverlayProfile = { name, position: s.position, customX: s.customX, customY: s.customY, opacity: s.opacity, showTimer: s.showTimer, showScore: s.showScore, showHeroBar: s.showHeroBar, showKda: s.showKda, showGold: s.showGold }
    const updated = [...profiles.filter(x => x.name !== name), p]
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }
  const applyProfile = (p: OverlayProfile) => {
    setS(prev => ({ ...prev, position: p.position, customX: p.customX, customY: p.customY, opacity: p.opacity, showTimer: p.showTimer, showScore: p.showScore, showHeroBar: p.showHeroBar, showKda: p.showKda, showGold: p.showGold }))
  }
  const deleteProfile = (name: string) => {
    const updated = profiles.filter(x => x.name !== name)
    setProfiles(updated)
    localStorage.setItem('gm-profiles', JSON.stringify(updated))
  }

  // Preview emits a synthetic game-tick + preview-mode flag to the overlay.
  // Does NOT emit fake gsi-status — status chips stay real.
  useEffect(() => {
    if (!preview) {
      if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null }
      void emit('preview-mode', false)
      return
    }
    void emit('preview-mode', true)
    const tickOnce = () => {
      previewClock.current += 2
      const lowPhase = Math.floor(previewClock.current / 14) % 2 === 0
      const hp = lowPhase ? 18 : 80
      void emit('game-tick', {
        in_game: true, clock_time: previewClock.current, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
        daytime: true, radiant_score: 12, dire_score: 9, gold: 1500, net_worth: 8200, gpm: 520, xpm: 610,
        kills: 4, deaths: 2, assists: 7, last_hits: 88, denies: 6, hero: 'npc_dota_hero_crystal_maiden',
        level: 9, alive: true, hp_percent: hp, mana_percent: 42,
      })
    }
    tickOnce()
    previewTimer.current = setInterval(tickOnce, 1500)
    return () => { if (previewTimer.current) { clearInterval(previewTimer.current); previewTimer.current = null } }
  }, [preview])

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
  }, [])

  // bind once; use ref so the overlay-ready handler always emits current settings
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
    let offFocus: (() => void) | null = null
    try {
      void getCurrentWindow().onFocusChanged(({ payload }) => {
        syncControlActive(payload)
      }).then((fn) => { offFocus = fn }).catch(() => {})
    } catch { /* plain-browser dev / non-Tauri runtime */ }
    const u1 = listen<GameTick>('game-tick', (e) => {
      if (!controlActiveRef.current) return
      setTick(e.payload); setSeen(true)
    })
    const u2 = listen('overlay-ready', () => { void emit('settings', sRef.current) })
    const u3 = listen<GsiStatus>('gsi-status', (e) => {
      if (!controlActiveRef.current) return
      setStatus(e.payload)
    })
    const u4ctrl = listen<ResourceStats>('resource-stats', (e) => {
      if (!controlActiveRef.current) return
      setResources(e.payload)
    })
    const u5cap = listen<string>('capture-mode', (e) => {
      if (!controlActiveRef.current) return
      setCaptureMode(e.payload)
    })
    const u6layout = listen<Layout>('overlay-layout-sync', (e) => {
      setS((prev) => ({ ...prev, layout: e.payload }))
    })
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      offFocus?.()
      void u1.then((f) => f()); void u2.then((f) => f()); void u3.then((f) => f()); void u4ctrl.then((f) => f()); void u5cap.then((f) => f()); void u6layout.then((f) => f())
    }
  }, [])

  // Hydrate from the backend settings file once on boot (Boss 2026-07-20:
  // layout "ปิดเปิดเกมมาก็หาย"). localStorage is per-webview-ORIGIN, so dev
  // (:5173) and production (tauri://localhost) each kept their own copy and
  // switching builds looked like the layout vanished. The Rust-side file at
  // %LOCALAPPDATA%\G-Maiden\settings.json is origin-independent and wins when
  // present; the persist effect below then keeps both stores in sync (first
  // run with no file yet = seeded from whatever localStorage had).
  const hydrated = useRef(false)
  useEffect(() => {
    void (async () => {
      try {
        const raw = await invoke<string | null>('load_settings_file')
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<Settings>
          setS((prev) => ({ ...prev, ...parsed, uiMode: 'full' }))
        }
      } catch { /* plain-browser dev / command unavailable — localStorage seed stands */ }
      hydrated.current = true
    })()
  }, [])

  // persist + broadcast + apply overlay visibility on any change
  useEffect(() => {
    localStorage.setItem('gm-settings', JSON.stringify(s))
    // Mirror to the origin-independent backend file — but not before hydration
    // resolves, or the localStorage seed would clobber the file's newer copy.
    if (hydrated.current) void invoke('save_settings_file', { json: JSON.stringify(s) }).catch(() => {})
    void emit('settings', s)
    void invoke('set_overlay_visible', { visible: s.overlayVisible }).catch(() => {})
  }, [s])

  // Item 5: keep Rust's gank voice in sync with the user's chosen voice/rate.
  // Fires once on startup and on every voice setting change. Best-effort.
  useEffect(() => {
    void invoke('set_cv_voice', { name: s.voiceName || null, rate: s.voiceRate ?? null }).catch(() => {})
  }, [s.voiceName, s.voiceRate])

  // CR-007 WP-4 Fix 1: `s.voiceEnabled` gates Maiden's PERSONA voice only.
  // G-Signal's own gate is now owned solely by the deck's audio rail SIGNAL
  // toggle (CommandDeck.tsx, `set_cv_signal_enabled`) — this effect used to
  // also push `set_cv_signal_enabled` here, which meant muting persona voice
  // silently desynced the deck's SIGNAL toggle (two owners writing the same
  // backend flag). Do not re-add an invoke('set_cv_signal_enabled', ...) call
  // keyed off s.voiceEnabled; see CR-007-frostline-deck-refresh.md WP-4.

  // Mirror the user's chosen gank-warning sensitivity to the Rust capture loop
  // (applied on the next CV tick — no restart needed).
  useEffect(() => {
    void invoke('set_cv_signal_sensitivity', { level: s.signalSensitivity }).catch(() => {})
  }, [s.signalSensitivity])

  // Telemetry source for the deck footer (GPU/CPU-temp): auto/feeder/gtelemetry/off.
  useEffect(() => {
    const src = { auto: 0, feeder: 1, gtelemetry: 2, off: 3 }[s.telemetrySource] ?? 0
    void invoke('set_telemetry_source', { source: src }).catch(() => {})
  }, [s.telemetrySource])

  // G-Master backend & ollama model — mirror to the Rust state used by advise().
  useEffect(() => {
    void invoke('set_master_backend', { backend: s.masterBackend }).catch(() => {})
  }, [s.masterBackend])
  useEffect(() => {
    void invoke('set_master_ollama_model', { name: s.masterOllamaModel }).catch(() => {})
  }, [s.masterOllamaModel])
  // G-Master auth MODE only (plan vs apikey). CR-008 WP-2: the key is owned by
  // the DPAPI secret store, not this effect — pushing it here would clobber the
  // startup-loaded key with '' (gate finding B2).
  useEffect(() => {
    void invoke('set_master_mode', { auth: s.masterAuth }).catch(() => {})
  }, [s.masterAuth])

  // CR-008 WP-2: store/clear the Anthropic key in the DPAPI secret store (backend
  // owns the plaintext). Passing '' clears it. Refresh saved-state from the
  // backend rather than trusting the local string.
  const saveMasterApiKey = async (k: string) => {
    try {
      await invoke('set_master_api_key', { key: k })
      setApiKeyPresent(await invoke<boolean>('has_master_api_key'))
    } catch { /* not under Tauri (browser dev) — nothing to persist */ }
  }

  // CR-008 WP-2 one-time migration: move a legacy plaintext key out of the
  // localStorage settings blob into the DPAPI store, then scrub it. We read the
  // value straight from localStorage (source of truth, independent of the `[s]`
  // save-effect ordering) and only delete the plaintext AFTER a confirmed DPAPI
  // write — on any failure the plaintext is kept and retried next launch (no
  // silent loss). Also seeds `apiKeyPresent` from the backend.
  useEffect(() => {
    void (async () => {
      try {
        const raw = JSON.parse(localStorage.getItem('gm-settings') ?? '{}') as Record<string, unknown>
        const legacy = typeof raw.masterApiKey === 'string' ? raw.masterApiKey.trim() : ''
        if (legacy) {
          await invoke('set_master_api_key', { key: legacy }) // throws → caught, plaintext kept
          delete raw.masterApiKey
          localStorage.setItem('gm-settings', JSON.stringify(raw))
          setS((p) => { const cp: Record<string, unknown> = { ...p }; delete cp.masterApiKey; return cp as unknown as Settings })
        }
      } catch { /* not under Tauri, or DPAPI write failed — keep plaintext, retry next launch */ }
      try { setApiKeyPresent(await invoke<boolean>('has_master_api_key')) } catch { /* browser dev */ }
    })()
  }, [])

  // Toggle in-game calibration evidence capture (off by default; QA/tuning mode).
  useEffect(() => {
    void invoke('set_calibration_enabled', { enabled: s.calibration }).catch(() => {})
  }, [s.calibration])

  // Silent-arm efficacy study opt-in (RWANG TASK 2) — off by default, local only.
  useEffect(() => {
    void invoke('set_efficacy_enabled', { enabled: s.efficacyStudy }).catch(() => {})
  }, [s.efficacyStudy])

  // Sync master volume to Rust audio backend on user-driven changes only.
  // CR-007 WP-4 Fix 1: the deck's audio rail is now the single owner that
  // pushes volume on MOUNT (CommandDeck.tsx) — if this effect also fired on
  // mount (it did: a `[s.volume]`-keyed effect runs on the initial render
  // too), Control's locally-loaded `s.volume` could stomp the rail's
  // just-pushed value the instant Control mounted (e.g. opening Settings).
  // The skip-first-run guard below means this only invokes on an actual
  // subsequent change, while the existing `volume-change` listener below
  // keeps Control's own slider in sync with whoever else changed it.
  const volumeFirstRun = useRef(true)
  useEffect(() => {
    if (volumeFirstRun.current) { volumeFirstRun.current = false; return }
    void invoke('set_volume', { vol: s.volume }).catch(() => {})
  }, [s.volume])

  // Listen for hotkey-driven volume changes from the backend (Alt+Up/Down/M).
  useEffect(() => {
    const u = listen<number>('volume-change', (e) => {
      setS((prev) => ({ ...prev, volume: e.payload }))
    })
    return () => { void u.then((f) => f()) }
  }, [])

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))

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
              <Row label="ตำแหน่ง"><Seg value={s.position} options={[['top', 'บน'], ['left', 'ซ้าย'], ['right', 'ขวา'], ['custom', 'กำหนดเอง']]} onChange={(v) => set('position', v)} /></Row>
              {s.position === 'custom' && (
                <>
                  <Row label={`X: ${s.customX}%`}>
                    <input type="range" min={0} max={100} value={s.customX} onChange={(e) => set('customX', Number(e.target.value))} style={{ width: 150 }} />
                  </Row>
                  <Row label={`Y: ${s.customY}%`}>
                    <input type="range" min={0} max={90} value={s.customY} onChange={(e) => set('customY', Number(e.target.value))} style={{ width: 150 }} />
                  </Row>
                </>
              )}
              <Row label={`ความทึบพาเนล: ${Math.round(s.opacity * 100)}%`}>
                <input type="range" min={40} max={100} value={Math.round(s.opacity * 100)} onChange={(e) => set('opacity', Number(e.target.value) / 100)} style={{ width: 150 }} />
              </Row>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderTop: '1px solid rgba(143,212,255,0.08)' }}>
                <span style={{ fontSize: 13.5 }}>แผงสถิติ overlay</span>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {([['showTimer', 'นาฬิกา'], ['showScore', 'สกอร์'], ['showHeroBar', 'HP/Mana'], ['showKda', 'K/D/A'], ['showGold', 'ทอง/NW']] as [keyof Settings, string][]).map(([k, label]) => (
                    <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: s[k] ? C.txt : C.mut, cursor: 'pointer' }}>
                      <input type="checkbox" checked={s[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} style={{ accentColor: C.ice }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
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
                <button onClick={() => { const n = prompt('ชื่อโปรไฟล์:'); if (n?.trim()) saveProfile(n.trim()) }}
                  style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 7, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>
                  + บันทึกโปรไฟล์
                </button>
              </div>
            </Card>

            <Card title="Overlay UI">
              <div style={{ fontSize: 11.5, color: C.mut, marginBottom: 4, lineHeight: 1.55 }}>
                ทุกชิ้นของ overlay เป็น <b style={{ color: C.txt }}>โมดูลอิสระ</b> — เปิด/ปิด, ย่อ-ขยาย และลากวางตำแหน่งเองได้ (glass ดีไซน์ Maiden Blue). ลากบนพรีวิว 16:9 ด้านล่าง แล้ว overlay จริงจะขยับตามทันที.
              </div>
              <LayoutEditor value={s.layout} onChange={(l) => set('layout', l)} />
            </Card>
          </>
        )}

        {category === 'voice' && (
          <>
            <Card title="Alerts (G-Signal)">
              <Row label="เตือนเมื่อ HP ต่ำ"><Toggle on={s.alertEnabled} onChange={(v) => set('alertEnabled', v)} /></Row>
              <Row label={`ขีดเตือน HP: ${s.alertThreshold}%`}>
                <input type="range" min={10} max={50} value={s.alertThreshold} onChange={(e) => set('alertThreshold', Number(e.target.value))} style={{ width: 150 }} disabled={!s.alertEnabled} />
              </Row>
              <Row label="เสียงพูด (Maiden)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => void invoke('speak', { text: 'G-Maiden voice test. ทดสอบเสียงค่ะ เลือดน้อยแล้ว ถอยก่อน', voice: s.voiceName || null, rate: s.voiceRate }).catch(() => {})} disabled={!s.voiceEnabled}
                    style={{ background: 'transparent', color: s.voiceEnabled ? C.ice : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: s.voiceEnabled ? 'pointer' : 'not-allowed' }}>
                    🔊 ทดสอบเสียง
                  </button>
                  <Toggle on={s.voiceEnabled} onChange={(v) => set('voiceEnabled', v)} />
                </div>
              </Row>
              <Row label="เลือกเสียง">
                <select value={s.voiceName} onChange={(e) => set('voiceName', e.target.value)} disabled={!s.voiceEnabled || voices.length === 0}
                  style={{ background: 'rgba(18,20,28,0.86)', color: s.voiceEnabled ? C.txt : C.mut, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, maxWidth: 240 }}>
                  <option value="">— ระบบเลือกเอง —</option>
                  {voices.map((v) => (
                    <option key={v.name} value={v.name}>{v.name} ({v.culture}, {v.gender === 'Female' ? 'หญิง' : v.gender === 'Male' ? 'ชาย' : v.gender})</option>
                  ))}
                </select>
              </Row>
              <Row label={`ความเร็ว: ${s.voiceRate > 0 ? '+' : ''}${s.voiceRate}`}>
                <input type="range" min={-5} max={5} step={1} value={s.voiceRate} onChange={(e) => set('voiceRate', Number(e.target.value))} disabled={!s.voiceEnabled} style={{ width: 150 }} />
              </Row>
              <Row label={`ระดับเสียง: ${s.volume}%${s.volume === 0 ? ' (ปิดเสียง)' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => set('volume', s.volume === 0 ? 80 : 0)}
                    style={{ background: 'transparent', color: s.volume === 0 ? C.bad : C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '4px 8px', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}>
                    {s.volume === 0 ? '🔇' : s.volume <= 30 ? '🔈' : s.volume <= 70 ? '🔉' : '🔊'}
                  </button>
                  <input type="range" min={0} max={100} step={5} value={s.volume} onChange={(e) => set('volume', Number(e.target.value))} style={{ width: 130 }} />
                </div>
              </Row>
              <Row label="พูดเสริมตามเหตุการณ์">
                <Toggle on={s.personaLines} onChange={(v) => set('personaLines', v)} />
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                Windows SAPI · ติดตั้งเสียงไทยใน Windows Settings · Time & Language · Speech เพื่อให้ Maiden พูดไทยชัดขึ้น
                {voices.length > 0 && voices.every((v) => !v.culture.startsWith('th')) && (
                  <span style={{ color: C.warn }}> · ตอนนี้ยังไม่มี Thai voice → จะใช้เสียง {voices[0]?.gender === 'Female' ? 'อังกฤษ' : 'อังกฤษ'} อ่านข้อความไทย</span>
                )}
              </div>
            </Card>

            <Card title="G-Signal — แบนเนอร์แจ้งเตือน">
              <Row label="แบนเนอร์เตือนแก๊งค์ (gank)"><Toggle on={s.gankVisuals} onChange={(v) => set('gankVisuals', v)} /></Row>
              <Row label="แบนเนอร์ฆ่า / สตรีค (kill banner)">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => { void emit('preview-kill', { streak: 5, victim: 'npc_dota_hero_lina' }); void invoke('speak_event', { event: 'mega_kill', fallback: 'เมก้าคิล!', voice: null, rate: null }).catch(() => {}) }}
                    title="โชว์ตัวอย่างแบนเนอร์บน overlay (ต้องเปิด overlay อยู่)"
                    style={{ background: 'transparent', color: C.ice, border: `1px solid ${C.line}`, borderRadius: 8, padding: '5px 11px', fontSize: 12, cursor: 'pointer' }}>▶ ดูตัวอย่าง</button>
                  <Toggle on={s.killVisuals} onChange={(v) => set('killVisuals', v)} />
                </div>
              </Row>
              <Row label="ความไวเตือนแก๊งค์">
                <div style={{ display: 'inline-flex', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                  {(['low','med','high'] as Sensitivity[]).map((lv) => (
                    <button key={lv} onClick={() => set('signalSensitivity', lv)}
                      style={{ background: s.signalSensitivity === lv ? 'rgba(143,212,255,0.16)' : 'transparent', color: s.signalSensitivity === lv ? C.ice : C.mut, border: 'none', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
                      {lv === 'low' ? 'ตึง (≥85%)' : lv === 'med' ? 'สมดุล (≥65%)' : 'ไว (≥50%)'}
                    </button>
                  ))}
                </div>
              </Row>
              <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.55 }}>
                แบนเนอร์ขึ้นกลาง-บนของจอเมื่อ G-Signal เตือนแก๊งค์ (ไม่บังมินิแมพ).
              </div>
            </Card>

            <AudioSettingsCard />
          </>
        )}

        {category === 'ai' && (
          <>
            <MasterCard tick={tick} voice={s.voiceName} rate={s.voiceRate} enabled={s.masterEnabled} onEnabledChange={(v) => set('masterEnabled', v)} autoAdvice={s.autoAdvice} onAutoAdviceChange={(v) => set('autoAdvice', v)} backend={s.masterBackend} onBackendChange={(b) => set('masterBackend', b)} auth={s.masterAuth} onAuthChange={(a) => set('masterAuth', a)} apiKeyPresent={apiKeyPresent} onApiKeySave={saveMasterApiKey} ollamaModel={s.masterOllamaModel} onOllamaModelChange={(m) => set('masterOllamaModel', m)} onUsageChanged={() => setQuotaTick((n) => n + 1)} />
            <QuotaCard refreshTrigger={quotaTick} />
          </>
        )}

        {category === 'modules' && (
          <>
            <Card title="Modules &amp; System">
              {(() => {
                const capAcc = captureMode === 'dxgi' ? C.ok : captureMode === 'lite' ? C.warn : C.mut
                const capLabel = captureMode === 'dxgi' ? 'DXGI' : captureMode === 'lite' ? 'Lite' : '…'
                const capTitle = captureMode === 'dxgi'
                  ? 'DXGI Desktop Duplication — minimap detection active'
                  : captureMode === 'lite'
                    ? 'Minimap detection ปิดอยู่ — ใช้ borderless fullscreen เพื่อเปิด full detection เต็มรูปแบบ'
                    : 'กำลังเริ่มต้น capture'
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, fontSize: 11.5, color: C.mut }}>
                    <span>Capture</span>
                    <span title={capTitle} style={{ padding: '2px 9px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: capAcc, background: `${capAcc}1f`, border: `1px solid ${capAcc}` }}>{capLabel}</span>
                  </div>
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
                  <span style={{ color: resources.ram_mb > 400 ? C.bad : C.ok }}>
                    RAM: <b>{resources.ram_mb.toFixed(0)} MB</b> / 400 MB
                  </span>
                  <span style={{ color: resources.cpu_pct > 2.5 ? C.bad : C.ok }}>
                    CPU: <b>{resources.cpu_pct.toFixed(1)}%</b> / 2.5%
                  </span>
                  {resources.over_budget && (
                    <span style={{ color: C.warn }}>⚠ เกิน budget — อาจลดความถี่ CV</span>
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
              {tick && tick.in_game ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', paddingTop: 6 }}>
                  <Stat label="Clock" value={fmtClock(tick.clock_time)} color={C.ice} />
                  <Stat label="Hero" value={heroName(tick.hero)} />
                  <Stat label="Lvl" value={tick.level} />
                  <Stat label="K/D/A" value={`${tick.kills}/${tick.deaths}/${tick.assists}`} />
                  <Stat label="Net Worth" value={tick.net_worth.toLocaleString()} color={C.ice} />
                  <Stat label="HP" value={`${tick.hp_percent}%`} color={tick.hp_percent <= s.alertThreshold ? C.bad : C.ok} />
                </div>
              ) : (
                <div style={{ fontSize: 13, color: C.mut, paddingTop: 10 }}>{seen ? 'เชื่อมต่อแล้ว — รอเข้าเกม Dota 2' : 'เปิด Dota 2 (ติดตั้ง GSI config แล้ว) เพื่อดูข้อมูลสด'}</div>
              )}
            </Card>

            <SetupCard />
            <LogCard live={!!tick?.in_game} clockTime={tick?.clock_time ?? 0} />

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
