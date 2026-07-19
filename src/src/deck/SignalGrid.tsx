import { invoke } from "@tauri-apps/api/core";
import type { CompanionData } from "../companion";
import type { ContextMenuController, ContextMenuEntry } from "../ContextMenu";

/** CR011-P4b-01: G-Signal sensitivity (Low/Med/High). `set_cv_signal_sensitivity`
 *  IS wired in main.rs (`level: signal::Sensitivity`, serde `rename_all =
 *  "lowercase"`), so the menu really can change it — verified by grep before
 *  wiring, per the task instruction. The legacy Control panel (App.tsx) stores
 *  the current choice under `localStorage['gm-settings'].signalSensitivity`
 *  ('low'|'med'|'high', default 'med') and pushes it to this exact command on
 *  change; there is no get_* query command, so this is the only place to read
 *  the current value from — a read (AND write-back, so the two surfaces never
 *  silently diverge) rather than a strict read-only peek, but still additive/
 *  local-storage-only, no new component wiring. */
type SigSensitivity = "low" | "med" | "high";
const SIG_SENSITIVITY_LABEL: Record<SigSensitivity, string> = { low: "Low", med: "Med", high: "High" };

function readSignalSensitivity(): SigSensitivity {
  try {
    const raw = JSON.parse(localStorage.getItem("gm-settings") ?? "{}") as Record<string, unknown>;
    const v = raw.signalSensitivity;
    if (v === "low" || v === "med" || v === "high") return v;
  } catch {
    /* noop — browser dev / no localStorage */
  }
  return "med";
}

// DEPENDENCY NOTE (Opus gate, CR011-P4b; updated CR-013 W3): no clobber race
// with the legacy Control panel today ONLY because the menu targets render
// dashboard-only while <Control category={...}> mounts on the Settings tab and
// re-reads localStorage on each remount. If Control ever becomes persistently
// mounted, its whole-object settings write-back would silently revert this
// value on the next unrelated edit — revisit this seam then.
function writeSignalSensitivity(level: SigSensitivity) {
  try {
    const raw = JSON.parse(localStorage.getItem("gm-settings") ?? "{}") as Record<string, unknown>;
    raw.signalSensitivity = level;
    localStorage.setItem("gm-settings", JSON.stringify(raw));
  } catch {
    /* noop */
  }
}

function annunciatorMenuItems(): ContextMenuEntry[] {
  const current = readSignalSensitivity();
  const sensitivityItems: ContextMenuEntry[] = (Object.keys(SIG_SENSITIVITY_LABEL) as SigSensitivity[]).map((level) => ({
    id: `sig-sensitivity-${level}`,
    label: `ความไว G-Signal: ${SIG_SENSITIVITY_LABEL[level]}${level === current ? " (ปัจจุบัน)" : ""}`,
    // Selecting the already-active level would be a no-op — disabling it
    // doubles as the "mark the current level" the task asks for.
    disabled: level === current,
    run: () => {
      writeSignalSensitivity(level);
      void invoke("set_cv_signal_sensitivity", { level }).catch(() => {});
    }
  }));
  return [
    ...sensitivityItems,
    { id: "sig-sep", separator: true },
    {
      id: "sig-test-alert",
      label: "ทดสอบเสียงเตือน",
      run: () => {
        void invoke("speak_event", { event: "danger", fallback: "ทดสอบสัญญาณเตือนค่ะ" }).catch(() => {});
      }
    }
  ];
}

export function SignalGrid({ signals, menu }: { signals: CompanionData["signals"]; menu: ContextMenuController }) {
  const tags = ["D", "E", "F", "G"];
  const fillClass = ["sg-fill-ice", "", "sg-fill-safe", "sg-fill-warn"];
  return (
    <div className="g-signals-fab">
      {signals.map((sig, i) => (
        <div
          key={sig.label}
          className={`g-sig${i === 1 ? " hero" : ""}`}
          tabIndex={0}
          onContextMenu={(e) => menu.openFromMouseEvent(e, annunciatorMenuItems())}
          onKeyDown={(e) => menu.openFromKeyboard(e, annunciatorMenuItems())}
        >
          <span className="sg-tag">{tags[i]}</span>
          <span className="sg-label">{sig.label}</span>
          <span className="sg-val">{sig.value}</span>
          <div className="sg-bar">
            <div
              className={`sg-fill${fillClass[i] ? ` ${fillClass[i]}` : ""}`}
              style={{ width: `${sig.barPct}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
