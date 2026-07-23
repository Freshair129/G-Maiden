import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import HeroMedia25D, { sampleHeroWind } from './HeroMedia25D'

describe('HeroMedia25D', () => {
  it('renders the approved desktop/mobile hero art sources', () => {
    const markup = renderToStaticMarkup(createElement(HeroMedia25D))

    expect(markup).toContain('srcSet="/assets/hero/gmaiden-2-5d-hero-mobile-v1.webp"')
    expect(markup).toContain('src="/assets/hero/gmaiden-2-5d-hero-desktop-v1.webp"')
    expect(markup).toContain('class="hero-scene-picture hero-scene-picture-background-backdrop"')
  })

  it('renders the approved scene-depth and character decomposition scaffold', () => {
    const markup = renderToStaticMarkup(createElement(HeroMedia25D))

    expect(markup).toContain('class="hero-scene-layer hero-scene-layer-cave-wall-left"')
    expect(markup).toContain('class="hero-scene-layer hero-scene-layer-cave-wall-right"')
    expect(markup).toContain('class="hero-character-component hero-character-hair-rig"')
    expect(markup).toContain('class="hero-character-component hero-character-cloth-rig"')
    expect(markup).toContain('data-pivot="shoulder_left"')
    expect(markup).toContain('data-pivot="object_anchor"')
  })

  it('keeps the frost atmosphere and crystal aura layers around the hero scene', () => {
    const markup = renderToStaticMarkup(createElement(HeroMedia25D))

    expect(markup).toContain('class="hero-media-frost-plume hero-media-frost-plume-a"')
    expect(markup).toContain('class="hero-media-frost-trace hero-media-frost-trace-b"')
    expect(markup).toContain('class="hero-character-held-crystal-aura hero-character-held-crystal-aura-a"')
  })

  it('exports a deterministic wind sampler with evolving hair motion', () => {
    const first = sampleHeroWind(1_000, 0.25, -0.1)
    const second = sampleHeroWind(1_600, 0.25, -0.1)

    expect(first['--hero-media-scale']).toBe(sampleHeroWind(1_000, 0.25, -0.1)['--hero-media-scale'])
    expect(first['--hero-hair-front-sway']).not.toBe(second['--hero-hair-front-sway'])
    expect(first['--hero-object-turn']).not.toBe(second['--hero-object-turn'])
  })
})
