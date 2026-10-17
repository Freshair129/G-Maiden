import { useEffect, useState, type ReactNode } from "react";
import "./gmadFirstRun.css";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { GmadEntitlementContext, useGmadDesktopEntitlement } from "./gmadEntitlement";
import { checkChannelUpdate, resolveUpdateChannel, type ResolvedUpdateChannel } from "./updateChannel";
import { buildDiagnosticBundle, compatibilityMode, readinessFromRuntime, readinessLabel } from "./betaReadiness";
import { APP_VERSION } from "./app/theme";
import BetaFeedback from "./BetaFeedback";
import type { GsiStatus, SensorHealth } from "./live/events";

type SetupStatus = { installed: boolean; cfg_present?: boolean; cfg_valid?: boolean; dota_cfg_dir?: string | null; message: string };
type UpdateStatus = { resolved: ResolvedUpdateChannel; availableVersion?: string; error?: string };

export default function GmadFirstRunGate({ children }: { children: ReactNode }) {
  const entitlement = useGmadDesktopEntitlement();
  const { state, decision, refresh, signInWithGoogle, signOut, authError, signOutWarning } = entitlement;
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dotaRunning, setDotaRunning] = useState<boolean | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [gsiActive, setGsiActive] = useState<boolean | null>(null);
  const [gsiStatus, setGsiStatus] = useState<GsiStatus | null>(null);
  const [sensorHealth, setSensorHealth] = useState<SensorHealth | null>(null);
  const [overlayReady, setOverlayReady] = useState(false);

  useEffect(() => {
    let active = true;
    const subscriptions = Promise.all([
      listen<GsiStatus>("gsi-status", (event) => {
        if (active) {
          setGsiActive(event.payload.gsi_active ?? null);
          setGsiStatus(event.payload);
          setDotaRunning(event.payload.dota_running);
        }
      }),
      listen<SensorHealth>("sensor-health", (event) => { if (active) setSensorHealth(event.payload); }),
      listen("overlay-ready", () => { if (active) setOverlayReady(true); }),
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
    if (state !== "eligible") { setReady(false); setSetup(null); setSetupError(null); setDotaRunning(null); return; }
    void Promise.all([
      invoke<SetupStatus>("detect_gsi_setup"),
      invoke<boolean>("detect_dota_running"),
    ]).then(([nextSetup, running]) => {
      setSetup(nextSetup);
      setSetupError(null);
      setDotaRunning(running);
    }).catch(() => {
      setSetup(null);
      setSetupError("ไม่สามารถตรวจสถานะ GSI/Dota 2 ได้ กรุณาลองใหม่");
      setDotaRunning(null);
    });
  }, [state]);

  if (state === "eligible" && ready) return <GmadEntitlementContext.Provider value={entitlement}>{children}</GmadEntitlementContext.Provider>;

  const installGsi = async () => {
    setSetupBusy(true);
    try {
      setSetup(await invoke<SetupStatus>("install_gsi_config"));
      setSetupError(null);
    } catch {
      setSetupError("ติดตั้งหรือซ่อม GSI config ไม่สำเร็จ กรุณาลองใหม่");
    }
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
      {state === "sign_in_required" && <><h1>เข้าสู่ระบบด้วย Google</h1><p>ใช้บัญชีเดียวกับที่ได้รับ GID และสิทธิ์ดาวน์โหลด ไม่ต้องกรอก GID ซ้ำ</p><button className="gmad-first-run-primary" type="button" onClick={() => void signInWithGoogle()}>ดำเนินการต่อด้วย Google</button></>}
      {authError && <p role="alert" className="gmad-first-run-error">{authError}</p>}
      {signOutWarning && <p role="status">{signOutWarning}</p>}
      {state === "signing_out" && <><h1>กำลังออกจากระบบ</h1><p>กำลังล้างข้อมูลเข้าสู่ระบบในเครื่อง</p></>}
      {state === "sign_out_required" && <><h1>ยังล้างข้อมูลเข้าสู่ระบบไม่สำเร็จ</h1><button onClick={() => void signOut()}>ลองออกจากระบบอีกครั้ง</button></>}
      {state === "terms_required" && <><h1>ต้องยอมรับ Terms เวอร์ชันปัจจุบัน</h1><p>GID: {decision?.gid}</p><button onClick={() => void openLanding("/terms?from=desktop")}>อ่านและยอมรับบน Landing</button><button className="secondary" onClick={() => void refresh()}>ตรวจอีกครั้ง</button></>}
      {state === "no_active_entitlement" && <><h1>ยังไม่มีสิทธิ์ Closed Beta ที่ใช้งานได้</h1><p>บัญชีนี้ยืนยันเป็น {decision?.gid} แล้ว แต่ไม่มี active grant</p><button onClick={() => void openLanding("/#gmad")}>เปิดหน้าตรวจสิทธิ์</button><button className="secondary" onClick={() => void signOut()}>ใช้บัญชี Google อื่น</button></>}
      {state === "account_not_eligible" && <><h1>บัญชี Google นี้ไม่ใช่บัญชีที่ได้รับสิทธิ์</h1><p>ระบบไม่รับ GID ที่กรอกเองและไม่แสดงข้อมูลของบัญชีอื่น</p><button onClick={() => void signOut()}>ออกจากระบบแล้วใช้บัญชีเดิม</button></>}
      {state === "offline_or_unavailable" && <><h1>ยังยืนยันสิทธิ์ไม่ได้</h1><p>Closed Beta ต้องเชื่อมต่ออินเทอร์เน็ตทุกครั้งที่เปิดแอป ข้อมูล GSI, CV และ G-Log ในเครื่องไม่ถูกส่งขึ้น cloud</p><button onClick={() => void refresh()}>ลองอีกครั้ง</button></>}
      {state === "eligible" && <><h1>ยืนยันสิทธิ์แล้ว</h1><p>{decision?.gid} · Terms {decision?.terms?.version} · ตรวจล่าสุด {decision?.checked_at ? new Date(decision.checked_at).toLocaleString("th-TH") : "—"}{decision?.stale ? " · ออฟไลน์ชั่วคราว — ใช้สิทธิ์ที่ยืนยันไว้ล่าสุด" : ""}</p>
        {(() => {
          const readiness = readinessFromRuntime({
            gsiConfigured: setup?.installed ?? null,
            gsiStatus,
            sensorHealth,
            overlayReady,
          });
          const diagnostic = () => {
            const bundle = buildDiagnosticBundle({ version: APP_VERSION, channel: updateStatus?.resolved.channel ?? "stable", readiness, updateStatus: updateStatus?.availableVersion ? `available:${updateStatus.availableVersion}` : updateStatus?.error ?? "current" });
            const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = `g-maiden-diagnostics-${Date.now()}.json`; link.click(); URL.revokeObjectURL(url);
          };
          return <>
            {compatibilityMode(readiness) && <div className="gmad-setup-status"><strong>Compatibility Mode — Vision features unavailable</strong><span>ยังใช้ minimap vision ไม่ได้เพราะ capture อยู่ Lite mode หรือไม่มี ONNX classifier; ฟีเจอร์ที่ใช้ GSI ยังทำงานได้</span></div>}
            <div className="gmad-setup-status">
              <strong>Readiness จาก runtime evidence</strong>
              <span>GSI {readinessLabel(readiness.gsi)} · Capture health {readinessLabel(readiness.capture)} · Minimap coverage {readinessLabel(readiness.minimap)} · Overlay runtime {readinessLabel(readiness.overlay)} · Audio playback {readinessLabel(readiness.audio)}</span>
              <span>Minimap coverage และ audio playback ยังไม่ผ่านการตรวจจริงจนกว่าจะมี producer เฉพาะ</span>
            </div>
            <button className="secondary" onClick={diagnostic}>สร้าง diagnostic bundle (ไม่รวม credentials, tokens หรือ raw frames)</button>
            <BetaFeedback version={APP_VERSION} channel={updateStatus?.resolved.channel ?? "stable"} readiness={readiness} updateStatus={updateStatus?.availableVersion ? `available:${updateStatus.availableVersion}` : updateStatus?.error ?? "current"} />
          </>;
        })()}
        <div className="gmad-setup-status"><strong>Update channel: {updateStatus?.resolved.channel ?? "stable"}</strong><span>Source: {updateStatus?.resolved.source ?? "stable-fallback"}{updateStatus?.availableVersion ? ` · มีเวอร์ชัน ${updateStatus.availableVersion}` : updateStatus?.error ? " · ตรวจอัปเดตไม่สำเร็จ" : " · เวอร์ชันล่าสุด"}</span></div>
        <div className="gmad-setup-status">
          <strong>{setup?.installed ? "GSI config ถูกต้อง" : setup?.cfg_present && setup.cfg_valid === false ? "GSI config ไม่ถูกต้อง" : "ตั้งค่า GSI/Dota 2"}</strong>
          <span>{setup?.message ?? setupError ?? "กำลังตรวจ Dota 2…"}</span>
          <span>Listener พอร์ต 3000: {!gsiStatus ? "กำลังตรวจ…" : gsiStatus.server_state === "listening" ? "พร้อมรับ GSI และ OAuth callback" : gsiStatus.server_state === "port_conflict" ? "พอร์ตถูกใช้งาน — ปิด G-Maiden ที่เปิดซ้ำหรือโปรแกรมอื่นที่ใช้พอร์ต 3000; ระบบลองใหม่อัตโนมัติทุก 3 วินาที" : gsiStatus.server_state === "bind_error" ? "เปิดพอร์ตไม่สำเร็จ — ปิดโปรแกรมที่ใช้พอร์ต 3000 แล้วตรวจซ้ำ" : "กำลังเริ่ม listener…"}</span>
          <span>ข้อมูลเกม: {gsiStatus?.gsi_freshness === "stale"
            ? `Dota 2 ยังเปิด แต่ feed GSI ล้าสมัย${gsiStatus.gsi_age_ms === null ? "" : ` ${(gsiStatus.gsi_age_ms / 1000).toFixed(1)} วินาที`}; พักข้อสรุปจาก own-state จน feed กลับมา`
            : gsiActive ? "ได้รับ GSI ล่าสุด · live" : dotaRunning ? "Dota 2 เปิดอยู่ แต่ยังรอข้อมูล GSI; หากเพิ่งติดตั้งหรือซ่อม config ให้ปิดแล้วเปิดเกมใหม่" : "รอเปิด Dota 2"}</span>
        </div>
        {dotaRunning === false && <div className="gmad-setup-status"><strong>ยังไม่พบ Dota 2 ที่กำลังทำงาน</strong><span>เปิด Dota 2 แบบ borderless fullscreen แล้วกลับมากดตรวจอีกครั้งได้ สิทธิ์ Closed Beta ของคุณยังยืนยันแล้ว</span></div>}
        {!setup?.installed && setup?.dota_cfg_dir && <button disabled={setupBusy} onClick={() => void installGsi()}>{setupBusy ? "กำลังติดตั้ง…" : setup?.cfg_present && setup?.cfg_valid === false ? "ซ่อม GSI config" : "ติดตั้ง GSI config"}</button>}
        <button className="secondary" onClick={() => void Promise.all([invoke<SetupStatus>("detect_gsi_setup").then(setSetup), invoke<boolean>("detect_dota_running").then(setDotaRunning)])}>ตรวจ Dota/GSI อีกครั้ง</button>
        <button className="secondary" onClick={() => setReady(true)}>{setup?.installed ? "เปิด Dashboard" : "เข้า Dashboard และตั้งค่าภายหลัง"}</button>
      </>}
    </section>
  </main>;
}
