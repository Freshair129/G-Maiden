import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useGmadDesktopEntitlement } from "./gmadEntitlement";

type SetupStatus = { installed: boolean; dota_cfg_dir?: string | null; message: string };

export default function GmadFirstRunGate({ children }: { children: ReactNode }) {
  const { state, decision, refresh, signInWithGoogle, signOut, authError } = useGmadDesktopEntitlement();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupBusy, setSetupBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dotaRunning, setDotaRunning] = useState<boolean | null>(null);

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

  return <main className="gmad-first-run" aria-live="polite">
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
      {state === "eligible" && <><h1>ยืนยันสิทธิ์แล้ว</h1><p>{decision?.gid} · Terms {decision?.terms?.version} · ตรวจล่าสุด {decision?.checked_at ? new Date(decision.checked_at).toLocaleString("th-TH") : "—"}</p>
        <div className="gmad-setup-status"><strong>{setup?.installed ? "GSI พร้อมใช้งาน" : "ตั้งค่า GSI/Dota 2"}</strong><span>{setup?.message ?? "กำลังตรวจ Dota 2…"}</span></div>
        {dotaRunning === false && <div className="gmad-setup-status"><strong>ยังไม่พบ Dota 2 ที่กำลังทำงาน</strong><span>เปิด Dota 2 แบบ borderless fullscreen แล้วกลับมากดตรวจอีกครั้งได้ สิทธิ์ Closed Beta ของคุณยังยืนยันแล้ว</span></div>}
        {!setup?.installed && setup?.dota_cfg_dir && <button disabled={setupBusy} onClick={() => void installGsi()}>{setupBusy ? "กำลังติดตั้ง…" : "ติดตั้ง GSI config"}</button>}
        <button className="secondary" onClick={() => void Promise.all([invoke<SetupStatus>("detect_gsi_setup").then(setSetup), invoke<boolean>("detect_dota_running").then(setDotaRunning)])}>ตรวจ Dota/GSI อีกครั้ง</button>
        <button className="secondary" onClick={() => setReady(true)}>{setup?.installed ? "เปิด Dashboard" : "เข้า Dashboard และตั้งค่าภายหลัง"}</button>
      </>}
    </section>
  </main>;
}
