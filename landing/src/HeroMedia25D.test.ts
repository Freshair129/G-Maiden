import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import HeroMedia25D, {
  HERO_CHARACTER_COMPONENT_ORDER,
  HERO_CHARACTER_PIVOTS,
  HERO_SCENE_LAYER_ORDER,
  sampleHeroRigMotion,
  sampleHeroWind,
} from './HeroMedia25D'

describe('sampleHeroWind', () => {
  it('keeps the wind sample inside the authored motion envelope', () => {
    const samples = [0, 1000, 2500, 5000, 9000, 14000].map(sampleHeroWind)

    for (const sample of samples) {
      expect(sample.x).toBeGreaterThanOrEqual(-10)
      expect(sample.x).toBeLessThanOrEqual(10)
      expect(sample.y).toBeGreaterThanOrEqual(-6)
      expect(sample.y).toBeLessThanOrEqual(6)
      expect(sample.turn).toBeGreaterThanOrEqual(-2.2)
      expect(sample.turn).toBeLessThanOrEqual(2.2)
      expect(sample.shimmer).toBeGreaterThanOrEqual(0)
      expect(sample.shimmer).toBeLessThanOrEqual(1)
      expect(sample.frost).toBeGreaterThanOrEqual(0)
      expect(sample.frost).toBeLessThanOrEqual(1)
    }
  })

  it('changes the wind sample over time so the hero layers do not freeze in place', () => {
    const early = sampleHeroWind(500)
    const later = sampleHeroWind(4500)

    expect(early.x).not.toBe(later.x)
    expect(early.y).not.toBe(later.y)
    expect(early.turn).not.toBe(later.turn)
  })
})

describe('sampleHeroRigMotion', () => {
  it('keeps phase-2 localized motion channels inside the authored envelope', () => {
    const samples = [0, 1100, 2800, 5400, 9600, 15100].map(sampleHeroRigMotion)

    for (const sample of samples) {
      expect(sample.headTurn).toBeGreaterThanOrEqual(-1.3)
      expect(sample.headTurn).toBeLessThanOrEqual(1.3)
      expect(sample.headLift).toBeGreaterThanOrEqual(-3)
      expect(sample.headLift).toBeLessThanOrEqual(3)
      expect(sample.hairFrontSway).toBeGreaterThanOrEqual(-5.3)
      expect(sample.hairFrontSway).toBeLessThanOrEqual(5.3)
      expect(sample.hairTailLeftTurn).toBeGreaterThanOrEqual(-4.7)
      expect(sample.hairTailLeftTurn).toBeLessThanOrEqual(4.7)
      expect(sample.hairTailRightTurn).toBeGreaterThanOrEqual(-4.3)
      expect(sample.hairTailRightTurn).toBeLessThanOrEqual(4.3)
      expect(sample.armLeftTurn).toBeGreaterThanOrEqual(-1.7)
      expect(sample.armLeftTurn).toBeLessThanOrEqual(1.7)
      expect(sample.armRightTurn).toBeGreaterThanOrEqual(-1.5)
      expect(sample.armRightTurn).toBeLessThanOrEqual(1.5)
      expect(sample.clothFrontSway).toBeGreaterThanOrEqual(-4.9)
      expect(sample.clothFrontSway).toBeLessThanOrEqual(4.9)
      expect(sample.clothHemLift).toBeGreaterThanOrEqual(0)
      expect(sample.clothHemLift).toBeLessThanOrEqual(4.9)
      expect(sample.crystalFloatX).toBeGreaterThanOrEqual(-3.3)
      expect(sample.crystalFloatX).toBeLessThanOrEqual(3.3)
      expect(sample.crystalFloatY).toBeGreaterThanOrEqual(-4.3)
      expect(sample.crystalFloatY).toBeLessThanOrEqual(4.3)
      expect(sample.auraPulse).toBeGreaterThanOrEqual(0)
      expect(sample.auraPulse).toBeLessThanOrEqual(1)
    }
  })

  it('changes localized channels over time so separate hero pieces do not move in lockstep', () => {
    const early = sampleHeroRigMotion(700)
    const later = sampleHeroRigMotion(4700)

    expect(early.headTurn).not.toBe(later.headTurn)
    expect(early.hairTailLeftTurn).not.toBe(later.hairTailLeftTurn)
    expect(early.clothFrontSway).not.toBe(later.clothFrontSway)
    expect(early.crystalFloatY).not.toBe(later.crystalFloatY)
  })
})

describe('hero decomposition scaffold', () => {
  it('keeps the approved scene-depth order from farthest to nearest', () => {
    expect(HERO_SCENE_LAYER_ORDER).toEqual([
      'background-backdrop',
      'mid-depth-b',
      'mid-depth-a',
      'cave-wall-left',
      'cave-wall-right',
      'character-layer',
      'atmosphere-overlay',
    ])
  })

  it('keeps the character component groups needed for later rig-style animation', () => {
    expect(HERO_CHARACTER_COMPONENT_ORDER).toEqual([
      'character-core',
      'character-hair-rig',
      'character-arm-rig-left',
      'character-arm-rig-right',
      'character-cloth-rig',
      'character-held-object',
    ])
  })

  it('exposes the primary and secondary pivots for future motion passes', () => {
    expect(HERO_CHARACTER_PIVOTS).toEqual([
      'root',
      'neck',
      'head',
      'shoulder_left',
      'elbow_left',
      'wrist_left',
      'shoulder_right',
      'elbow_right',
      'wrist_right',
      'chest',
      'pelvis',
      'hair_root_front',
      'hair_root_side_left',
      'hair_root_side_right',
      'cape_root_left',
      'cape_root_right',
      'object_anchor',
    ])
  })

  it('renders named character nodes so later motion can target pieces without rebuilding the hero tree', () => {
    const markup = renderToStaticMarkup(createElement(HeroMedia25D))
    const nodeCount = (markup.match(/data-node="/g) ?? []).length
    const componentCount = (markup.match(/data-component="/g) ?? []).length

    expect(componentCount).toBe(HERO_CHARACTER_COMPONENT_ORDER.length)
    expect(nodeCount).toBe(33)
    expect(markup).toContain('data-node="hair-tail-left"')
    expect(markup).toContain('data-node="left-forearm"')
    expect(markup).toContain('data-node="collar-drape"')
    expect(markup).toContain('data-node="held-crystal-glow"')
  })
})
