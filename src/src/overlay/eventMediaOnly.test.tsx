import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FullOverlay } from './FullOverlay'
import { DEFAULTS } from '../app/types'

it('never fabricates legacy event cards or captions when no GANN visual was admitted', () => {
  const legacy = {toast:{event:'kill',text:'LEGACY_PERSONA'},killBanner:{phase:'show',kills:1,streak:3,victim:null},packBanner:{phase:'show',url:null,text:'LEGACY_CAPTION',thai:'',clip:'legacy.wav'},lowHp:true}
  const html = renderToStaticMarkup(<FullOverlay tick={null} s={DEFAULTS} gank={null}
    missingHeroes={new Set()} warningStatus={null} overlayAdvice={null} buyback={null}
    {...legacy} volToast={null} gsiActive={true} gsiFresh={true}
    gsiFreshness="fresh" gsiAgeMs={0} matchActive={true} previewMode={true} sensorOk={true} />)
  expect(html).not.toContain('LEGACY_CAPTION')
  expect(html).not.toContain('LEGACY_PERSONA')
  expect(html).not.toContain('KILLING SPREE')
})
