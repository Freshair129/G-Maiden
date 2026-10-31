import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { FullOverlay } from '../overlay/FullOverlay'
import { DEFAULTS, type GameTick, type ReviveAdvice } from '../app/types'

const tick: GameTick = {
  in_game: true, clock_time: 600, game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  daytime: true, radiant_score: 12, dire_score: 9, gold: 1500, net_worth: 8200,
  gpm: 520, xpm: 610, kills: 4, deaths: 2, assists: 7, last_hits: 88, denies: 6,
  hero: 'npc_dota_hero_crystal_maiden', level: 9, alive: true, respawn_seconds: 0,
  hp_percent: 80, mana_percent: 42, kill_list_len: 0, last_victim_slot: -1,
}

function render(previewMode: boolean, gsiActive = false, statsEnabled = true, advice: ReviveAdvice | null = null) {
  return renderToStaticMarkup(<FullOverlay tick={tick}
    s={{ ...DEFAULTS, layout: { ...DEFAULTS.layout,
      score: { ...DEFAULTS.layout.score, enabled: statsEnabled },
      kda: { ...DEFAULTS.layout.kda, enabled: statsEnabled },
      gold: { ...DEFAULTS.layout.gold, enabled: statsEnabled },
    } }}
    gank={null} missingHeroes={new Set()} overlayAdvice={null} buyback={advice ? { advice, narrative: null } : null}
    volToast={null}
    gsiActive={gsiActive} gsiFresh={gsiActive || previewMode} gsiFreshness={gsiActive ? "fresh" : "unavailable"} gsiAgeMs={null} matchActive={gsiActive || previewMode} previewMode={previewMode} sensorOk={false} />)
}

describe('overlay preview and live-feed boundary', () => {
  it('shows an unknown buyback verdict neutrally while keeping factual affordability', () => {
    const advice = { recommend_buyback: null, urgency: 'Unknown', natural_respawn_remaining: 30,
      affordable: false, base_under_threat: null, allies_alive: null, next_respawn_if_buyback: 55, reason: 'ข้อมูลภัยคุกคามไม่พอ', death_episode: 1, request_id: 1 } satisfies ReviveAdvice
    const html = render(false, true, true, advice)
    expect(html).toContain('ยังประเมินไม่ได้')
    expect(html).toContain('เงินไม่พอซื้อเกิด')
    expect(html).not.toContain('>รอเกิด<')
  })
  it('shows scores, KDA and gold in preview while GSI is offline', () => {
    const html = render(true)
    expect(html).toContain('4/2/7')
    expect(html).toContain('1,500')
    expect(html).toContain('Score')
    expect(html).not.toContain('GSI Signal')
  })
  it('hides stale match stats after the real GSI feed disconnects', () => {
    expect(render(false)).not.toContain('4/2/7')
    expect(render(false)).not.toContain('1,500')
  })
  it('shows real stats when the feed is live', () => {
    expect(render(false, true)).toContain('4/2/7')
  })
  it('honors the same module visibility controls in preview and live mode', () => {
    for (const html of [render(true, false, false), render(false, true, false)]) {
      expect(html).not.toContain('data-overlay-module="score"')
      expect(html).not.toContain('data-overlay-module="kda"')
      expect(html).not.toContain('data-overlay-module="gold"')
    }
  })
})
