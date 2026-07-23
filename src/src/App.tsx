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
  return label === 'overlay' ? <Overlay /> : <GmadFirstRunGate><CommandDeck renderSettings={(cat) => <Control category={cat} />} /></GmadFirstRunGate>
}
