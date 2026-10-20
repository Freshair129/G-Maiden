import { createContext, useContext, type Dispatch, type SetStateAction } from 'react'
import type { Settings } from './types'

export interface StartupSettingsContextValue {
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
  clearLegacyMasterApiKey: () => void
}

export const StartupSettingsContext = createContext<StartupSettingsContextValue | null>(null)

export function useStartupSettings(): StartupSettingsContextValue {
  const value = useContext(StartupSettingsContext)
  if (!value) throw new Error('useStartupSettings must be used inside StartupSettingsProvider')
  return value
}
