import { ChangeEvent, CSSProperties, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { VoiceAssetOption, VoiceEvent, VoiceState } from "./voice-types";

async function readJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const body = init?.body && typeof init.body === "string" ? JSON.parse(init.body) : {};

  if (url === "/api/voice") return invoke("voice_api_state") as Promise<T>;

  if (url.startsWith("/api/voice/import")) {
    const name = new URLSearchParams(url.split("?")[1] || "").get("name") || "voice-pack.zip";
    return invoke("voice_api_import_archive", {
      name,
      bytes: Array.from(new Uint8Array(init?.body as ArrayBuffer))
    }) as Promise<T>;
  }

  if (url.startsWith("/api/voice/")) {
    const action = url.replace("/api/voice/", "");
    if (action === "map-event") return invoke("voice_api_map_event", { payload: body }) as Promise<T>;
    if (action === "update-pack") return invoke("voice_api_update_pack", { payload: body }) as Promise<T>;
    return invoke("voice_api_action", { action, packId: body.packId || null }) as Promise<T>;
  }

  throw new Error(`Unsupported voice API route: ${url}`);
}

function groupLabel(state: VoiceState, groupId: string) {
  return state.groups.find((group) => group.id === groupId)?.label || groupId;
}

function speakPreview(text: string) {
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "th-TH";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function sanitizePackId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
}

type AudioSettingsProps = {
  onBack?: () => void;
};

