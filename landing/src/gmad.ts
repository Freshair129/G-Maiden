import { useCallback, useState } from 'react'
import { landingSupabase } from './beta'
import { canInvokeAuthenticatedQueue, canRequestDownload, normaliseQueueState } from './gmadContract'

export type GmadQueueState = 'idle' | 'checking' | 'signed_out' | 'not_registered' | 'waiting' | 'available' | 'paused' | 'revoked' | 'error'

type QueueResponse = {
  state: Exclude<GmadQueueState, 'idle' | 'checking' | 'error'>
  batch_label?: string | null
  release_id?: string | null
}

function message(error: unknown) {
  return (error as { message?: string })?.message || 'ไม่สามารถตรวจสอบคิว GMAD ได้ ลองใหม่อีกครั้ง'
}

export function useGmadAccess() {
  const [state, setState] = useState<GmadQueueState>('idle')
  const [batchLabel, setBatchLabel] = useState('')
  const [error, setError] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [diagnosticsOptIn, setDiagnosticsOptIn] = useState(false)
  const [marketingOptIn, setMarketingOptIn] = useState(false)
  const [postMatchOptIn, setPostMatchOptIn] = useState(false)

  const check = useCallback(async () => {
    setState('checking')
    setError('')
    const { data: { session }, error: sessionError } = await landingSupabase.auth.getSession()
    if (sessionError || !canInvokeAuthenticatedQueue(session?.access_token)) {
      setState('signed_out')
      return
    }
    const { data, error: invokeError } = await landingSupabase.functions.invoke<QueueResponse>('check-gmad-queue', { body: {} })
    if (invokeError || !data) {
      setState('error')
      setError(message(invokeError))
      return
    }
    setState(normaliseQueueState(data.state) as GmadQueueState)
    setBatchLabel(data.batch_label ?? '')
  }, [])

  const download = useCallback(async () => {
    setError('')
    if (!canRequestDownload({ signedIn: true, serverState: normaliseQueueState(state), termsAccepted, ageConfirmed })) {
      setError('กรุณายอมรับ Terms และยืนยันว่ามีอายุอย่างน้อย 20 ปี'); return
    }
    const { error: acceptanceError } = await landingSupabase.functions.invoke('accept-closed-beta-terms', { body: {
      required_terms_accepted: true, age_requirement_confirmed: true,
      diagnostics_opt_in: diagnosticsOptIn, marketing_opt_in: marketingOptIn,
      post_match_opt_in: postMatchOptIn,
    } })
    if (acceptanceError) { setError(message(acceptanceError)); return }
    const { data, error: invokeError } = await landingSupabase.functions.invoke<{ url?: string }>('request-gmad-download', { body: {} })
    if (invokeError || !data?.url) {
      setError(message(invokeError) || 'GMAD ยังไม่พร้อมสำหรับบัญชีนี้')
      return
    }
    window.location.assign(data.url)
  }, [ageConfirmed, diagnosticsOptIn, marketingOptIn, postMatchOptIn, state, termsAccepted])

  return { state, batchLabel, error, check, download, termsAccepted, setTermsAccepted,
    ageConfirmed, setAgeConfirmed, diagnosticsOptIn, setDiagnosticsOptIn,
    marketingOptIn, setMarketingOptIn, postMatchOptIn, setPostMatchOptIn }
}
