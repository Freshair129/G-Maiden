import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useGmadDesktopEntitlement } from "./gmadEntitlement";
import { checkChannelUpdate, resolveUpdateChannel, type ResolvedUpdateChannel } from "./updateChannel";
import { buildDiagnosticBundle, compatibilityMode, readinessFromRuntime } from "./betaReadiness";
import { APP_VERSION } from "./app/theme";
import BetaFeedback from "./BetaFeedback";
import type { MinimapCv } from "./live/events";

type SetupStatus = { installed: boolean; dota_cfg_dir?: string | null; message: string };
type UpdateStatus = { resolved: ResolvedUpdateChannel; availableVersion?: string; error?: string };

export default function GmadFirstRunGate({ children }: { children: ReactNode }) {
  const { state, decision, refresh, signInWithGoogle, signOut, authError } = useGmadDesktopEntitlement();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dotaRunning, setDotaRunning] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [captureMode, setCaptureMode] = useState<"dxgi" | "lite" | "">("");
  const [gsiActive, setGsiActive] = useState<boolean | null>(null);
  const [minimapReady, setMinimapReady] = useState<boolean | null>(null);
  const [audioReady] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const subscriptions = Promise.all([
      listen<"dxgi" | "lite">("capture-mode", (event) => { if (active) setCaptureMode(event.payload); }),
      listen<{ gsi_active?: boolean }>("gsi-status", (event) => { if (active) setGsiActive(event.payload.gsi_active ?? null); }),
      listen<MinimapCv>("minimap-cv", (event) => { if (active) setMinimapReady(event.payload.classifier === true); }),
    ]);
    return () => { active = false; void subscriptions.then((unlisten) => Promise.all(unlisten.map((stop) => stop()))); };
  }, []);

  useEffect(() => {
    const resolved = resolveUpdateChannel(decision);
    if (state !== "eligible") {
      setUpdateStatus({ resolved });
      return;
    }
    let cancelled = false;
    void checkChannelUpdate(resolved.channel)
      .then((update) => {
        const version = update?.version === "0.0.0" ? undefined : update?.version;
        if (!cancelled) setUpdateStatus({ resolved, availableVersion: version });
      })
      .catch(() => {
        if (!cancelled) setUpdateStatus({ resolved, error: "update-check-failed" });
      });
    return () => { cancelled = true; };
  }, [decision, state]);

  useEffect(() => {
    if (state !== "eligible") { setReady(false); setSetup(null); setDotaRunning(null); return; }
    void Promise.all([
      invoke<SetupStatus>("detect_gsi_setup"),
      invoke<boolean>("detect_dota_running"),
    ]).then(([nextSetup, running]) => {
      setSetup(nextSetup);
      setDotaRunning(running);
    }).catch(() => {
      setSetup({ installed: false, message: "ไม่สามารถตรวจสถานะ Dota 2 ได้ กรุณาลองใหม่" });
      setDotaRunning(null);
    });
  }, [state]);

  if (state === "eligible" && ready) return <>{children}</>;

  const installGsi = async () => {
    setSetupBusy(true);
    try { setSetup(await invoke<SetupStatus>("install_gsi_config")); }
    finally { setSetupBusy(false); }
  };
  const openLanding = (path: string) => invoke("open_url", { url: `https://g-maiden-landing.vercel.app${path}` });

  // The deck's only drag region lives in CommandDeck, which is not mounted while
  // this gate is up — without this the window cannot be moved at all on first
  // run. Native drag region only; children (the card's buttons) are unaffected
  // because Tauri arms the drag from the element carrying the attribute.
  return <main className="gmad-first-run" aria-live="polite" data-tauri-drag-region="">
    <section className="gmad-first-run-card">
      <p className="gmad-first-run-kicker">GMAD CLOSED BETA</p>
      {state === "loading" && <><h1>กำลังตรวจสอบสิทธิ์</h1><p>กำลังยืนยันบัญชี Google และสิทธิ์ Closed Beta จากเซิร์ฟเวอร์</p></>}
      {state === "signing_in" && <><h1>กำลังเข้าสู่ระบบ</h1><p>ดำเนินการต่อในเบราว์เซอร์ ระบบจะกลับมาที่ G-Maiden เมื่อ Google OAuth สำเร็จ โดยจะไม่แสดงหรือบันทึกรหัส OAuth</p></>}
      {state === "sign_in_required" && <><h1>เข้าสู่ระบบด้วย Google</h1><p>ใช้บัญชีเดียวกับที่ได้รับ GID และสิทธิ์ดาวน์โหลด ไม่ต้องกรอก GID ซ้ำ</p><button onClick={() => void signInWithGoogle()}>ดำเนินการต่อด้วย Google</button></>}
      {state === "sign_in_required" && authError && <p className="gmad-first-run-error">เข้าสู่ระบบไม่สำเร็จ: {authError}</p>}
      {state === "terms_required" && <><h1>ต้องยอมรับ Terms เวอร์ชันปัจจุบัน</h1><p>GID: {decision?.gid}</p><button onClick={() => void openLanding("/terms?from=desktop")}>อ่านและยอมรับบน Landing</button><button className="secondary" onClick={() => void refresh()}>ตรวจอีกครั้ง</button></>}
      {state === "no_active_entitlement" && <><h1>ยังไม่มีสิทธิ์ Closed Beta ที่ใช้งานได้</h1><p>บัญชีนี้ยืนยันเป็น {decision?.gid} แล้ว แต่ไม่มี active grant</p><button onClick={() => void openLanding("/#gmad")}>เปิดหน้าตรวจสิทธิ์</button><button className="secondary" onClick={() => void signOut()}>ใช้บัญชี Google อื่น</button></>}
      {state === "account_not_eligible" && <><h1>บัญชี Google นี้ไม่ใช่บัญชีที่ได้รับสิทธิ์</h1><p>ระบบไม่รับ GID ที่กรอกเองและไม่แสดงข้อมูลของบัญชีอื่น</p><button onClick={() => void signOut()}>ออกจากระบบแล้วใช้บัญชีเดิม</button></>}
      {state === "offline_or_unavailable" && <><h1>ยังยืนยันสิทธิ์ไม่ได้</h1><p>Closed Beta ต้องเชื่อมต่ออินเทอร์เน็ตทุกครั้งที่เปิดแอป ข้อมูล GSI, CV และ G-Log ในเครื่องไม่ถูกส่งขึ้น cloud</p><button onClick={() => void refresh()}>ลองอีกครั้ง</button></>}
      {state === "eligible" && <><h1>ยืนยันสิทธิ์แล้ว</h1><p>{decision?.gid} · Terms {decision?.terms?.version} · ตรวจล่าสุด {decision?.checked_at ? new Date(decision.checked_at).toLocaleString("th-TH") : "—"}{decision?.stale ? " · ออฟไลน์ชั่วคราว — ใช้สิทธิ์ที่ยืนยันไว้ล่าสุด" : ""}</p>
        {(() => {
          const readiness = readinessFromRuntime({ gsiInstalled: setup?.installed === true, gsiActive, captureMode, minimapReady, audioReady });
          const diagnostic = () => {
            const bundle = buildDiagnosticBundle({ version: APP_VERSION, channel: updateStatus?.resolved.channel ?? "stable", readiness, updateStatus: updateStatus?.availableVersion ? `available:${updateStatus.availableVersion}` : updateStatus?.error ?? "current" });
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `g-maiden-diagnostics-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url);
          };
          return <>
            {compatibilityMode(readiness) && <div className="gmad-setup-status"><strong>Compatibility Mode — Vision features unavailable</strong><span>G-Sentry, G-Motion และ minimap vision จะไม่ทำงานจนกว่า DXGI จะพร้อม; GSI-based features ยังทำงานได้</span></div>}
            <div className="gmad-setup-status"><strong>Wave 0 readiness</strong><span>GSI {readiness.gsi} · Capture {readiness.capture} · Minimap {readiness.minimap} · Overlay {readiness.overlay} · Audio {readiness.audio}</span></div>
            <button className="secondary" onClick={diagnostic}>สร้าง diagnostic bundle (ไม่รวม credentials, tokens หรือ raw frames)</button>
            <BetaFeedback version={APP_VERSION} channel={updateStatus?.resolved.channel ?? "stable"} readiness={readiness} updateStatus={updateStatus?.availableVersion ? `available:${updateStatus.availableVersion}` : updateStatus?.error ?? "current"} />
          </>;
        })()}
        <div className="gmad-setup-status"><strong>Update channel: {updateStatus?.resolved.channel ?? "stable"}</strong><span>Source: {updateStatus?.resolved.source ?? "stable-fallback"}{updateStatus?.availableVersion ? ` · มีเวอร์ชัน ${updateStatus.availableVersion}` : updateStatus?.error ? " · ตรวจอัปเดตไม่สำเร็จ" : " · เวอร์ชันล่าสุด"}</span></div>
        <div className="gmad-setup-status"><strong>{setup?.installed ? "GSI พร้อมใช้งาน" : "ตั้งค่า GSI/Dota 2"}</strong><span>{setup?.message ?? "กำลังตรวจ Dota 2…"}</span></div>
        {dotaRunning === false && <div className="gmad-setup-status"><strong>ยังไม่พบ Dota 2 ที่กำลังทำงาน</strong><span>เปิด Dota 2 แบบ borderless fullscreen แล้วกลับมากดตรวจอีกครั้งได้ สิทธิ์ Closed Beta ของคุณยังยืนยันแล้ว</span></div>}
        {!setup?.installed && setup?.dota_cfg_dir && <button disabled={setupBusy} onClick={() => void installGsi()}>{setupBusy ? "กำลังติดตั้ง…" : "ติดตั้ง GSI config"}</button>}
        <button className="secondary" onClick={() => void Promise.all([invoke<SetupStatus>("detect_gsi_setup").then(setSetup), invoke<boolean>("detect_dota_running").then(setDotaRunning)])}>ตรวจ Dota/GSI อีกครั้ง</button>
        <button className="secondary" onClick={() => setReady(true)}>{setup?.installed ? "เปิด Dashboard" : "เข้า Dashboard และตั้งค่าภายหลัง"}</button>
      </>}
    </section>
  </main>;
}
