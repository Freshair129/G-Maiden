import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULTS } from '../app/types'
import { FullOverlay } from './FullOverlay'

function renderOverlay({
  missingHeroes = new Set<string>(),
  gank = null as null | { phase: 'alert'; heroes: string[]; probability: number },
  sensorOk = true,
}: {
  missingHeroes?: Set<string>
  gank?: null | { phase: 'alert'; heroes: string[]; probability: number }
  sensorOk?: boolean
} = {}) {
  return renderToStaticMarkup(
    <FullOverlay
      tick={null}
      s={{ ...DEFAULTS, gankVisuals: true }}
      gank={gank}
      missingHeroes={missingHeroes}
      warningStatus={{ heroes: [], visible_heroes: [], observations: [], roster_known: 5, ready: true, reason: 'confirmed' }}
      overlayAdvice={null}
      buyback={null}
      volToast={null}
      gsiActive
      gsiFresh
      gsiFreshness="fresh"
      gsiAgeMs={0}
      matchActive
      previewMode={false}
      sensorOk={sensorOk}
    />,
  )
}

describe('FullOverlay missing-hero chip and Gank Meter', () => {
  it('renders the currently missing hero chip even while the Gank Meter is alerting', () => {
    const html = renderOverlay({
      missingHeroes: new Set(['npc_dota_hero_axe', 'npc_dota_hero_pudge']),
      gank: { phase: 'alert', heroes: ['npc_dota_hero_axe'], probability: 0.9 },
    })

    expect(html).toContain('data-overlay-module="missing"')
    expect(html).toContain('หาย: Axe, Pudge')
  })

  it('keeps missing heroes at the "not visible" level without a G-Signal alert', () => {
    const html = renderOverlay({ missingHeroes: new Set(['npc_dota_hero_axe', 'npc_dota_hero_lina', 'npc_dota_hero_pudge']) })
    expect(html).toContain('มองไม่เห็น')
    expect(html).not.toContain('อันตราย')
  })

  it('renders the no-coverage state instead of a safe Gank Meter reading', () => {
    const html = renderOverlay({ sensorOk: false })

    expect(html).toContain('ข้อมูลยังไม่พร้อม')
    expect(html).not.toContain('ยังไม่มีสัญญาณเสี่ยง')
  })
})
