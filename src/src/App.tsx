import React from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import CommandDeck from './CommandDeck'
import { Overlay } from './app/Overlay'
import { Control } from './app/Control'
import GmadFirstRunGate from './GmadFirstRunGate'

export { Control }
export type { GameTick, Settings, GankState, ReviveAdvice, SettingsCat, BuybackUrgency, Sensitivity } from './app/types'

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
  if (label === 'overlay') return <Overlay />
  const deck = <CommandDeck renderSettings={(cat) => <Control category={cat} />} />
  // The Closed Beta gate (sign-in + Terms + entitlement) is RELEASE-ONLY. A dev
  // build would otherwise be unusable for local UI work: the gate needs network,
  // a current Terms acceptance and an active grant on every launch, and while it
  // is up the deck never mounts — which also means no `data-tauri-drag-region`
  // exists, so the window cannot even be moved.
  // MIRRORED IN RUST: `runtime.rs` seeds GMAD_ENTITLED from the same
  // cfg!(debug_assertions). Change one without the other and dev gets a deck
  // wired to a locked runtime — GSI ingest, DXGI capture and the overlay all
  // stay off (capture.rs, gsi.rs, lib.rs check `gmad_entitled()`).
  return import.meta.env.DEV ? deck : <GmadFirstRunGate>{deck}</GmadFirstRunGate>
}
