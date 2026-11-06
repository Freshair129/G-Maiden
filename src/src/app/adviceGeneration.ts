import { invoke } from '@tauri-apps/api/core'
import type { Advice, Settings } from './types'

export function validAdviceGeneration(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export async function isAdviceGenerationCurrent(advice: Pick<Advice, 'context_generation'>): Promise<boolean> {
  if (!validAdviceGeneration(advice.context_generation)) return false
  try {
    return await invoke<boolean>('is_advice_generation_current', { adviceGeneration: advice.context_generation }) === true
  } catch {
    return false
  }
}

/** Static preview text has no advice response token to reuse. Native queue
 * admission still checks that this generation survived the IPC round trip. */
export async function speakStaticAdvicePreview(): Promise<void> {
  const generation = await invoke<number>('get_master_context_generation')
  if (!validAdviceGeneration(generation)) return
  await invoke('preview_static_advice_voice', { voice: null, rate: null, adviceGeneration: generation })
}

export function advicePolicyKey(settings: Settings): string {
  return JSON.stringify([
    settings.masterEnabled, settings.masterBackend, settings.cloudContextOptIn,
    settings.masterAuth, settings.masterOllamaModel, settings.autoAdvice,
    settings.voiceEnabled, settings.voiceName, settings.voiceRate, settings.personaPreset,
  ])
}

export function adviceAllowedBySettings(advice: Advice, settings: Pick<Settings, 'masterEnabled' | 'masterBackend' | 'cloudContextOptIn'>): boolean {
  return settings.masterEnabled
    && (advice.backend === 'claude' || advice.backend === 'ollama')
    && (advice.backend !== 'claude' || settings.cloudContextOptIn)
    && (settings.masterBackend !== 'ollama' || advice.backend === 'ollama')
}
