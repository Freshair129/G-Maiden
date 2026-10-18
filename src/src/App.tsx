import React from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { StartupSettingsProvider } from './app/settings'
import { useStartupSettings } from './app/settingsContext'

const CommandDeck = React.lazy(() => import('./CommandDeck'))
const Overlay = React.lazy(() => import('./app/Overlay').then(({ Overlay }) => ({ default: Overlay })))
const Control = React.lazy(() => import('./app/Control').then(({ Control }) => ({ default: Control })))

export { Control }
export type { GameTick, GsiFreshness, Settings, GankState, ReviveAdvice, SettingsCat, BuybackUrgency, Sensitivity } from './app/types'

const HydratedOverlay: React.FC = () => {
  const { settings } = useStartupSettings()
  return <Overlay initialSettings={settings} />
}

export const App: React.FC = () => {
  // getCurrentWindow() throws outside a Tauri runtime (e.g. plain-browser dev
  // preview). Default to the control window so the deck still renders.
  let label = 'control'
  try { label = getCurrentWindow().label } catch { /* not running under Tauri */ }
  // Overlay window keeps the original transparent CV/voice overlay. The control
  // window now renders the ported command-deck shell (CR-002 Phase 1).
  // The real settings panel (legacy Control) mounts inside the deck's Settings
  // tab — passed as a RENDER PROP (CR-013 W2) so CommandDeck can request just
  // one category at a time (its iOS-style split view) without importing App
  // (no module cycle) and without Control ever needing to know about tabs/rails.
  if (label === 'overlay') {
    return (
      <StartupSettingsProvider syncNative={false}>
        <React.Suspense fallback={null}>
          <HydratedOverlay />
        </React.Suspense>
      </StartupSettingsProvider>
    )
  }
  const deck = (
    <React.Suspense fallback={null}>
      <CommandDeck renderSettings={(cat) => (
        <React.Suspense fallback={null}>
          <Control category={cat} />
        </React.Suspense>
      )} />
    </React.Suspense>
  )
  return (
    <StartupSettingsProvider>
      {deck}
    </StartupSettingsProvider>
  )
}
