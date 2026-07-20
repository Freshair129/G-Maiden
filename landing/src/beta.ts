import { useCallback, useEffect, useState } from 'react'
import { createClient, type Session, type User } from '@supabase/supabase-js'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://wsseitulmcgnolgsrxgh.supabase.co'
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable__vr0-aNdudlq3aPbH8OMXw_0rr0JScZ'

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
})

type BetaStatus = 'loading' | 'signed-out' | 'enrolling' | 'registered' | 'error'

type ProfileRow = {
  gid_code: string | null
  generation: 'F' | 'B' | 'P'
}

function errorMessage(error: unknown) {
  const message = (error as { message?: string })?.message
  return message || 'ไม่สามารถเชื่อมต่อระบบบัญชีได้ กรุณาลองอีกครั้ง'
}

async function loadGid(user: User): Promise<ProfileRow> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('gid_code, generation')
    .eq('id', user.id)
    .single<ProfileRow>()

  if (profileError) throw profileError
  if (profile.gid_code) return profile

  const { data: minted, error: mintError } = await supabase.functions.invoke<{
    gid_code?: string
  }>('mint-gid')

  if (mintError) throw mintError
  if (!minted?.gid_code) throw new Error('ระบบยังไม่สามารถออก GID ได้')

  return { ...profile, gid_code: minted.gid_code }
}

export function useBetaEnrollment() {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<BetaStatus>('loading')
  const [gid, setGid] = useState('')
  const [generation, setGeneration] = useState<ProfileRow['generation'] | null>(null)
  const [error, setError] = useState('')

  const syncEnrollment = useCallback(async (user: User) => {
    setStatus('enrolling')
    setError('')

    try {
      const profile = await loadGid(user)
      const { error: insertError } = await supabase
        .from('closed_beta_enrollments')
        .insert({ user_id: user.id, source: 'landing' })

      if (insertError && insertError.code !== '23505') throw insertError

      const { data: enrollment, error: enrollmentError } = await supabase
        .from('closed_beta_enrollments')
        .select('status')
        .eq('user_id', user.id)
        .single<{ status: string }>()

      if (enrollmentError) throw enrollmentError
      if (!['registered', 'invited'].includes(enrollment.status)) {
        throw new Error('บัญชีนี้ไม่อยู่ในสถานะลงทะเบียน Closed Beta')
      }

      setGid(profile.gid_code ?? '')
      setGeneration(profile.generation)
      setStatus('registered')
    } catch (caught) {
      setError(errorMessage(caught))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    let active = true

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) {
        setError(errorMessage(sessionError))
        setStatus('error')
        return
      }

      setSession(data.session)
      if (data.session?.user) void syncEnrollment(data.session.user)
      else setStatus('signed-out')
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      window.setTimeout(() => {
        if (!active) return
        if (nextSession?.user) void syncEnrollment(nextSession.user)
        else {
          setGid('')
          setGeneration(null)
          setStatus('signed-out')
        }
      }, 0)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [syncEnrollment])

  const register = useCallback(async () => {
    if (session?.user) {
      await syncEnrollment(session.user)
      return
    }

    setStatus('loading')
    setError('')
    const redirectTo = `${window.location.origin}${window.location.pathname}`
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })

    if (signInError) {
      setError(errorMessage(signInError))
      setStatus('error')
    }
  }, [session, syncEnrollment])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return {
    status,
    gid,
    generation,
    email: session?.user.email ?? '',
    error,
    register,
    signOut,
  }
}
