import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULTS, type Settings } from '../app/types'
import { FullOverlay } from './FullOverlay'
import { OVERLAY_PREVIEW_TICK } from './preview'

const chips = ['clock', 'score', 'kda', 'gold', 'gpm', 'nw', 'companion'] as const

function renderOverlay(s: Settings = DEFAULTS) {
  return renderToStaticMarkup(<FullOverlay tick={OVERLAY_PREVIEW_TICK} s={s} gank={null}
    missingHeroes={new Set()} overlayAdvice={null} buyback={null} volToast={null}
    gsiActive gsiFresh gsiFreshness="fresh" gsiAgeMs={0} matchActive
    previewMode={false} sensorOk={false} />)
}

describe('enabled in-game overlay chips', () => {
  it('renders every enabled stat and Maiden chip despite false legacy stat flags and unavailable CV', () => {
    const html = renderOverlay()
    for (const id of chips) expect(html).toContain(`data-overlay-module="${id}"`)
    expect(html).toContain('10:00')
    expect(html).toContain('4/2/7')
    expect(html).toContain('Maiden')
  })

  it.each(chips)('honors the layout toggle for %s independently', (id) => {
    const html = renderOverlay({ ...DEFAULTS, layout: { ...DEFAULTS.layout,
      [id]: { ...DEFAULTS.layout[id], enabled: false },
    } })
    expect(html).not.toContain(`data-overlay-module="${id}"`)
    for (const other of chips.filter(chip => chip !== id)) {
      expect(html).toContain(`data-overlay-module="${other}"`)
    }
  })
})
