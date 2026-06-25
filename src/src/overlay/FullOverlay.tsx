/**
 * Full overlay — the redesign tier (opt-in via Settings.uiMode = 'full').
 *
 * Isolated from the stable "lite" overlay in App.tsx. Each piece is an
 * independent MODULE positioned + scaled from Settings.layout (edited in the
 * Control window's LayoutEditor). Backend is shared — same game-tick / gank
 * events drive both tiers.
 *
 * Phase 2: stats split into individual draggable modules (clock/KDA/gold/GPM/
 * XPM/NW/score/HP-mana) + a CompanionStage presence module. Next: drop the
 * Crystal Maiden portrait into CompanionStage, voice-pack tab.
 */
import React from 'react'
import type { GameTick, Settings, GankState } from '../App'
import { cfgOf, type ModuleCfg, type ModuleId } from './modules'

const C = {
  ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6',
  ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', edge: 'rgba(143,212,255,0.22)',
}
const fmtClock = (t: number) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${(Math.abs(t) % 60).toString().padStart(2, '0')}`
const heroName = (raw: string) => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

const Module: React.FC<{ cfg: ModuleCfg; children: React.ReactNode }> = ({ cfg, children }) => (
  <div style={{ position: 'fixed', left: `${cfg.x}%`, top: `${cfg.y}%`, transform: `translate(-50%, -50%) scale(${cfg.scale})`, pointerEvents: 'none', zIndex: 10 }}>
    {children}
  </div>
)

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
  overlayAdvice: string | null
  /** Last voice event mirrored on-screen (G-Signal/persona/advice). Becomes
   * the silent fallback when the voice pack hasn't shipped — users still see
   * which event triggered. Auto-dismisses in the parent. */
  toast: { event: string; text: string } | null
}

/** Continuous-risk level derived from G-Sentry's missing-hero count (and the
 * G-Signal alert flag, which always pegs to high). G-Signal only fires past a
 * hard threshold, so this gives the player a *gradient* — "ปลอดภัย/ระวัง/เสี่ยง/
 * อันตราย" — without showing raw probability percentages. */
function gmeterLevel(missing: number, gank: GankState): 0 | 1 | 2 | 3 {
  if (gank?.phase === 'alert') return 3
  if (missing >= 3) return 3
  if (missing >= 2) return 2
  if (missing >= 1) return 1
  return 0
}
const G_LEVELS = [
  { label: 'ปลอดภัย', color: '#5be3a7', glow: 'rgba(91,227,167,0.35)' },
  { label: 'ระวัง', color: '#8fd4ff', glow: 'rgba(143,212,255,0.35)' },
  { label: 'เสี่ยง', color: '#ffcf6b', glow: 'rgba(255,207,107,0.5)' },
  { label: 'อันตราย', color: '#ff7b85', glow: 'rgba(255,123,133,0.6)' },
] as const

export const FullOverlay: React.FC<Props> = ({ tick, s, gank, missingHeroes, overlayAdvice, toast }) => {
  const op = s.opacity
  const inGame = !!tick && tick.in_game
  const t = tick
  const L = s.layout

  /** Wrap content in a positioned module iff it's enabled in the layout. */
  const M = (id: ModuleId, content: React.ReactNode) => {
    const cfg = cfgOf(L, id)
    return cfg.enabled ? <Module key={id} cfg={cfg}>{content}</Module> : null
  }
  /** Small stat chip (one value). */
  const chip = (label: string, value: React.ReactNode, color?: string) => (
    <div style={{ ...glass(op), padding: '7px 13px', textAlign: 'center', minWidth: 46 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? C.txt, lineHeight: 1 }}>{value}</div>
      {label && <div style={{ fontSize: 9, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>{label}</div>}
    </div>
  )

  // ── Danger Alert (special — gank state drives the variant)
  const alertCfg = cfgOf(L, 'alert')
  const alert = s.gankVisuals && gank && alertCfg.enabled ? (
    <Module key="alert" cfg={alertCfg}>
      {gank.phase === 'clear' ? (
        <div style={{ ...glass(0.82), padding: '9px 22px', border: `1px solid ${C.ice}`, color: C.ice, fontWeight: 600, fontSize: 14 }}>เอ๊ะ… ปลอดภัยแล้วค่ะ</div>
      ) : (
        <div style={{ ...glass(0.84), padding: '10px 24px', border: `1px solid ${C.warn}`, color: C.warn, fontWeight: 700, fontSize: 15, boxShadow: '0 0 30px rgba(255,207,107,0.4)' }}>
          ⚠️ ระวังแก๊งค์! {gank.heroes.length ? gank.heroes.map(heroName).join(', ') + ' — ' : ''}{Math.round(gank.probability * 100)}%
        </div>
      )}
    </Module>
  ) : null

  // ── CompanionStage — Maiden presence (portrait placeholder → real CM art later)
  // TODO: replace with Crystal Maiden portrait when the FLUX LoRA-generated PNG asset lands.
  const companion = (
    <div style={{ ...glass(op), padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 11, minWidth: 142 }}>
      <div style={{ width: 44, height: 44, borderRadius: 14, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 35% 30%, #bfe6ff, #3f7fb0 68%, #16222f)', boxShadow: '0 0 16px rgba(143,212,255,0.5), inset 0 0 8px rgba(255,255,255,0.25)' }}>
        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.55), rgba(255,255,255,0) 70%)' }} />
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.6 }}>Maiden</div>
        <div style={{ fontSize: 10.5, color: inGame ? C.ok : C.mut }}>{inGame ? '● กำลังดูแล' : 'รอเข้าเกม…'}</div>
      </div>
    </div>
  )

  // ── G-Meter — always-on continuous risk indicator (low/med/high, no %).
  // 4-segment LED-style: lit segments == level (0..3), color shifts safe→danger.
  const lvl = inGame ? gmeterLevel(missingHeroes.size, gank) : 0
  const gMeter = (
    <div style={{ ...glass(op), padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 10, minWidth: 158 }}>
      <span style={{ fontSize: 10, color: C.mut, textTransform: 'uppercase', letterSpacing: 0.7 }}>Risk</span>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{
            width: 16, height: 8, borderRadius: 2,
            background: i <= lvl ? G_LEVELS[lvl].color : 'rgba(255,255,255,0.08)',
            boxShadow: i <= lvl ? `0 0 6px ${G_LEVELS[lvl].glow}` : 'none',
            transition: 'background 200ms ease, box-shadow 200ms ease',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: G_LEVELS[lvl].color, marginLeft: 'auto' }}>
        {G_LEVELS[lvl].label}
      </span>
    </div>
  )

  // ── Voice notice (toast) — mirrors the spoken cue on-screen so the player
  // sees the trigger event even when the voice pack isn't installed yet.
  const toastUi = toast ? (
    <div style={{ ...glass(0.88), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10, maxWidth: 460, border: `1px solid ${C.ice}` }}>
      <span style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.7, flex: 'none' }}>🔔 {toast.event} (voice)</span>
      <span style={{ fontSize: 12.5, opacity: 0.92 }}>{toast.text}</span>
    </div>
  ) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'none' }}>
      {alert}
      {inGame && M('gmeter', gMeter)}
      {toastUi && M('toast', toastUi)}
      {M('companion', companion)}

      {overlayAdvice && s.gankVisuals
        ? M('advice', (
            <div style={{ ...glass(op), padding: '12px 18px', maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>Maiden แนะนำ</div>
              <div>{overlayAdvice}</div>
            </div>
          ))
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
