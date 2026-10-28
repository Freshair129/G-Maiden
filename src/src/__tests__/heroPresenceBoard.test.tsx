import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import { DEFAULTS } from '../app/types'
import { FALLBACK, type CompanionData } from '../companion'
import { CvHeroesPage } from '../CompanionPages'

let data: CompanionData
vi.mock('../companion', async (importOriginal) => ({
  ...await importOriginal<typeof import('../companion')>(),
  useCompanionData: () => ({ data }),
  useMinimapFrame: () => null,
}))
vi.mock('../app/settingsContext', () => ({ useStartupSettings: () => ({ settings: DEFAULTS }) }))

function boardData() {
  data = { ...FALLBACK, heroCv: { ...FALLBACK.heroCv, phase: 'live',
    roster: { radiant: ['crystal_maiden', null, null, null, null], dire: ['axe', null, null, null, null], complete: false, recognizer_active: true, templates_loading: false },
    health: { backend: 'dxgi', healthy: true, classifier: true, throttled: false, frameAgeMs: 0 },
    minimap: { region: { x: 0, y: 0, side: 100 }, icon: 10, candidates: [], count: 1, classifier: true,
      detections: [{ name: 'axe', label: 1, score: 0.99, x: 10, y: 10 }] },
  } }
}

it('does not show confirmed visibility from a raw minimap classification', () => {
  boardData()
  expect(renderToStaticMarkup(<CvHeroesPage />)).not.toContain('title="ตรวจพบฮีโร่นี้บน minimap"')
})

it('shows current Sentry-confirmed visibility independently of the throttled debug feed', () => {
  boardData()
  Object.assign(data.heroCv, { visible: ['axe'], warningReady: true, minimap: null })
  expect(renderToStaticMarkup(<CvHeroesPage />)).toContain('title="ตรวจพบฮีโร่นี้บน minimap"')
})
