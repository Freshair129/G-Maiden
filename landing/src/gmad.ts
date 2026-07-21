import { useCallback, useState } from 'react'
import { landingSupabase } from './beta'

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

  const check = useCallback(async (gid: string) => {
    setState('checking')
    setError('')
    const { data, error: invokeError } = await landingSupabase.functions.invoke<QueueResponse>('check-gmad-queue', { body: { gid } })
    if (invokeError || !data) {
      setState('error')
      setError(message(invokeError))
      return
    }
    setState(data.state)
    setBatchLabel(data.batch_label ?? '')
  }, [])

  const download = useCallback(async (gid: string) => {
    setError('')
    if (!termsAccepted) { setError('กรุณายอมรับ Closed Beta Terms ก่อนดาวน์โหลด'); return }
    const { error: acceptanceError } = await landingSupabase.functions.invoke('accept-closed-beta-terms', { body: { required_terms_accepted: true } })
    if (acceptanceError) { setError(message(acceptanceError)); return }
    const { data, error: invokeError } = await landingSupabase.functions.invoke<{ url?: string }>('request-gmad-download', { body: { gid } })
    if (invokeError || !data?.url) {
      setError(message(invokeError) || 'GMAD ยังไม่พร้อมสำหรับบัญชีนี้')
      return
    }
    window.location.assign(data.url)
  }, [termsAccepted])

  return { state, batchLabel, error, check, download, termsAccepted, setTermsAccepted }
}
