/**
 * Full overlay — the redesign tier (opt-in via Settings.uiMode = 'full').
 *
 * Isolated from the stable "lite" overlay in App.tsx. Each piece is an
 * independent MODULE positioned + scaled from Settings.layout (edited in the
 * G-AnnStudio's Overlay Lab, synced in). Backend is shared — same game-tick / gank
 * events drive both tiers.
 *
 * Phase 2: stats split into individual draggable modules (clock/KDA/gold/GPM/
 * XPM/NW/score/HP-mana) + a CompanionStage presence module. Next: drop the
 * Crystal Maiden portrait into CompanionStage, voice-pack tab.
 */
import React from 'react'
import type { GameTick, Settings, GankState, ReviveAdvice } from '../App'
import { cfgOf, type ModuleCfg, type ModuleId } from './modules'
import { VoiceWave } from './VoiceWave'
import { STREAK_LABELS } from './streaks'

/** Kill banner state (lite parity) — the built-in card shown per kill/streak. */
export type KillBanner = { phase: 'show' | 'exit'; kills: number; streak: number; victim: string | null } | null
/** Announcer-pack banner — the active pack's own image; REPLACES the kill card. */
export type PackBanner = { phase: 'show' | 'exit'; url: string | null; text: string; thai: string; clip: string | null } | null

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
  /** G-Revive buyback verdict shown while dead (null when alive/none). */
  buyback: { advice: ReviveAdvice; narrative: string | null } | null
  /** Last voice event mirrored on-screen (G-Signal/persona/advice). Becomes
   * the silent fallback when the voice pack hasn't shipped — users still see
   * which event triggered. Auto-dismisses in the parent. */
  toast: { event: string; text: string } | null
  // ── Ported from the lite overlay so Full is the single overlay ──
  /** Built-in kill/streak card (null when hidden or superseded by packBanner). */
  killBanner: KillBanner
  /** Active pack's queue-banner image; when set it REPLACES the kill card. */
  packBanner: PackBanner
  /** HP crossed the danger threshold (down) while alive — inline "ถอย!" cue. */
  lowHp: boolean
  /** Volume 0–100 for the transient Alt+Up/Down/M feedback, or null when idle. */
  volToast: number | null
  /** GSI feed is live (Dota running) — gates the pre-game standby chip. */
  gsiActive: boolean
  /** Settings overlay-preview is active — also shows the standby chip. */
  previewMode: boolean
  /** The minimap sensor is producing trustworthy data (capture.rs
   * `sensor-health.healthy`). FALSE means Lite mode / no ONNX model / a capture
   * stall — states in which the missing-hero set is empty for the wrong reason,
   * so the G-Meter must NOT show green. */
  sensorOk: boolean
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

