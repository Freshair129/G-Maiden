import { useId, useState, type FormEvent } from "react";
import { PartyMembers } from "./PartyMembers";
import { PARTY_STATUS_LABELS, validatePartyConnection } from "./partyModel";
import { useParty, type PartyController } from "./useParty";
import "./party.css";

function ConnectionForm({ connect }: Pick<PartyController, "connect">) {
  const id = useId();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [relayUrl, setRelayUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [invite, setInvite] = useState("");
  const [consent, setConsent] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validatePartyConnection({ relayUrl, displayName, invite: mode === "join" ? invite : null, consent });
    if (!result.ok) { setValidationError(result.error); return; }
    setValidationError(null);
    void connect(result.value);
  };

  const changeMode = (next: "create" | "join") => {
    setMode(next);
    setConsent(false);
    setValidationError(null);
  };

  return (
    <form className="g-party-form" onSubmit={submit} autoComplete="off">
      <div className="g-party-mode" role="group" aria-label="วิธีเข้าปาร์ตี้">
        <button type="button" aria-pressed={mode === "create"} onClick={() => changeMode("create")}>สร้างปาร์ตี้</button>
        <button type="button" aria-pressed={mode === "join"} onClick={() => changeMode("join")}>เข้าร่วมปาร์ตี้</button>
      </div>
      <label className="g-party-field" htmlFor={`${id}-relay`}>
        URL ของ relay
        <input id={`${id}-relay`} name="relayUrl" type="url" value={relayUrl}
          onChange={(event) => setRelayUrl(event.target.value)} placeholder="https://relay.example"
          autoComplete="off" autoCapitalize="none" spellCheck={false} required aria-describedby={`${id}-relay-note`} />
      </label>
      <p id={`${id}-relay-note`} className="g-party-note">ใช้ relay เดียวกับเพื่อน · HTTPS สำหรับใช้งานข้ามเครื่อง; HTTP เฉพาะ 127.0.0.1 หรือ [::1] สำหรับทดสอบในเครื่อง</p>
      <label className="g-party-field" htmlFor={`${id}-name`}>
        ชื่อเล่นที่สมาชิกจะเห็น
        <input id={`${id}-name`} name="displayName" value={displayName}
          onChange={(event) => setDisplayName(event.target.value)} placeholder="ชื่อเล่นของคุณ"
          autoComplete="off" required aria-describedby={`${id}-name-note`} />
      </label>
      <p id={`${id}-name-note`} className="g-party-note">ไม่เกิน 32 ตัวอักษร · ไม่ต้องใช้ชื่อจริงหรือบัญชี Google</p>
      {mode === "join" && <label className="g-party-field" htmlFor={`${id}-invite`}>
        รหัสเชิญ
        <input id={`${id}-invite`} name="invite" value={invite}
          onChange={(event) => setInvite(event.target.value)} placeholder="GMP1.…"
          autoComplete="off" autoCapitalize="none" spellCheck={false} required />
      </label>}
      <label className="g-party-consent" htmlFor={`${id}-consent`}>
        <input id={`${id}-consent`} name="consent" type="checkbox" checked={consent}
          onChange={(event) => setConsent(event.target.checked)} />
        <span>ฉันยินยอมแชร์ GSI ของตัวเอง: ฮีโร่ เลเวล HP/HP สูงสุด MP% สถานะชีวิต เวลาเกิด และข้อมูลจับคู่แมตช์/ทีมเฉพาะห้อง ผ่าน relay นี้ให้สมาชิกปาร์ตี้ จนกว่าจะออก</span>
      </label>
      <p className="g-party-note">relay เห็นข้อมูลที่แชร์ สมาชิกส่งค่าจากเครื่องตนเอง ระบบไม่ใช่การยืนยันสมาชิกปาร์ตี้จาก Dota 2 ไม่บันทึกรหัสเชิญหรือเชื่อมต่อเองเมื่อเปิดแอป</p>
      {validationError && <p className="g-party-feedback" role="alert">{validationError}</p>}
      <button type="submit" className="g-party-primary" disabled={!consent}>
        {mode === "create" ? "สร้างและเริ่มแชร์" : "เข้าร่วมและเริ่มแชร์"}
      </button>
    </form>
  );
}

