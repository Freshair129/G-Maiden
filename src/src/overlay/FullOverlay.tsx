import type { MissingState } from '../app/types'
import React, { useEffect, useRef, useState } from 'react'
import type { GameTick, GsiFreshness, Settings, GankState, ReviveAdvice } from '../App'
import { BOX_REF, MODULE_BOX, cfgOf, type ModuleCfg, type ModuleId } from './modules'

const C = {
  ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6',
  ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', edge: 'rgba(143,212,255,0.22)',
}
const fmtClock = (t: number) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${(Math.abs(t) % 60).toString().padStart(2, '0')}`
const heroName = (raw: string) => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

const Module: React.FC<{ id: ModuleId; cfg: ModuleCfg; children: React.ReactNode }> = ({ id, cfg, children }) => {
  const content = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const box = MODULE_BOX[id]
  useEffect(() => {
    const node = content.current
    if (!node) return
    const measure = () => setFit(id === 'banner' ? 1 : Math.min(1, box.w / Math.max(1, node.scrollWidth), box.h / Math.max(1, node.offsetHeight)))
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()
    return () => observer.disconnect()
  }, [box, id])
  return <div data-overlay-module={id} style={{ position: 'fixed', left: `${cfg.x}%`, top: `${cfg.y}%`, width: box.w, height: box.h, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `translate(-50%, -50%) scale(calc(${cfg.scale} * var(--gm-overlay-scale, 1)))`, pointerEvents: 'none', zIndex: 10 }}>
    <div ref={content} style={{ width: box.w, flexShrink: 0, overflowWrap: 'anywhere', overflow: id === 'banner' ? 'visible' : undefined, transform: `scale(${fit})` }}>{children}</div>
  </div>
}

const glass = (op: number): React.CSSProperties => ({
  background: `rgba(14,17,24,${op})`,
  border: `1px solid ${C.edge}`,
  borderRadius: 16,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(143,212,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.35)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  color: C.txt,
  transition: 'transform 200ms ease, opacity 200ms ease',
})

const bar = (pct: number, color: string) => (
  <div style={{ height: 5, width: 120, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color, borderRadius: 99 }} />
  </div>
)

interface Props {
  tick: GameTick | null
  s: Settings
  gank: GankState
  missingHeroes: Set<string>
  warningStatus?: MissingState | null
  overlayAdvice: string | null
  /** G-Revive buyback verdict shown while dead (null when alive/none). */
  buyback: { advice: ReviveAdvice; narrative: string | null } | null
  /** Volume 0–100 for the transient Alt+Up/Down/M feedback, or null when idle. */
  volToast: number | null
  /** GSI feed is live (Dota running) — gates the pre-game standby chip. */
  gsiActive: boolean
  /** Fresh validated GSI source; preview ticks are explicitly allowed too. */
  gsiFresh: boolean
  gsiFreshness: GsiFreshness
  gsiAgeMs: number | null
  /** Dota's last-known in-match lifecycle remains open through a feed outage. */
  matchActive: boolean
  /** Settings overlay-preview is active — also shows the standby chip. */
  previewMode: boolean
  /** The minimap sensor is producing trustworthy data (capture.rs
   * `sensor-health.healthy`). FALSE means Lite mode / no ONNX model / a capture
   * stall — states in which the missing-hero set is empty for the wrong reason,
   * so the G-Meter must NOT show green. */
  sensorOk: boolean
  referenceViewport?: boolean
}

/** Continuous-risk level derived from G-Sentry's missing-hero count (and the
 * G-Signal alert flag, which always pegs to high). G-Signal only fires past a
 * hard threshold, so this gives the player a *gradient* — "ปลอดภัย/ระวัง/เสี่ยง/
 * อันตราย" — without showing raw probability percentages. */
function gmeterLevel(missing: number, gank: GankState): 0 | 1 | 2 | 3 {
  if (gank?.phase === 'alert') return 3
  if (missing >= 1) return 1
  return 0
}
const G_LEVELS = [
  { label: 'ยังไม่มีสัญญาณเสี่ยง', color: '#8794a6', glow: 'rgba(91,227,167,0.35)' },
  { label: 'มองไม่เห็น', color: '#8fd4ff', glow: 'rgba(143,212,255,0.35)' },
  { label: 'เสี่ยง', color: '#ffcf6b', glow: 'rgba(255,207,107,0.5)' },
  { label: 'อันตราย', color: '#ff7b85', glow: 'rgba(255,123,133,0.6)' },
] as const

export const FullOverlay: React.FC<Props> = ({ tick, s, gank, missingHeroes, warningStatus, overlayAdvice, buyback, volToast, gsiActive, gsiFresh, gsiFreshness, gsiAgeMs, matchActive, previewMode, sensorOk, referenceViewport = false }) => {
  const [viewportScale, setViewportScale] = useState(1)
  useEffect(() => {
    if (referenceViewport) return
    const resize = () => setViewportScale(Math.min(window.innerWidth / BOX_REF.w, window.innerHeight / BOX_REF.h))
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [referenceViewport])

  const op = s.opacity
  // Session lifecycle remains visible during a feed outage, while own-state
  // widgets stay suppressed because the parent passes no stale tick.
  const inGame = matchActive
  const t = tick
  const L = s.layout

  /** Wrap content in a positioned module iff it's enabled in the layout. */
  const M = (id: ModuleId, content: React.ReactNode) => {
    const cfg = cfgOf(L, id)
    return cfg.enabled ? <Module key={id} id={id} cfg={cfg}>{content}</Module> : null
  }
  /** Small stat chip (one value). */
  const chip = (label: string, value: React.ReactNode, color?: string) => (
    <div style={{ ...glass(op), padding: '7px 13px', textAlign: 'center', minWidth: 46 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? C.txt, lineHeight: 1 }}>{value}</div>
      {label && <div style={{ fontSize: 9, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>{label}</div>}
    </div>
  )

  // ── CompanionStage — Maiden presence. Stylized SVG portrait (Crystal-Maiden
  // archetype: hood, ice palette, frost crystal); a higher-fidelity render can
  // drop in later by swapping the asset path — the surrounding card sizes it.
  const companion = (
    <div style={{ ...glass(op), padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 11, minWidth: 142 }}>
      <img
        src="/maiden-portrait.svg"
        alt="Maiden"
        width={44}
        height={44}
        style={{ flex: 'none', borderRadius: 14, boxShadow: '0 0 16px rgba(143,212,255,0.5)' }}
      />
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6 }}>Maiden</div>
        <div style={{ fontSize: 10.5, color: inGame ? C.ok : C.mut }}>{inGame ? '● กำลังดูแล' : 'รอเข้าเกม…'}</div>
      </div>
    </div>
  )

  // ── G-Meter — always-on continuous risk indicator (low/med/high, no %).
  // 4-segment LED-style: lit segments == level (0..3), color shifts safe→danger.
  //
  // BLIND STATE (audit B3): `missingHeroes` is empty both when the map is
  // genuinely clear and when nothing is watching it — Lite mode, a missing
  // ONNX model, a capture stall. Rendering a green "ปลอดภัย" for the second
  // case is the one failure a safety companion may not have, so when the
  // sensor is not healthy the meter goes dark and says so instead. An active
  // G-Signal alert still wins: we withhold reassurance, never a warning.
  const blind = inGame && (!sensorOk || !gsiFresh || (!previewMode && !warningStatus?.ready)) && gank?.phase !== 'alert'
  const lvl = inGame ? gmeterLevel(missingHeroes.size, gank) : 0
  const meterColor = blind ? C.mut : G_LEVELS[lvl].color
  const gMeter = (
    <div style={{ ...glass(op), padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 158 }}>
      <span style={{ fontSize: 10, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.7 }}>Risk</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 16, height: 8, borderRadius: 2,
            // Blind: every segment unlit — the absence of a reading is the
            // reading. Never color-only (Principle: color + label together),
            // so the label below carries the same meaning in words.
            background: !blind && i <= lvl ? meterColor : 'rgba(255,255,255,0.08)',
            boxShadow: !blind && i <= lvl ? `0 0 6px ${G_LEVELS[lvl].glow}` : 'none',
            transition: 'background 200ms ease, box-shadow 200ms ease',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: meterColor, marginLeft: 'auto' }}>
        {blind ? (warningStatus && warningStatus.roster_known < 5 ? `ยืนยันศัตรู ${warningStatus.roster_known}/5` : 'ข้อมูลยังไม่พร้อม') : G_LEVELS[lvl].label}
      </span>
    </div>
  )

  // ── Volume toast (ported) — brief Alt+Up/Down/M feedback.
  const volUi = volToast !== null ? (
    <div style={{ ...glass(op), padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
      <span>{volToast === 0 ? '🔇' : volToast <= 30 ? '🔈' : volToast <= 70 ? '🔉' : '🔊'}</span>
      <div style={{ width: 80, height: 5, background: 'rgba(255,255,255,0.12)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${volToast}%`, background: C.ice, borderRadius: 99, transition: 'width .15s' }} />
      </div>
      <span style={{ color: C.ice, fontWeight: 600, minWidth: 32, textAlign: 'right' }}>{volToast}%</span>
    </div>
  ) : null

  // ── Standby chip (ported) — pre-game "GSI Signal" presence over Dota menus.
  const showStandby = !inGame && (gsiActive || previewMode || gsiFreshness === 'stale')
  const standbyUi = (
    <div style={{ ...glass(op), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: gsiFreshness === 'stale' ? C.warn : gsiActive ? C.ok : C.bad }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>G-Maiden</div>
        <div style={{ fontSize: 11, color: gsiFreshness === 'stale' ? C.warn : C.mut }}>
          {gsiFreshness === 'stale' ? `GSI stale${gsiAgeMs === null ? '' : ` · ${(gsiAgeMs / 1000).toFixed(1)}s`}` : 'GSI Signal'}
        </div>
      </div>
    </div>
  )
  const staleNotice = gsiFreshness === 'stale' ? (
    <div style={{ position: 'fixed', right: 12, bottom: 12, ...glass(0.88), padding: '6px 10px', color: C.warn, fontSize: 11, zIndex: 30 }}>
      GSI stale{gsiAgeMs === null ? '' : ` · ${(gsiAgeMs / 1000).toFixed(1)}s`} · พักข้อมูลผู้เล่น · CV ยังทำงาน
    </div>
  ) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'none', '--gm-overlay-scale': viewportScale } as React.CSSProperties}>
      {staleNotice}

      {inGame && M('gmeter', gMeter)}

      {inGame && M('companion', companion)}


      {volUi && M('vol', volUi)}
      {showStandby && M('standby', standbyUi)}

      {inGame && overlayAdvice && s.gankVisuals
        ? M('advice', (
            <div style={{ ...glass(op), padding: '12px 18px', maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>Maiden แนะนำ</div>
              <div>{overlayAdvice}</div>
            </div>
          ))
        : null}

      {inGame && buyback && s.gankVisuals
        ? M('buyback', (() => {
            const a = buyback.advice
            const accent = a.urgency === 'Strong' ? C.bad : a.urgency === 'Consider' ? C.warn : C.ice
            const verdict = a.recommend_buyback === null ? 'ยังประเมินไม่ได้' : a.recommend_buyback ? (a.urgency === 'Strong' ? 'ซื้อเกิดเลย!' : 'ควรซื้อเกิด') : 'รอเกิด'
            // Live countdown: GSI streams hero.respawn_seconds every tick, so
            // prefer it over the advice's frozen at-death snapshot (Boss
            // 2026-07-20: "เวลาไม่นับถอยหลัง").
            const secs = t && !t.alive && t.respawn_seconds > 0
              ? t.respawn_seconds
              : Math.max(0, Math.round(a.natural_respawn_remaining))
            return (
              <div style={{ ...glass(op), padding: '12px 18px', maxWidth: 420, fontSize: 13, lineHeight: 1.5, border: `1px solid ${accent}` }}>
                <div style={{ fontSize: 10, color: accent, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>💀 Buyback</span>
                  <span style={{ background: accent, color: '#08090c', borderRadius: 6, padding: '1px 7px', fontWeight: 700 }}>{verdict}</span>
                </div>
                <div>{buyback.narrative || a.reason}</div>
                <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>เกิดเองใน {secs}s{a.affordable === false ? ' · เงินไม่พอซื้อเกิด' : ''}</div>
              </div>
            )
          })())
        : null}

      {inGame && missingHeroes.size > 0 && !gank && s.gankVisuals
        ? M('missing', (
            <div style={{ ...glass(op), padding: '8px 14px', border: `1px solid rgba(255,207,107,0.45)`, color: C.warn, fontSize: 12.5, display: 'flex', gap: 8 }}>
              <span style={{ opacity: 0.7 }}>👁️</span>
              <span>หาย: {[...missingHeroes].map(heroName).join(', ')}</span>
            </div>
          ))
        : null}

      {inGame && t && (
        <>
          {M('clock', chip('', fmtClock(t.clock_time), C.ice))}
          {M('kda', chip('K / D / A', `${t.kills}/${t.deaths}/${t.assists}`))}
          {M('gold', chip('Gold', t.gold.toLocaleString(), C.warn))}
          {M('gpm', chip('GPM', t.gpm))}
          {M('xpm', chip('XPM', t.xpm))}
          {M('nw', chip('NW', t.net_worth > 0 ? t.net_worth.toLocaleString() : '—', C.ice))}
          {M('score', chip('Score', (
            <span><span style={{ color: C.ok }}>{t.radiant_score}</span> <span style={{ color: C.mut }}>:</span> <span style={{ color: C.bad }}>{t.dire_score}</span></span>
          )))}
          {M('hero', (
            <div style={{ ...glass(op), padding: '9px 13px', minWidth: 140 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.alive ? C.txt : C.bad, marginBottom: 5 }}>
                {heroName(t.hero)} {!t.alive && '💀'} <span style={{ color: C.mut, fontWeight: 400 }}>Lv{t.level}</span>
              </div>
              <div style={{ marginBottom: 3 }}>{bar(t.hp_percent, C.ok)}</div>
              {bar(t.mana_percent, C.ice)}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
