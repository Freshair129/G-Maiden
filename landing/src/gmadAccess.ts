import { useCallback, useEffect, useState } from 'react'
import { landingSupabase } from './beta'

export type QueueResponse = {
  state: 'waiting' | 'available' | 'paused' | 'revoked' | 'not_registered' | 'signed_out'
  terms?: {
    state: 'accepted' | 'required' | 'outdated' | 'unavailable'
    document_id: string | null
    version: string | null
    effective_at: string | null
  }
  channel?: 'github' | 'gated'
  download_url?: string | null
  batch_label?: string | null
  release_id?: string | null
}

export type LandingAccessState =
  | { kind: 'signed_in_no_terms'; termsVersion: string | null }
  | { kind: 'terms_outdated'; termsVersion: string | null }
  | { kind: 'queued' }
  | { kind: 'granted'; channel: 'github' | 'gated'; downloadUrl: string | null; releaseId: string | null }
  | { kind: 'paused' }
  | { kind: 'revoked' }
  | { kind: 'unavailable' }

export type TermsOptIns = {
  diagnostics_opt_in?: boolean
  marketing_opt_in?: boolean
  post_match_opt_in?: boolean
}

export function deriveLandingState(q: QueueResponse): LandingAccessState {
  if (q.terms?.state === 'required') return { kind: 'signed_in_no_terms', termsVersion: q.terms.version ?? null }
  if (q.terms?.state === 'outdated') return { kind: 'terms_outdated', termsVersion: q.terms.version ?? null }
  if (q.terms?.state === 'unavailable') return { kind: 'unavailable' }
  if (q.state === 'available') {
    return {
      kind: 'granted',
      channel: q.channel ?? 'gated',
      downloadUrl: q.download_url ?? null,
      releaseId: q.release_id ?? null,
    }
  }
  if (q.state === 'paused') return { kind: 'paused' }
  if (q.state === 'revoked') return { kind: 'revoked' }
  if (q.state === 'waiting') return { kind: 'queued' }
  return { kind: 'unavailable' }
}

function toMessage(error: unknown): string {
  return (error as { message?: string })?.message || 'ไม่สามารถเชื่อมต่อระบบได้ กรุณาลองอีกครั้ง'
}

export function useGmadAccess(enabled: boolean) {
  const [access, setAccess] = useState<LandingAccessState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await landingSupabase.functions.invoke<QueueResponse>(
        'check-gmad-queue',
        { body: {} },
      )
      if (fnError) throw fnError
      if (!data) throw new Error('empty response')
      setAccess(deriveLandingState(data))
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    if (enabled) void refresh()
    else setAccess(null)
  }, [enabled, refresh])

  const acceptTerms = useCallback(async (optIns: TermsOptIns) => {
    setBusy(true)
    setError('')
    try {
      const { error: fnError } = await landingSupabase.functions.invoke('accept-closed-beta-terms', {
        body: { required_terms_accepted: true, age_requirement_confirmed: true, ...optIns },
      })
      if (fnError) throw fnError
      await refresh()
    } catch (caught) {
      setError(toMessage(caught))
      setBusy(false)
    }
  }, [refresh])

  const requestDownload = useCallback(async () => {
    if (access?.kind !== 'granted') return
    if (access.channel === 'github' && access.downloadUrl) {
      window.open(access.downloadUrl, '_blank', 'noopener')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error: fnError } = await landingSupabase.functions.invoke<{ url?: string }>(
        'request-gmad-download',
        { body: {} },
      )
      if (fnError) throw fnError
      if (!data?.url) throw new Error('download URL was not issued')
      window.open(data.url, '_blank', 'noopener')
    } catch (caught) {
      setError(toMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [access])

  return { access, busy, error, refresh, acceptTerms, requestDownload }
}