export const FullOverlay: React.FC<Props> = ({ tick, s, gank, missingHeroes, overlayAdvice, buyback, toast, killBanner, packBanner, lowHp, volToast, gsiActive, previewMode, sensorOk }) => {
  const op = s.opacity
  // gsiActive guards the stale-tick case: Dota killed mid-match leaves the last
  // tick frozen at in_game=true — only the watchdog notices the feed died.
  const inGame = !!tick && tick.in_game && gsiActive
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
  const blind = inGame && !sensorOk && gank?.phase !== 'alert'
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
        {blind ? 'ไม่มีสัญญาณ' : G_LEVELS[lvl].label}
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

  // ── Kill / Announcer banner (ported from lite). The active pack's image
  // REPLACES the built-in kill card; falls back to the card when the pack maps
  // no image. Same 'gm-kill'/'gm-kill-exit' enter/exit CSS as the lite overlay.
  const packBannerFrame: React.CSSProperties = { position: 'relative', display: 'inline-block', lineHeight: 0, borderRadius: 16, overflow: 'hidden', boxShadow: '0 0 24px rgba(91,227,167,0.25)' }
  const killCardFrame: React.CSSProperties = { background: 'rgba(12,20,32,0.45)', border: '1px solid rgba(91,227,167,0.35)', borderRadius: 16, padding: '10px 18px 10px 10px', display: 'flex', alignItems: 'center', gap: 14, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: '0 0 24px rgba(91,227,167,0.2)' }
  const caption = (text: string, thai: string) => (
    <div style={{ textAlign: 'center' }}>
      {text && <div style={{ fontSize: 12, fontWeight: 700, color: C.txt, letterSpacing: 1, textTransform: 'uppercase', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{text}</div>}
      {thai && <div style={{ fontSize: 13, fontWeight: 600, color: C.ice, textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>{thai}</div>}
    </div>
  )
  const bannerUi = !s.killVisuals ? null : packBanner ? (
    <div className={packBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={packBannerFrame}>
      {packBanner.url && (
        <img src={packBanner.url} alt={packBanner.text} style={{ display: 'block', maxWidth: 420, maxHeight: 150, width: 'auto', height: 'auto', objectFit: 'contain' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      )}
      {packBanner.url && (packBanner.text || packBanner.thai) && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 6, textAlign: 'center', pointerEvents: 'none' }}>{caption(packBanner.text, packBanner.thai)}</div>
      )}
      {packBanner.clip && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', padding: packBanner.url ? '6px 10px 8px' : '10px 14px', background: 'rgba(12,14,20,0.82)', lineHeight: 1.25 }}>
          {!packBanner.url && (packBanner.text || packBanner.thai) && caption(packBanner.text, packBanner.thai)}
          <VoiceWave key={packBanner.clip} clip={packBanner.clip} />
        </div>
      )}
    </div>
  ) : killBanner ? (
    <div className={killBanner.phase === 'exit' ? 'gm-kill-exit' : 'gm-kill'} style={killCardFrame}>
      <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', background: 'rgba(18,20,28,0.9)', border: '2px solid rgba(91,227,167,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {killBanner.victim ? (
            <img src={`https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${killBanner.victim.replace(/^npc_dota_hero_/, '')}.png`} alt="" style={{ width: '110%', height: '110%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          ) : (
            <span style={{ fontSize: 22, opacity: 0.6 }}>💀</span>
          )}
        </div>
        <svg className="gm-kill-cross" viewBox="0 0 56 56" style={{ position: 'absolute', inset: 0, width: 56, height: 56, pointerEvents: 'none' }}>
          <line x1="12" y1="12" x2="44" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="44" y1="12" x2="12" y2="44" stroke="#ff4455" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: C.ok, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.8 }}>
          {killBanner.streak >= 3 ? (STREAK_LABELS[Math.min(killBanner.streak, 10)] ?? 'BEYOND GODLIKE') : 'ENEMY SLAIN'}
        </div>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.txt, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {killBanner.victim ? heroName(killBanner.victim) : 'ฆ่าได้สวยค่ะ!'}
        </div>
      </div>
      {t && (
        <div style={{ background: 'rgba(143,212,255,0.06)', border: '1px solid rgba(143,212,255,0.18)', borderRadius: 10, padding: '5px 16px', textAlign: 'center', flexShrink: 0 }}>
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
      )}
    </div>
  ) : null

  // ── Low-HP inline warning (ported). Rising-edge is computed in the parent.
  const lowHpUi = lowHp && t ? (
    <div style={{ ...glass(0.82), padding: '9px 22px', border: `1px solid ${C.warn}`, color: C.warn, fontWeight: 700, fontSize: 14, boxShadow: '0 0 24px rgba(255,207,107,0.35)' }}>
      ⚠ HP เหลือ {t.hp_percent}% — ถอยก่อนค่ะเพื่อน!
    </div>
  ) : null

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
  const showStandby = !inGame && (gsiActive || previewMode)
  const standbyUi = (
    <div style={{ ...glass(op), padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: gsiActive ? C.ok : C.bad }} />
      <div>
        <div style={{ fontWeight: 600, fontSize: 13 }}>G-Maiden</div>
        <div style={{ fontSize: 11, color: C.mut }}>GSI Signal</div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'transparent', pointerEvents: 'none' }}>
      {alert}
      {inGame && M('gmeter', gMeter)}
      {/* Consolidation (Boss 2026-07-20): the announcer banner already carries
          the transcript + waveform for the same event, so while it's up the
          voice toast would be a duplicate — banner wins, toast stays hidden. */}
      {toastUi && !packBanner && M('toast', toastUi)}
      {inGame && M('companion', companion)}

      {/* Ported announcer/persona visuals — each positionable from G-AnnStudio's Overlay Lab */}
      {inGame && bannerUi && M('banner', bannerUi)}
      {inGame && lowHpUi && M('lowhp', lowHpUi)}
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
            const verdict = a.recommend_buyback ? (a.urgency === 'Strong' ? 'ซื้อเกิดเลย!' : 'ควรซื้อเกิด') : 'รอเกิด'
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
