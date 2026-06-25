/**
 * Full overlay — the redesign tier (opt-in via Settings.uiMode = 'full').
 *
 * Isolated from the stable "lite" overlay in App.tsx. Each piece is an
 * independent MODULE positioned + scaled from Settings.layout (edited in the
 * Control window's LayoutEditor), in the "Maiden Blue Quiet Luxury" direction.
 * Backend is shared — same game-tick / gank events drive both tiers.
 *
 * Phase 1: module system (position + scale + enable from the saved layout).
 * Next: split stats into sub-modules (GPM/XPM/NW), character presence, voice tab.
 */
import React from 'react'
import type { GameTick, Settings, GankState } from '../App'
import { cfgOf, type ModuleCfg } from './modules'

const C = {
  ice: '#8fd4ff', txt: '#e7eef6', mut: '#8794a6',
  ok: '#5be3a7', warn: '#ffcf6b', bad: '#ff7b85', edge: 'rgba(143,212,255,0.22)',
}
const fmtClock = (t: number) => `${t < 0 ? '-' : ''}${Math.floor(Math.abs(t) / 60)}:${(Math.abs(t) % 60).toString().padStart(2, '0')}`
const heroName = (raw: string) => {
  const n = raw.replace(/^npc_dota_hero_/, '').replace(/_/g, ' ').trim()
  return n ? n.replace(/\b\w/g, (c) => c.toUpperCase()) : '—'
}

/** A positioned, scaled module — the redesign's core: each places itself from cfg. */
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
  boxShadow: '0 8px 44px rgba(0,0,0,0.5), inset 0 1px 0 rgba(143,212,255,0.10)',
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  color: C.txt,
})

const gem = (
  <div style={{ width: 10, height: 10, borderRadius: 3, transform: 'rotate(45deg)', background: 'linear-gradient(135deg,#8fd4ff,#3f7fb0)', boxShadow: '0 0 12px rgba(143,212,255,0.6)', flex: 'none' }} />
)

interface Props {
  tick: GameTick | null
  s: Settings
  gank: GankState
  missingHeroes: Set<string>
  overlayAdvice: string | null
}

export const FullOverlay: React.FC<Props> = ({ tick, s, gank, missingHeroes, overlayAdvice }) => {
  const op = s.opacity
  const inGame = !!tick && tick.in_game
  const L = s.layout

  const alertCfg = cfgOf(L, 'alert')
  const alert =
    s.gankVisuals && gank && alertCfg.enabled ? (
      <Module cfg={alertCfg}>
        {gank.phase === 'clear' ? (
          <div style={{ ...glass(0.82), padding: '9px 22px', border: `1px solid ${C.ice}`, color: C.ice, fontWeight: 600, fontSize: 14 }}>เอ๊ะ… ปลอดภัยแล้วค่ะ</div>
        ) : (
          <div style={{ ...glass(0.84), padding: '10px 24px', border: `1px solid ${C.warn}`, color: C.warn, fontWeight: 700, fontSize: 15, boxShadow: '0 0 30px rgba(255,207,107,0.4)' }}>
            ⚠️ ระวังแก๊งค์! {gank.heroes.length ? gank.heroes.map(heroName).join(', ') + ' — ' : ''}{Math.round(gank.probability * 100)}%
          </div>
        )}
      </Module>
    ) : null

  const presCfg = cfgOf(L, 'presence')
  const presence =
    presCfg.enabled ? (
      <Module cfg={presCfg}>
        <div style={{ ...glass(op), padding: '12px 16px', minWidth: 150 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: inGame ? 8 : 0 }}>
            {gem}
            <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: 0.3 }}>Maiden</span>
            {inGame && <span style={{ marginLeft: 'auto', fontSize: 16, fontWeight: 700, color: C.ice }}>{fmtClock(tick!.clock_time)}</span>}
          </div>
          {inGame ? (
            <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
              <span style={{ color: C.mut }}>K/D/A <b style={{ color: C.txt }}>{tick!.kills}/{tick!.deaths}/{tick!.assists}</b></span>
              <span style={{ color: C.mut }}>Gold <b style={{ color: C.warn }}>{tick!.gold.toLocaleString()}</b></span>
            </div>
          ) : (
            <span style={{ fontSize: 11.5, color: C.mut }}> · Full mode · รอเข้าเกม…</span>
          )}
        </div>
      </Module>
    ) : null

  const missCfg = cfgOf(L, 'missing')
  const missing =
    inGame && missingHeroes.size > 0 && !gank && s.gankVisuals && missCfg.enabled ? (
      <Module cfg={missCfg}>
        <div style={{ ...glass(op), padding: '8px 14px', border: `1px solid rgba(255,207,107,0.45)`, color: C.warn, fontSize: 12.5, display: 'flex', gap: 8 }}>
          <span style={{ opacity: 0.7 }}>👁️</span>
          <span>หาย: {[...missingHeroes].map(heroName).join(', ')}</span>
        </div>
      </Module>
    ) : null

  const advCfg = cfgOf(L, 'advice')
  const advice =
    overlayAdvice && s.gankVisuals && advCfg.enabled ? (
      <Module cfg={advCfg}>
        <div style={{ ...glass(op), padding: '12px 18px', maxWidth: 420, fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontSize: 10, color: C.ice, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>Maiden แนะนำ</div>
          <div>{overlayAdvice}</div>
        </div>
      </Module>
    ) : null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'none' }}>
      {alert}
      {presence}
      {missing}
      {advice}
    </div>
  )
}
