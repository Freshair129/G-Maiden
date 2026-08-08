import { describe, expect, it } from 'vitest'
import { deriveLandingState, type QueueResponse } from './gmadAccess'

const base: QueueResponse = {
  state: 'waiting',
  terms: { state: 'accepted', document_id: 't', version: '1.0.0', effective_at: null },
  channel: 'gated',
  download_url: null,
  batch_label: null,
  release_id: null,
}

describe('deriveLandingState', () => {
  it('terms required wins over everything', () => {
    expect(deriveLandingState({ ...base, state: 'available', terms: { ...base.terms!, state: 'required' } }))
      .toEqual({ kind: 'signed_in_no_terms', termsVersion: '1.0.0' })
  })
  it('terms outdated blocks download even when a grant is available', () => {
    expect(deriveLandingState({ ...base, state: 'available', terms: { ...base.terms!, state: 'outdated' } }))
      .toEqual({ kind: 'terms_outdated', termsVersion: '1.0.0' })
  })
  it('accepted terms + waiting = queued', () => {
    expect(deriveLandingState(base)).toEqual({ kind: 'queued' })
  })
  it('available maps to granted with the gated channel by default', () => {
    expect(deriveLandingState({ ...base, state: 'available', release_id: 'v0.13.2' }))
      .toEqual({ kind: 'granted', channel: 'gated', downloadUrl: null, releaseId: 'v0.13.2' })
  })
  it('available with github channel carries the release URL', () => {
    const url = 'https://github.com/Freshair129/G-Maiden/releases/latest'
    expect(deriveLandingState({ ...base, state: 'available', channel: 'github', download_url: url }))
      .toEqual({ kind: 'granted', channel: 'github', downloadUrl: url, releaseId: null })
  })
  it('paused and revoked map through', () => {
    expect(deriveLandingState({ ...base, state: 'paused' })).toEqual({ kind: 'paused' })
    expect(deriveLandingState({ ...base, state: 'revoked' })).toEqual({ kind: 'revoked' })
  })
  it('unknown/unavailable states fall back to unavailable', () => {
    expect(deriveLandingState({ ...base, state: 'not_registered' })).toEqual({ kind: 'unavailable' })
    expect(deriveLandingState({ ...base, terms: { ...base.terms!, state: 'unavailable' } }))
      .toEqual({ kind: 'unavailable' })
  })
})
