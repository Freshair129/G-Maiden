import {test} from 'node:test'
import assert from 'node:assert/strict'
import {canonicalPortrait} from './import.mjs'
const heroes = ['crystal_maiden', 'drow_ranger', 'axe']
test('cosmetics and personas resolve to the same canonical hero', () => {
  assert.deepEqual(canonicalPortrait('npc_dota_hero_drow_ranger_alt1_png', heroes), {label: 'drow_ranger', variant: 'alt1'})
  assert.deepEqual(canonicalPortrait('npc_dota_hero_crystal_maiden_persona1_png', heroes), {label: 'crystal_maiden', variant: 'persona1'})
  assert.deepEqual(canonicalPortrait('npc_dota_hero_axe_png', heroes), {label: 'axe', variant: 'default'})
})
test('unknown labels, screenshot names and arbitrary suffixes cannot become templates', () => {
  for (const stem of ['20261019153246_1', 'npc_dota_hero_fake_png', 'npc_dota_hero_axe_screenshot_png', 'npc_dota_hero_axe_alt1evil_png']) {
    assert.equal(canonicalPortrait(stem, heroes), null)
  }
})
