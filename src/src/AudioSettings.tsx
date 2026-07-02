import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type VoiceAssetOption = {
  path: string;
  name: string;
  url: string;
};

type VoiceEvent = {
  id: string;
  group: string;
  label: string;
  subtitle: string;
  thai: string;
  accent: string;
  mapping: null | {
    text: string;
    thai: string;
    banner: string;
    bannerAsset: string;
    bannerUrl: string | null;
    clip: string;
    clips: string[];
    hasClip: boolean;
    clipCount: number;
    clipUrl: string | null;
    clipOptions: VoiceAssetOption[];
  };
};

type VoicePack = {
  id: string;
  name: string;
  version: string;
  locale: string;
  author: string;
  description: string;
  path: string;
  coveredEvents: number;
  totalEvents: number;
  clips: number;
  availableClips: VoiceAssetOption[];
  availableBanners: VoiceAssetOption[];
  items: VoiceEvent[];
};

type VoiceState = {
  rootDir: string;
  packsDir: string;
  cacheDir: string;
  activePackId: string | null;
  activePack: VoicePack | null;
  packs: VoicePack[];
  groups: { id: string; label: string; accent: string }[];
};

async function readJson(url: string, init?: RequestInit) {
  const resp = await fetch(url, init);
  const contentType = resp.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await resp.json() : await resp.text();
  if (!resp.ok) {
    const message = typeof body === "string" ? body : body?.error || `HTTP ${resp.status}`;
    throw new Error(String(message));
  }
  return body;
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

export default function AudioSettings() {
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
  const [templatePackId, setTemplatePackId] = useState("voice-pack-template");
  const [templateName, setTemplateName] = useState("My Voice Pack");
  const [templateLocale, setTemplateLocale] = useState("th-TH");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clipInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    try {
      const next = await readJson("/api/voice");
      // Guard: G-Maiden's Tauri app has no /api/voice backend (that was the
      // orchestra-standalone server). Vite serves the SPA index.html for unknown
      // paths, so `next` can be an HTML string, not a VoiceState — validate the
      // shape before rendering or `state.groups.map` / `state.packs` explodes.
      if (!next || typeof next !== "object" || !Array.isArray(next.groups) || !Array.isArray(next.packs)) {
        throw new Error("Voice pack service is unavailable in this build (no /api/voice backend).");
      }
      setState(next);
      setSelectedEventId((current) => current || next.activePack?.items?.[0]?.id || null);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message || e));
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

  async function run(action: "rescan" | "open-root" | "activate", body: Record<string, any> = {}) {
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
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  function playUrl(url: string) {
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

  function previewClip(clip: VoiceAssetOption) {
    playUrl(clip.url);
  }

  async function uploadArchive(file: File) {
    setBusy(true);
    try {
      const result = await readJson(`/api/voice/import?name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": file.type || "application/zip" },
        body: await file.arrayBuffer()
      });
      await refresh();
      setErr(null);
      setNotice(`Imported pack: ${(result?.imported || []).join(", ") || file.name}`);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setNotice(null);
    } finally {
      setBusy(false);
      setDragging(false);
    }
  }

  async function createTemplate() {
    setCreatingTemplate(true);
    try {
      const resp = await fetch("/api/voice/template", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packId: sanitizePackId(templatePackId),
          name: templateName,
          locale: templateLocale
        })
      });
      if (!resp.ok) {
        let message = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          message = body?.error || message;
        } catch {}
        throw new Error(message);
      }
      const blob = await resp.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const downloadName = `${sanitizePackId(templatePackId) || "voice-pack-template"}.zip`;
      anchor.href = href;
      anchor.download = downloadName;
      anchor.click();
      URL.revokeObjectURL(href);
      setErr(null);
      setNotice(`Downloaded template: ${downloadName}`);
    } catch (e: any) {
      setErr(String(e?.message || e));
      setNotice(null);
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function uploadAsset(kind: "clip" | "banner", file: File) {
    if (!selectedPack) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/voice/upload-asset?pack=${encodeURIComponent(selectedPack.id)}&kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: await file.arrayBuffer()
      });
      if (!resp.ok) {
        let message = `HTTP ${resp.status}`;
        try {
          const body = await resp.json();
          message = body?.error || message;
        } catch {}
        throw new Error(message);
      }
      const result = await resp.json();
      setErr(null);
      setNotice(`Uploaded ${kind}: ${result.path}`);
      await refresh();
      if (kind === "banner" && !formBannerAsset) setFormBannerAsset(result.path);
    } catch (e: any) {
      setErr(String(e?.message || e));
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
      const next = await readJson("/api/voice/map-event", {
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
    } catch (e: any) {
      setErr(String(e?.message || e));
      setNotice(null);
    } finally {
      setSavingMap(false);
    }
  }

  async function savePackMeta() {
    if (!selectedPack) return;
    setSavingPackMeta(true);
    try {
      const next = await readJson("/api/voice/update-pack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          packId: selectedPack.id,
          name: packName,
          version: packVersion,
          locale: packLocale,
          author: packAuthor,
          description: packDescription
        })
      });
      setState(next);
      setErr(null);
      setNotice(`Saved pack details for ${selectedPack.id}.`);
    } catch (e: any) {
      setErr(String(e?.message || e));
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
  const coverage = selectedPack ? Math.round((selectedPack.coveredEvents / Math.max(selectedPack.totalEvents, 1)) * 100) : 0;
  const packMetaDirty =
    packName !== (selectedPack?.name || "") ||
    packVersion !== (selectedPack?.version || "") ||
    packLocale !== (selectedPack?.locale || "") ||
    packAuthor !== (selectedPack?.author || "") ||
    packDescription !== (selectedPack?.description || "");
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
          <div className="audio-kicker">Voice Pack Config</div>
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
              Download template zip
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
              {selectedBannerUrl ? (
                <img className="audio-banner-image" src={selectedBannerUrl} alt={`${selectedEvent.label} banner`} />
              ) : (
                <div className="audio-banner-card" style={{ ["--accent" as any]: selectedEvent.accent }}>
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