export default function GPartyPage() {
  const party = useParty();
  const inviteId = useId();
  const isOwner = party.view.selfId !== null && party.view.selfId === party.view.ownerId;
  const connected = party.view.status === "connected";
  const remainingMs = party.view.expiresInMs === null ? null : Math.max(0, party.view.expiresInMs - party.elapsedMs);

  return (
    <section className="g-party" aria-labelledby="g-party-title">
      <div className="g-party-header">
        <div className="g-party-intro">
          <h2 id="g-party-title">G-Party · สถานะเพื่อนที่แชร์ GSI</h2>
          <p className="g-party-description">สถานะจาก GSI ของสมาชิกที่ยินยอมแชร์ แสดงค่าเมื่อแมตช์และทีมตรงกัน และข้อมูลไม่เกิน 2 วินาที</p>
        </div>
        <span className="g-party-status" role="status" data-ready={connected}>
          {party.busy === "leave" ? "กำลังหยุดแชร์" : PARTY_STATUS_LABELS[party.view.status]}
        </span>
      </div>
      {party.error && <p className="g-party-feedback" role="alert">{party.error}</p>}
      {!party.canLeave && <ConnectionForm connect={party.connect} />}
      {party.canLeave && <section className="g-party-session" aria-label="จัดการปาร์ตี้">
        <div className="g-party-actions">
          <div>
            <h3>ปาร์ตี้ของคุณ · {party.view.members.length} / 5 คน</h3>
            <p className="g-party-note">{remainingMs === null ? "กำลังตรวจสถานะห้อง" : `ห้องหมดอายุภายใน ${Math.ceil(remainingMs / 60_000)} นาที`}</p>
          </div>
          <button type="button" className="g-party-danger" onClick={() => void party.leave()} disabled={party.busy === "leave"}>
            ออกและหยุดแชร์
          </button>
        </div>
        {isOwner && connected && <>
          {party.view.invite && <label className="g-party-field" htmlFor={inviteId}>
            รหัสเชิญสำหรับเพื่อน
            <input id={inviteId} value={party.view.invite} readOnly autoComplete="off" spellCheck={false}
              onFocus={(event) => event.currentTarget.select()} />
          </label>}
          <div className="g-party-actions">
            <button type="button" onClick={() => void party.rotateInvite()} disabled={party.busy !== null}>เปลี่ยนรหัสเชิญ</button>
            <p className="g-party-note">รหัสใหม่ปิดการเข้าด้วยรหัสเดิม แต่ไม่เอาสมาชิกปัจจุบันออก</p>
          </div>
          <p className="g-party-note">เมื่อนำสมาชิกออก ควรเปลี่ยนรหัสเชิญด้วย ผู้ที่รู้รหัสเดิมอาจเข้าร่วมซ้ำได้ · เจ้าของออกจะปิดปาร์ตี้</p>
        </>}
        <p className="g-party-note">เมื่อออกขณะออฟไลน์ ข้อมูลสุขภาพที่เพื่อนเห็นจะหมดอายุภายใน 2 วินาที และสมาชิกภายใน 30 วินาที</p>
      </section>}
      <section className="g-party-section" aria-label="ข้อมูลสมาชิก">
        <div className="g-party-section-heading"><h3>สถานะสมาชิก</h3><span className="g-party-note">ค่าที่ไม่ทราบจะแสดง —</span></div>
        <PartyMembers view={party.view} elapsedMs={party.elapsedMs}
          onKick={isOwner && connected ? (memberId) => void party.kick(memberId) : undefined}
          disabled={party.busy !== null} />
      </section>
    </section>
  );
}
