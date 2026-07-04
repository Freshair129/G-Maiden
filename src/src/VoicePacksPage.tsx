// Voice-tab wrapper — chooses between the user-facing inventory (default)
// and the deep pack editor (AudioSettings). Toggle button lives on either
// side; the two views share the same Rust backend so switching is free.

import { useState } from "react";
import VoiceInventory from "./VoiceInventory";
import AudioSettings from "./AudioSettings";

type Mode = "inventory" | "editor";

export default function VoicePacksPage() {
  const [mode, setMode] = useState<Mode>("inventory");
  return mode === "inventory" ? (
    <VoiceInventory onOpenEditor={() => setMode("editor")} />
  ) : (
    <AudioSettings onBack={() => setMode("inventory")} />
  );
}
