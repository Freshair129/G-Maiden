// Voice-pack inventory — the user-facing pack picker (HoN-style tiles).
// Grid of covers on the left, sticky detail panel on the right when a pack
// is selected. Read/equip/preview only; the deep editor lives in AudioSettings.
//
// TODO: GID sync hook wires here — when the account-branch merges, drop a
// `useVoiceSync(state.activePackId)` call at the top and route `equip()`
// through it. All state/props are already sync-ready.

import { ChangeEvent, CSSProperties, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { VoiceEvent, VoicePack, VoiceState } from "./voice-types";

type VoiceInventoryProps = {
  onOpenEditor?: () => void;
};

// Pack tile — cover image on top, name/author on the bottom. Falls back to a
// tinted gradient with the pack name when there is no coverImageUrl.
function PackCard({
  pack,
  equipped,
  selected,
  onSelect
}: {
  pack: VoicePack;
  equipped: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const className = ["voice-card", equipped && "equipped", selected && "selected"].filter(Boolean).join(" ");
  const gradient = pickAccentGradient(pack);
  return (
    <button type="button" className={className} onClick={onSelect}>
      <div className="voice-card-cover">
        {equipped ? <span className="voice-card-badge">ถูกใช้อยู่</span> : null}
        {pack.builtIn ? <span className="voice-card-badge builtin">ติดมากับแอป</span> : null}
        {pack.coverImageUrl ? (
          <img src={pack.coverImageUrl} alt={`${pack.name} cover`} />
        ) : (
          <div className="voice-card-cover-placeholder" style={{ background: gradient }}>
            {pack.name || pack.id}
          </div>
        )}
      </div>
      <div className="voice-card-meta">
        <div className="voice-card-name">{pack.name || pack.id}</div>
        <div className="voice-card-author">{pack.author || "Maiden Community"}</div>
        <div className="voice-card-coverage">
          {pack.coveredEvents}/{pack.totalEvents} events · {pack.clips} clips
        </div>
      </div>
    </button>
  );
}

// Pick a subtle gradient for pack tiles that ship no cover image. Uses the
// event-group accent that the pack has the most mappings in, so packs feel
// distinguishable even without art.
function pickAccentGradient(pack: VoicePack): string {
  const counts = new Map<string, { color: string; count: number }>();
  for (const item of pack.items) {
    if (!item.mapping) continue;
    const cur = counts.get(item.group) || { color: item.accent, count: 0 };
    cur.count += 1;
    counts.set(item.group, cur);
  }
  let top: { color: string; count: number } | null = null;
  for (const entry of counts.values()) if (!top || entry.count > top.count) top = entry;
  const accent = top?.color || "#64c7ff";
  return `linear-gradient(135deg, ${accent}44 0%, #0b1220 65%, #060913 100%)`;
}

// One event row in the detail panel — clip status + play button that goes
// through the same `play_clip` Tauri command AudioSettings uses.
//
// Status mirrors the REAL runtime resolution chain (audio.rs list_clips):
// pack clip → bundled default clip → TTS. "missing" is never shown — an
// unmapped event still voices via the default pack, and the play button
// previews exactly the sound the player will hear in-game.
function EventRow({ event, onPlay }: { event: VoiceEvent; onPlay: (event: VoiceEvent) => void }) {
  const hasPackClip = !!event.mapping?.hasClip;
  const status = hasPackClip ? "clip" : event.defaultClipCount > 0 ? "default" : "tts";
  const statusText = hasPackClip
    ? `${event.mapping!.clipCount} คลิป`
    : event.defaultClipCount > 0
    ? "เสียงกลาง"
    : "TTS";
  const playable = hasPackClip ? event.mapping?.clipUrl : event.defaultClipUrl;
  return (
    <div className="voice-event-row">
      <button
        type="button"
        className="voice-event-play"
        onClick={() => onPlay(event)}
        disabled={!playable}
        aria-label={`Play ${event.id}`}
      >
        ▶
      </button>
      <span className="voice-event-id">{event.id}</span>
      <span className="voice-event-th">{event.mapping?.thai || event.thai}</span>
      <span className={`voice-event-status ${status}`}>{statusText}</span>
    </div>
  );
}

export default function VoiceInventory({ onOpenEditor }: VoiceInventoryProps = {}) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<VoiceState>("voice_api_state");
      // Guard against the Vite fallback returning index.html when the Rust
      // backend isn't running (same defensive pattern as AudioSettings.tsx).
      if (!next || typeof next !== "object" || !Array.isArray(next.groups) || !Array.isArray(next.packs)) {
        throw new Error("Voice pack backend returned an invalid response.");
      }
      setState(next);
      setSelectedId((cur) => cur ?? next.activePackId ?? next.packs[0]?.id ?? null);
      setErr(null);
    } catch (e) {
      setErr(errMessage(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPack = useMemo(() => {
    if (!state) return null;
    return state.packs.find((p) => p.id === selectedId) || state.activePack || state.packs[0] || null;
  }, [state, selectedId]);

  const equippedId = state?.activePackId ?? null;
  const isEquipped = !!selectedPack && selectedPack.id === equippedId;

  const equip = useCallback(async (packId: string) => {
    setBusy(true);
    try {
      const next = await invoke<VoiceState>("voice_api_action", { action: "activate", packId });
      setState(next);
      setNotice(`ใช้ pack: ${next.activePack?.name || packId}`);
      setErr(null);
      // TODO: GID sync — call `useVoiceSync().syncEquip(packId)` here when the
      // account branch merges. The Supabase write is fire-and-forget.
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const playEventClip = useCallback((event: VoiceEvent) => {
    // Preview what will REALLY play: the pack's clip, else the bundled
    // default clip this event falls back to (audio.rs resolution chain).
    const url = event.mapping?.clipUrl || event.defaultClipUrl;
    if (!url) return;
    // Windows paths go through the Tauri command; anything else is treated
    // as a URL and played via <audio>. Matches AudioSettings.playUrl().
    if (/^[a-z]:[\\/]/i.test(url) || url.startsWith("\\\\")) {
      invoke("play_clip", { path: url }).catch(() => {});
      return;
    }
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }, []);

  const previewOnOverlay = useCallback(async (event: VoiceEvent) => {
    if (!selectedPack) return;
    try {
      await invoke("preview_announcer_event", { packId: selectedPack.id, event: event.id });
    } catch {
      // silent — overlay might not be running; nothing else we can do here
    }
  }, [selectedPack]);

  const previewFirstMapped = useCallback(() => {
    if (!selectedPack) return;
    const firstMapped = selectedPack.items.find((item) => item.mapping);
    if (firstMapped) void previewOnOverlay(firstMapped);
  }, [selectedPack, previewOnOverlay]);

  const importFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const result = await invoke<{ imported?: string[] }>("voice_api_import_archive", {
        name: file.name,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
      });
      await refresh();
      setNotice(`นำเข้า: ${(result?.imported || [file.name]).join(", ")}`);
      setErr(null);
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
      setDragging(false);
    }
  }, [refresh]);

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void importFile(file);
  };

  const onPickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void importFile(file);
    event.target.value = "";
  };

  const openRoot = useCallback(async () => {
    try {
      await invoke<VoiceState>("voice_api_action", { action: "open-root", packId: null });
    } catch (e) {
      setErr(errMessage(e));
    }
  }, []);

  if (!state) {
    return (
      <div className="voice-inventory">
        <div className="voice-empty">{err ? err : "loading voice packs..."}</div>
      </div>
    );
  }

  return (
    <div className="voice-inventory">
      <header className="voice-inventory-header">
        <div className="voice-inventory-title">
          <h2>Voice Pack Inventory</h2>
          <span className="voice-inventory-sub">
            {state.packs.length} pack{state.packs.length === 1 ? "" : "s"} ·{" "}
            {state.activePack ? `กำลังใช้: ${state.activePack.name}` : "ยังไม่มี pack ที่ใช้อยู่"}
          </span>
        </div>
        <div className="voice-inventory-actions">
          <label
            className={"voice-dropzone" + (dragging ? " dragging" : "")}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input ref={importInputRef} type="file" accept=".zip" hidden onChange={onPickFile} />
            <span onClick={() => importInputRef.current?.click()} style={{ cursor: "pointer" }}>
              ⬇ Import .zip
            </span>
          </label>
          <button className="voice-btn" onClick={() => void refresh()} disabled={busy}>Rescan</button>
          <button className="voice-btn" onClick={() => void openRoot()}>Open folder</button>
          {onOpenEditor ? <button className="voice-btn" onClick={onOpenEditor}>Editor</button> : null}
        </div>
      </header>

      {notice ? <div className="voice-toast ok">{notice}</div> : null}
      {err ? <div className="voice-toast err">{err}</div> : null}

      {state.packs.length === 0 ? (
        <div className="voice-empty">
          ยังไม่มี voice pack — Import .zip หรือกด Open folder แล้ววาง pack เข้าไปในโฟลเดอร์ packs/
        </div>
      ) : (
        <div className="voice-split">
          <div className="voice-grid">
            {state.packs.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                equipped={pack.id === equippedId}
                selected={pack.id === selectedPack?.id}
                onSelect={() => setSelectedId(pack.id)}
              />
            ))}
          </div>

          {selectedPack ? (
            <aside className="voice-detail">
              <div className="voice-detail-cover">
                {selectedPack.coverImageUrl ? (
                  <img src={selectedPack.coverImageUrl} alt={`${selectedPack.name} cover`} />
                ) : (
                  <div className="voice-card-cover-placeholder" style={{ background: pickAccentGradient(selectedPack) }}>
                    {selectedPack.name || selectedPack.id}
                  </div>
                )}
              </div>

              <div className="voice-detail-meta">
                <h3>{selectedPack.name}</h3>
                <div className="voice-detail-chips">
                  {selectedPack.builtIn ? <span className="voice-detail-chip builtin">ติดมากับแอป</span> : null}
                  {selectedPack.author ? <span className="voice-detail-chip">by {selectedPack.author}</span> : null}
                  <span className="voice-detail-chip">v{selectedPack.version || "0.0.0"}</span>
                  <span className="voice-detail-chip">{selectedPack.locale || "th-TH"}</span>
                </div>
                {selectedPack.description ? (
                  <p className="voice-detail-desc">{selectedPack.description}</p>
                ) : null}
              </div>

              <CoverageBar covered={selectedPack.coveredEvents} total={selectedPack.totalEvents} />

              <div className="voice-detail-actions">
                <button
                  className={"voice-btn " + (isEquipped ? "equipped" : "primary")}
                  onClick={() => !isEquipped && void equip(selectedPack.id)}
                  disabled={busy || isEquipped}
                >
                  {isEquipped ? "✓ Equipped" : "Equip"}
                </button>
                <button className="voice-btn" onClick={previewFirstMapped} disabled={selectedPack.coveredEvents === 0}>
                  Preview overlay
                </button>
              </div>

              <div className="voice-detail-events">
                {state.groups.map((group) => {
                  const items = selectedPack.items.filter((item) => item.group === group.id);
                  if (items.length === 0) return null;
                  const mapped = items.filter((item) => item.mapping).length;
                  return (
                    <div className="voice-event-group" key={group.id}>
                      <div className="voice-event-group-h">
                        <span className="voice-event-group-dot" style={{ background: group.accent } as CSSProperties} />
                        <span>{group.label}</span>
                        <span className="voice-event-group-count">{mapped}/{items.length}</span>
                      </div>
                      {items.map((event) => (
                        <EventRow key={event.id} event={event} onPlay={playEventClip} />
                      ))}
                    </div>
                  );
                })}
              </div>
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CoverageBar({ covered, total }: { covered: number; total: number }) {
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  return (
    <div className="voice-detail-progress">
      <div className="voice-detail-progress-label">
        <span>Coverage</span>
        <span>{covered}/{total} · {pct}%</span>
      </div>
      <div className="voice-detail-progress-bar">
        <div className="voice-detail-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
