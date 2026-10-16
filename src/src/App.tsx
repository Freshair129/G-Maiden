import React from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { StartupSettingsProvider } from './app/settings'
import { useStartupSettings } from './app/settingsContext'
import GmadFirstRunGate from './GmadFirstRunGate'

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
  // The Closed Beta gate (sign-in + Terms + entitlement) is RELEASE-ONLY. A dev
  // build would otherwise be unusable for local UI work: the gate needs network,
  // a current Terms acceptance and an active grant on every launch, and while it
  // is up the deck never mounts — which also means no `data-tauri-drag-region`
  // exists, so the window cannot even be moved.
  // MIRRORED IN RUST: `runtime.rs` seeds GMAD_ENTITLED from the same
  // cfg!(debug_assertions). Change one without the other and dev gets a deck
  // wired to a locked runtime — GSI ingest, DXGI capture and the overlay all
  // stay off (capture.rs, gsi.rs, lib.rs check `gmad_entitled()`).
  return (
    <StartupSettingsProvider>
      {import.meta.env.DEV ? deck : <GmadFirstRunGate>{deck}</GmadFirstRunGate>}
    </StartupSettingsProvider>
  )
}