export default function AudioSettings({ onBack }: AudioSettingsProps = {}) {
  const [state, setState] = useState<VoiceState | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [savingMap, setSavingMap] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [savingPackMeta, setSavingPackMeta] = useState(false);
  const [formText, setFormText] = useState("");
  const [formThai, setFormThai] = useState("");
  const [formBanner, setFormBanner] = useState("");
  const [formBannerAsset, setFormBannerAsset] = useState("");
  const [selectedClips, setSelectedClips] = useState<string[]>([]);
  const [packName, setPackName] = useState("");
  const [packVersion, setPackVersion] = useState("");
  const [packLocale, setPackLocale] = useState("");
  const [packAuthor, setPackAuthor] = useState("");
  const [packDescription, setPackDescription] = useState("");
  const [packCoverImage, setPackCoverImage] = useState("");
  const [templatePackId, setTemplatePackId] = useState("voice-pack-template");
  const [templateName, setTemplateName] = useState("My Voice Pack");
  const [templateLocale, setTemplateLocale] = useState("th-TH");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clipInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    try {
      const next = await readJson<VoiceState>("/api/voice");
      // Guard: G-Maiden's Tauri app has no /api/voice backend (that was the
      // orchestra-standalone server). Vite serves the SPA index.html for unknown
      // paths, so `next` can be an HTML string, not a VoiceState — validate the
      // shape before rendering or `state.groups.map` / `state.packs` explodes.
      if (!next || typeof next !== "object" || !Array.isArray(next.groups) || !Array.isArray(next.packs)) {
        throw new Error("Voice pack backend returned an invalid response.");
      }
      setState(next);
      setSelectedEventId((current) => current || next.activePack?.items?.[0]?.id || null);
      setErr(null);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedEvent = useMemo(() => {
    if (!state?.activePack) return null;
    return state.activePack.items.find((item) => item.id === selectedEventId) || state.activePack.items[0] || null;
  }, [selectedEventId, state]);

  useEffect(() => {
    if (!selectedEvent) return;
    setFormText(selectedEvent.mapping?.text || "");
    setFormThai(selectedEvent.mapping?.thai || selectedEvent.thai || "");
    setFormBanner(selectedEvent.mapping?.banner || "");
    setFormBannerAsset(selectedEvent.mapping?.bannerAsset || "");
    setSelectedClips(selectedEvent.mapping?.clips || []);
  }, [selectedEvent]);

  async function run(action: "rescan" | "open-root" | "activate", body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      await readJson(`/api/voice/${action}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      await refresh();
      setErr(null);
      setNotice(action === "rescan" ? "Voice packs rescanned." : null);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function playUrl(url: string) {
    if (/^[a-z]:[\\/]/i.test(url) || url.startsWith("\\\\")) {
      invoke("play_clip", { path: url }).catch(() => {});
      return;
    }
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }

  function previewEvent(event: VoiceEvent) {
    if (event.mapping?.clipUrl) {
      playUrl(event.mapping.clipUrl);
      return;
    }
    const text = event.mapping?.thai || event.mapping?.text || event.thai || event.label;
    speakPreview(text);
  }

  // Fire this event through the REAL overlay path (same payload gsi.rs emits
  // in-game): plays the pack's clip and shows its banner on the overlay window,
  // so a pack's banner+sound bundle can be verified without launching Dota.
  function previewOnOverlay(event: VoiceEvent) {
    const packId = state?.activePack?.id;
    if (!packId) return;
    invoke("preview_announcer_event", { packId, event: event.id }).catch(() => {});
  }

  function previewClip(clip: VoiceAssetOption) {
    playUrl(clip.url);
  }

  async function uploadArchive(file: File) {
    setBusy(true);
    try {
      const result = await readJson<{ imported?: string[] }>(`/api/voice/import?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": file.type || "application/zip" },
        body: await file.arrayBuffer()
      });
      await refresh();
      setErr(null);
      setNotice(`Imported pack: ${(result?.imported || []).join(", ") || file.name}`);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      setNotice(null);
    } finally {
      setBusy(false);
      setDragging(false);
    }
  }

  async function createTemplate() {
    setCreatingTemplate(true);
    try {
      const next = await invoke<VoiceState>("voice_api_create_template", {
        packId: sanitizePackId(templatePackId),
        name: templateName,
        locale: templateLocale
      });
      setState(next);
      setErr(null);
      setNotice(`Created template pack: ${sanitizePackId(templatePackId) || "voice-pack-template"}`);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      setNotice(null);
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function uploadAsset(kind: "clip" | "banner", file: File) {
    if (!selectedPack) return;
    setBusy(true);
    try {
      const result = await invoke<{ path: string }>("voice_api_upload_asset", {
        packId: selectedPack.id,
        kind,
        name: file.name,
        bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
      });
      setErr(null);
      setNotice(`Uploaded ${kind}: ${result.path}`);
      await refresh();
      if (kind === "banner" && !formBannerAsset) setFormBannerAsset(result.path);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      setNotice(null);
    } finally {
      setBusy(false);
    }
  }

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    uploadArchive(file);
  }

  function onDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    onFiles(event.dataTransfer.files);
  }

  function onPickFile(event: ChangeEvent<HTMLInputElement>) {
    onFiles(event.target.files);
    event.target.value = "";
  }

  function onPickAsset(kind: "clip" | "banner", event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) uploadAsset(kind, file);
    event.target.value = "";
  }

  async function saveMapping() {
    if (!state?.activePack || !selectedEvent) return;
    setSavingMap(true);
    try {
      const next = await readJson<VoiceState>("/api/voice/map-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packId: state.activePack.id,
          eventId: selectedEvent.id,
          text: formText,
          thai: formThai,
          banner: formBanner,
          bannerAsset: formBannerAsset,
          clips: selectedClips
        })
      });
      setState(next);
      setErr(null);
      setNotice(`Saved mapping for ${selectedEvent.id}.`);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      setNotice(null);
    } finally {
      setSavingMap(false);
    }
  }

  async function savePackMeta() {
    if (!selectedPack) return;
    setSavingPackMeta(true);
    try {
      const next = await readJson<VoiceState>("/api/voice/update-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packId: selectedPack.id,
          name: packName,
          version: packVersion,
          locale: packLocale,
          author: packAuthor,
          description: packDescription,
          coverImage: packCoverImage
        })
      });
      setState(next);
      setErr(null);
      setNotice(`Saved pack details for ${selectedPack.id}.`);
    } catch (e) {
      setErr(typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
      setNotice(null);
    } finally {
      setSavingPackMeta(false);
    }
  }

  function toggleClip(path: string) {
    setSelectedClips((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path]
    );
  }

  const selectedPack = state?.activePack || null;
  const selectedClipOptions = selectedEvent?.mapping?.clipOptions || [];
  const selectedBannerOption = selectedPack?.availableBanners.find((banner) => banner.path === formBannerAsset) || null;
  const selectedBannerUrl = selectedBannerOption?.url || selectedEvent?.mapping?.bannerUrl || null;
  const selectedBannerSrc = selectedBannerUrl ? convertFileSrc(selectedBannerUrl) : null;
  const coverage = selectedPack ? Math.round((selectedPack.coveredEvents / Math.max(selectedPack.totalEvents, 1)) * 100) : 0;
  const packMetaDirty =
    packName !== (selectedPack?.name || "") ||
    packVersion !== (selectedPack?.version || "") ||
    packLocale !== (selectedPack?.locale || "") ||
    packAuthor !== (selectedPack?.author || "") ||
    packDescription !== (selectedPack?.description || "") ||
    packCoverImage !== (selectedPack?.coverImage || "");
  const dirty =
    formText !== (selectedEvent?.mapping?.text || "") ||
    formThai !== (selectedEvent?.mapping?.thai || selectedEvent?.thai || "") ||
    formBanner !== (selectedEvent?.mapping?.banner || "") ||
    formBannerAsset !== (selectedEvent?.mapping?.bannerAsset || "") ||
    JSON.stringify(selectedClips) !== JSON.stringify(selectedEvent?.mapping?.clips || []);

  useEffect(() => {
    if (!selectedPack) return;
    setPackName(selectedPack.name || "");
    setPackVersion(selectedPack.version || "");
    setPackLocale(selectedPack.locale || "");
    setPackAuthor(selectedPack.author || "");
    setPackDescription(selectedPack.description || "");
    setPackCoverImage(selectedPack.coverImage || "");
  }, [selectedPack]);

  if (!state) return (
    <div className="audio-page">
      <div className="empty">{err ? err : "loading audio settings..."}</div>
    </div>
  );

  return (
    <div className="audio-page">
      <section className="audio-hero">
        <div className="audio-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to inventory"
                style={{
                  background: "transparent",
                  border: "1px solid var(--line)",
                  borderRadius: 6,
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: "2px 8px",
                  fontSize: 11,
                  fontWeight: 600
                }}
              >
                ← Inventory
              </button>
            ) : null}
            <span className="audio-kicker">Voice Pack Config</span>
          </div>
          <div className="audio-title-row">
            <h2>{selectedPack?.name || "No active voice pack"}</h2>
            {selectedPack && <span className="audio-chip">{selectedPack.locale}</span>}
            {selectedPack && <span className="audio-chip">{selectedPack.version}</span>}
          </div>
          <div className="audio-sub">
            {selectedPack ? `${selectedPack.clips} real clips · ${selectedPack.coveredEvents}/${selectedPack.totalEvents} events mapped` : "Scaffold is ready. Drop packs into the default folder, then rescan."}
          </div>
          <div className="audio-progress">
            <div className="audio-progress-fill" style={{ width: `${coverage}%` }} />
          </div>
          <div className="audio-paths">
            <span>root <code>{state.rootDir}</code></span>
            <span>packs <code>{state.packsDir}</code></span>
            <span>cache <code>{state.cacheDir}</code></span>
          </div>
        </div>

        <div className="audio-hero-actions">
          <label className="audio-select-wrap">
            <span>Active pack</span>
            <select
              className="audio-select"
              value={state.activePackId || ""}
              onChange={(e) => run("activate", { packId: e.target.value })}
              disabled={busy || state.packs.length === 0}
            >
              {state.packs.map((pack) => (
                <option key={pack.id} value={pack.id}>{pack.name}</option>
              ))}
            </select>
          </label>
          <button className="audio-btn primary" onClick={() => run("open-root")} disabled={busy}>Open voice folder</button>
          <button className="audio-btn" onClick={() => run("rescan")} disabled={busy}>Rescan packs</button>
        </div>
      </section>

      <section className="audio-tools-grid">
        <div className="audio-panel">
          <div className="audio-editor-h">Install Pack</div>
          <button
            className={"audio-dropzone" + (dragging ? " dragging" : "")}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            disabled={busy}
          >
            <div className="audio-drop-kicker">Install voice pack</div>
            <div className="audio-drop-title">Drop a `.zip` here or click to import</div>
            <div className="audio-drop-sub">The archive can contain one pack or many pack folders, as long as each one has `manifest.json` and pack-relative paths.</div>
          </button>
          <input ref={fileInputRef} type="file" accept=".zip" hidden onChange={onPickFile} />
        </div>

        <div className="audio-panel">
          <div className="audio-editor-h">Template Generator</div>
          <label className="audio-field">
            <span>Pack id</span>
            <input className="audio-input" value={templatePackId} onChange={(e) => setTemplatePackId(sanitizePackId(e.target.value))} placeholder="my-voice-pack" />
          </label>
          <label className="audio-field">
            <span>Pack name</span>
            <input className="audio-input" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="My Voice Pack" />
          </label>
          <label className="audio-field">
            <span>Locale</span>
            <input className="audio-input" value={templateLocale} onChange={(e) => setTemplateLocale(e.target.value)} placeholder="th-TH" />
          </label>
          <div className="audio-preview-actions">
            <button className="audio-btn primary" onClick={createTemplate} disabled={creatingTemplate || !templatePackId || !templateName}>
              Create template pack
            </button>
          </div>
        </div>
      </section>

      <section className="audio-tools-grid">
        <div className="audio-panel">
          <div className="audio-editor-h">Pack Details</div>
          <label className="audio-field">
            <span>Pack name</span>
            <input className="audio-input" value={packName} onChange={(e) => setPackName(e.target.value)} placeholder="My Voice Pack" />
          </label>
          <label className="audio-field">
            <span>Version</span>
            <input className="audio-input" value={packVersion} onChange={(e) => setPackVersion(e.target.value)} placeholder="0.1.0" />
          </label>
          <label className="audio-field">
            <span>Locale</span>
            <input className="audio-input" value={packLocale} onChange={(e) => setPackLocale(e.target.value)} placeholder="th-TH" />
          </label>
          <label className="audio-field">
            <span>Author</span>
            <input className="audio-input" value={packAuthor} onChange={(e) => setPackAuthor(e.target.value)} placeholder="Author name" />
          </label>
          <label className="audio-field">
            <span>Description</span>
            <input className="audio-input" value={packDescription} onChange={(e) => setPackDescription(e.target.value)} placeholder="Short summary of this pack" />
          </label>
          <label className="audio-field">
            <span>Cover image</span>
            <select className="audio-select" value={packCoverImage} onChange={(e) => setPackCoverImage(e.target.value)}>
              <option value="">Auto (first banner) / none</option>
              {(selectedPack?.availableBanners || []).map((banner) => (
                <option key={banner.path} value={banner.path}>{banner.path}</option>
              ))}
            </select>
            <div className="audio-hint">แสดงบนไทล์ในหน้า Inventory. ถ้าเว้นไว้ ระบบจะใช้ภาพ banner แรก.</div>
          </label>
          <div className="audio-preview-actions">
            <button className="audio-btn primary" onClick={savePackMeta} disabled={!selectedPack || !packMetaDirty || savingPackMeta}>
              Save pack details
            </button>
          </div>
        </div>

        <div className="audio-panel">
          <div className="audio-editor-h">Asset Uploader</div>
          <div className="audio-field">
            <span>Clip files</span>
            <button className="audio-btn primary" onClick={() => clipInputRef.current?.click()} disabled={!selectedPack || busy}>Upload clip to active pack</button>
            <div className="audio-hint">Accepted: `.mp3`, `.wav`, `.ogg`, `.m4a`</div>
          </div>
          <div className="audio-field">
            <span>Banner files</span>
            <button className="audio-btn" onClick={() => bannerInputRef.current?.click()} disabled={!selectedPack || busy}>Upload banner to active pack</button>
            <div className="audio-hint">Accepted: `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`</div>
          </div>
          <input ref={clipInputRef} type="file" accept=".mp3,.wav,.ogg,.m4a" hidden onChange={(e) => onPickAsset("clip", e)} />
          <input ref={bannerInputRef} type="file" accept=".png,.jpg,.jpeg,.webp,.svg" hidden onChange={(e) => onPickAsset("banner", e)} />
        </div>
      </section>

      {notice ? <div className="audio-banner ok">{notice}</div> : null}
      {err ? <div className="audio-banner err">{err}</div> : null}

      <section className="audio-grid">
        <div className="audio-list">
          {state.groups.map((group) => {
            const items = selectedPack?.items.filter((item) => item.group === group.id) || [];
            return (
              <div className="audio-group" key={group.id}>
                <div className="audio-group-h">
                  <span className="audio-group-dot" style={{ background: group.accent }} />
                  <span>{groupLabel(state, group.id)}</span>
                  <span className="audio-group-count">{items.filter((item) => item.mapping).length}/{items.length}</span>
                </div>
                <div className="audio-event-list">
                  {items.map((event) => (
                    <button
                      key={event.id}
                      className={"audio-event" + (selectedEvent?.id === event.id ? " active" : "")}
                      onClick={() => setSelectedEventId(event.id)}
                    >
                      <div className="audio-event-main">
                        <span className={"audio-event-dot" + (event.mapping ? " ok" : "")} />
                        <span className="audio-event-id">{event.id}</span>
                        <span className="audio-event-th">{event.thai}</span>
                      </div>
                      <div className="audio-event-actions">
                        <span className={"audio-event-status" + (event.mapping?.hasClip ? " clip" : event.mapping ? " fallback" : " empty")}>
                          {event.mapping?.hasClip ? `${event.mapping.clipCount} clips` : event.mapping ? "fallback" : "missing"}
                        </span>
                        <span className={"audio-event-status" + (event.mapping?.bannerUrl ? " clip" : " fallback")}>
                          {event.mapping?.bannerUrl ? "banner asset" : "live card"}
                        </span>
                        <span
                          className="audio-play"
                          onClick={(e) => { e.stopPropagation(); previewEvent(event); }}
                        >
                          play
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="audio-preview">
          <div className="audio-preview-h">Event Preview</div>
          {selectedEvent ? (
            <>
              {selectedBannerSrc ? (
                <img className="audio-banner-image" src={selectedBannerSrc} alt={`${selectedEvent.label} banner`} />
              ) : (
                <div className="audio-banner-card" style={{ "--accent": selectedEvent.accent } as CSSProperties}>
                  <div className="audio-banner-kicker">{groupLabel(state, selectedEvent.group)}</div>
                  <div className="audio-banner-title">{selectedEvent.label}</div>
                  <div className="audio-banner-sub">{selectedEvent.subtitle}</div>
                  <div className="audio-banner-th">{formBanner || formThai || selectedEvent.thai}</div>
                </div>
              )}
              <div className="audio-detail-card">
                <div className="audio-detail-row"><span>event</span><code>{selectedEvent.id}</code></div>
                <div className="audio-detail-row"><span>mode</span><span>{selectedEvent.mapping?.hasClip ? "multi-clip playback" : selectedEvent.mapping ? "system speech fallback" : "not mapped"}</span></div>
                <div className="audio-detail-row"><span>banner</span><span>{selectedBannerUrl ? "pack asset" : "live preview card"}</span></div>
                <div className="audio-detail-row"><span>line</span><span>{formThai || formText || "No line configured yet"}</span></div>
                <div className="audio-detail-row"><span>selected clips</span><span>{selectedClips.length || "none"}</span></div>
                <div className="audio-preview-actions">
                  <button className="audio-btn primary" onClick={() => previewEvent(selectedEvent)}>Play preview</button>
                  <button className="audio-btn" onClick={() => previewOnOverlay(selectedEvent)} title="แสดง banner + เสียงบน overlay จริง (ไม่ต้องเข้าเกม)">Show on overlay</button>
                  <button className="audio-btn" onClick={() => run("open-root")}>Open pack folder</button>
                </div>
              </div>

              <div className="audio-editor">
                <div className="audio-editor-h">Event Mapping</div>
                <label className="audio-field">
                  <span>English line</span>
                  <input className="audio-input" value={formText} onChange={(e) => setFormText(e.target.value)} placeholder="Double kill." />
                </label>
                <label className="audio-field">
                  <span>Thai line</span>
                  <input className="audio-input" value={formThai} onChange={(e) => setFormThai(e.target.value)} placeholder="ดับเบิลคิล" />
                </label>
                <label className="audio-field">
                  <span>Banner override</span>
                  <input className="audio-input" value={formBanner} onChange={(e) => setFormBanner(e.target.value)} placeholder="ข้อความบนแบนเนอร์" />
                </label>
                <label className="audio-field">
                  <span>Banner asset</span>
                  <select className="audio-select" value={formBannerAsset} onChange={(e) => setFormBannerAsset(e.target.value)}>
                    <option value="">Auto-detect / none</option>
                    {(selectedPack?.availableBanners || []).map((banner) => (
                      <option key={banner.path} value={banner.path}>{banner.path}</option>
                    ))}
                  </select>
                </label>

                <div className="audio-field">
                  <span>Available clips in this pack</span>
                  {selectedPack?.availableClips.length ? (
                    <div className="audio-clip-list">
                      {selectedPack.availableClips.map((clip) => {
                        const active = selectedClips.includes(clip.path);
                        return (
                          <label key={clip.path} className={"audio-clip-row" + (active ? " active" : "")}>
                            <input type="checkbox" checked={active} onChange={() => toggleClip(clip.path)} />
                            <code>{clip.path}</code>
                            <button type="button" className="audio-mini-btn" onClick={() => previewClip(clip)}>play</button>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty">No clip files found yet. Import a zip or drop audio files into this pack&apos;s `clips/` folder.</div>
                  )}
                </div>

                <div className="audio-field">
                  <span>Available banner files</span>
                  {selectedPack?.availableBanners.length ? (
                    <div className="audio-pill-row">
                      {selectedPack.availableBanners.map((banner) => (
                        <button key={banner.path} className={"audio-pill" + (formBannerAsset === banner.path ? " active" : "")} onClick={() => setFormBannerAsset(banner.path)}>
                          {banner.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">No banner assets found yet. Put image files in this pack&apos;s `banners/` folder or use the template zip.</div>
                  )}
                </div>

                {selectedClipOptions.length ? (
                  <div className="audio-field">
                    <span>Mapped clip order</span>
                    <div className="audio-pill-row">
                      {selectedClipOptions.map((clip) => (
                        <button key={clip.path} className="audio-pill" onClick={() => previewClip(clip)}>{clip.path}</button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="audio-preview-actions">
                  <button className="audio-btn primary" disabled={!dirty || savingMap} onClick={saveMapping}>Save mapping</button>
                  <button
                    className="audio-btn"
                    disabled={!selectedClips.length}
                    onClick={() => {
                      const pick = selectedPack?.availableClips.find((clip) => clip.path === selectedClips[Math.floor(Math.random() * selectedClips.length)]);
                      if (pick) previewClip(pick);
                    }}
                  >
                    Random mapped clip
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty">Select an event to inspect its voice line and banner.</div>
          )}
        </aside>
      </section>
    </div>
  );
}
