import { PartyMembers } from "./PartyMembers";
import { PARTY_STATUS_LABELS } from "./partyModel";
import { useParty } from "./useParty";
import "./party.css";

export function PartyStrip() {
  const party = useParty();
  return (
    <section className="g-party-strip" aria-label="G-Party ข้างแผนที่">
      <div className="g-party-section-heading">
        <h3>G-Party · สถานะเพื่อน</h3>
        <span className="g-party-status" data-ready={party.view.status === "connected"}>
          {party.busy === "leave" ? "กำลังหยุดแชร์" : PARTY_STATUS_LABELS[party.view.status]}
        </span>
        {party.canLeave && <button type="button" className="g-party-danger" disabled={party.busy === "leave"} onClick={() => void party.leave()}>ออกและหยุดแชร์</button>}
      </div>
      {party.error && <p className="g-party-feedback" role="alert">{party.error}</p>}
      {party.canLeave ? <>
        <PartyMembers view={party.view} elapsedMs={party.elapsedMs} compact />
        <p className="g-party-note">จัดการสมาชิกในแท็บ G-Party · ค่าเกิน 2 วินาทีจะแสดงเป็นไม่ทราบ</p>
      </> : <p className="g-party-note">เปิดแท็บ G-Party เพื่อสร้างหรือเข้าร่วมปาร์ตี้ด้วยความยินยอมของคุณ</p>}
    </section>
  );
}
