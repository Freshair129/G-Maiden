import { useId, useState, type FormEvent, type ReactNode } from "react";
import { socialGid, type SocialInvite } from "./friendsModel";
import type { FriendsController } from "./useFriends";
import type { PartyController } from "./useParty";
import "./friends.css";

function Collection({ title, count, children, hidden = false }: { title: string; count: string; children: ReactNode; hidden?: boolean }) {
  return <section className="g-friends-collection" hidden={hidden}><h4>{title}<span>{count}</span></h4><ul className="g-friends-list" tabIndex={0} aria-label={title}>{children}</ul></section>;
}
function Invitation({ invite, friends, party }: { invite: SocialInvite; friends: FriendsController; party: PartyController }) {
  const id = useId();
  const [consent, setConsent] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const remainingSeconds = Math.max(0, Math.ceil((invite.expiresAtMs - (friends.nowMs ?? invite.expiresAtMs)) / 1000));
  const canJoin = !party.canLeave && !party.busy && ["idle", "closed"].includes(party.view.status);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const checked = consent; setConsent(false);
    if (checked && canJoin) void friends.acceptInvite(invite.id, displayName, true);
  };
  return <li className="g-friends-invitation">
    <span className="g-friends-person">{invite.person.displayName}<code>{invite.person.gid}</code></span>
    <span className="g-friends-meta">หมดอายุใน {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")} · relay {friends.state?.relayOrigin ?? "ยังไม่พร้อมใช้งาน"}</span>
    <span className="g-friends-meta">{invite.direction === "incoming" ? "คำเชิญที่ได้รับ" : "คำเชิญที่ส่ง"} · {invite.status === "pending" ? "รอตอบรับ" : "อนุมัติบัตรเข้าห้องแล้ว · รอยืนยันการเข้าห้อง"}</span>
    {invite.direction === "outgoing" ? <button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "invite_revoke", inviteId: invite.id })}>ยกเลิกคำเชิญ</button>
      : <>
        <button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "invite_decline", inviteId: invite.id })}>ปฏิเสธคำเชิญ</button>
        {!canJoin && <p className="g-friends-note">กรุณาออกจากห้องปัจจุบันก่อน แล้วตอบรับพร้อมให้ความยินยอมใหม่</p>}
        <form onSubmit={submit} autoComplete="off">
          <label htmlFor={`${id}-name`}>ชื่อเล่นในห้อง<input id={`${id}-name`} name="inviteDisplayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required disabled={!canJoin || friends.busy} /></label>
          <label className="g-friends-check" htmlFor={`${id}-consent`}>
            <input id={`${id}-consent`} type="checkbox" name="inviteConsent" checked={consent} disabled={!canJoin || friends.busy} onChange={(e) => setConsent(e.target.checked)} />
            <span>ฉันยินยอมแชร์ GSI ของตัวเอง: ฮีโร่ เลเวล HP/HP สูงสุด MP% สถานะชีวิต เวลาเกิด และข้อมูลจับคู่แมตช์/ทีมเฉพาะห้อง ผ่าน relay นี้ให้สมาชิกปาร์ตี้ จนกว่าจะออก</span>
          </label>
          <p className="g-friends-note">relay เห็นข้อมูลที่แชร์ สมาชิกส่งค่าจากเครื่องตนเอง ระบบไม่ใช่การยืนยันสมาชิกปาร์ตี้จาก Dota 2 ทุกครั้งที่ลองเข้าห้องต้องให้ความยินยอมใหม่</p>
          <button type="submit" data-join disabled={!canJoin || !consent || friends.busy || !friends.state?.relayOrigin}>เข้าร่วมและเริ่มแชร์</button>
        </form>
      </>}
  </li>;
}
export function FriendsPanel({ friends, party }: { friends: FriendsController | null; party: PartyController }) {
  const id = useId(); const [tab, setTab] = useState<"friends" | "requests" | "invites" | "privacy">("friends"); const [gid, setGid] = useState(""); const [inputError, setInputError] = useState<string | null>(null);
  const state = friends?.ready ? friends.state : null;
  const request = async (event: FormEvent) => {
    event.preventDefault();
    const exactGid = gid.trim().toUpperCase();
    if (!socialGid(exactGid)) { setInputError("กรุณาระบุ GID เต็มที่ถูกต้อง รวมอักขระตรวจสอบ"); return; }
    setInputError(null); if (await friends?.mutate({ action: "request", gid: exactGid })) setGid("");
  };
  return <section className="g-friends" aria-labelledby={`${id}-title`}>
    <header className="g-friends-heading"><div><h3 id={`${id}-title`}>Friends</h3></div><span className="g-friends-account">{state ? state.self.gid : "บัญชี Google เป็นทางเลือก"}</span></header>
    {!state || !friends ? <p className="g-friends-note">{friends?.signedIn ? "Friends ไม่พร้อมใช้งาน กรุณาลองอีกครั้งเมื่อบัญชีและบริการพร้อม" : "เข้าสู่ระบบด้วย Google เพื่อใช้รายชื่อ Friends แบบถาวร ยังสร้างหรือเข้าห้องด้วยรหัสได้โดยไม่ต้องเข้าสู่ระบบ"}</p> : <>
      <nav className="g-friends-tabs" aria-label="รายการ Friends">
        {([ ["friends", `เพื่อน ${state.friends.length}`], ["requests", `คำขอ ${state.requests.length}`], ["invites", `คำเชิญ ${state.invites.length}`], ["privacy", "ความเป็นส่วนตัว"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}
      </nav>
      <div className="g-friends-controls">
        <div className="g-friends-preferences" hidden={tab !== "privacy"} role="group" aria-label="ความเป็นส่วนตัวของ Friends">
          <label className="g-friends-check"><input type="checkbox" name="presenceVisible" checked={state.settings.presenceVisible} disabled={friends.busy} onChange={(e) => void friends.setPresence(e.target.checked)} /><span>แสดงว่าฉันออนไลน์ในแอป</span></label>
          <p className="g-friends-note">ปิดเป็นค่าเริ่มต้น สถานะออนไลน์หมดอายุเมื่อแอปหยุดยืนยัน ไม่มีเวลาออนไลน์ล่าสุดหรือข้อมูลกิจกรรมในแมตช์</p>
          <label className="g-friends-check"><input type="checkbox" checked={state.settings.allowFriendRequests} disabled={friends.busy} onChange={(e) => void friends.setSettings({ ...state.settings, allowFriendRequests: e.target.checked })} /><span>รับคำขอเป็นเพื่อน</span></label>
          <label className="g-friends-check"><input type="checkbox" checked={state.settings.allowInvites} disabled={friends.busy} onChange={(e) => void friends.setSettings({ ...state.settings, allowInvites: e.target.checked })} /><span>รับคำเชิญเข้าห้อง</span></label>
        </div>
        <details hidden={tab !== "friends"} className="g-friends-request-entry"><summary>เพิ่มเพื่อนด้วย GID</summary><form className="g-friends-request" onSubmit={(e) => void request(e)} autoComplete="off"><label htmlFor={`${id}-gid`}>ระบุ GID เต็มของเพื่อน<input id={`${id}-gid`} name="friendGid" value={gid} onChange={(e) => setGid(e.target.value)} placeholder="G-…" autoCapitalize="characters" spellCheck={false} required /></label><button type="submit" disabled={friends.busy}>ส่งคำขอเป็นเพื่อน</button><p className="g-friends-note">ใช้ GID ที่เพื่อนส่งให้ ไม่มีระบบค้นหารายชื่อสาธารณะ</p>{inputError && <p className="g-friends-feedback" role="status">{inputError}</p>}</form></details>
      </div>
      <div className="g-friends-link" hidden={tab !== "privacy"}>
        {!state.relayOrigin ? <p className="g-friends-note">การเชื่อมโปรไฟล์กับห้องและคำเชิญเฉพาะบุคคลยังไม่พร้อมใช้งาน เนื่องจากยังไม่ได้ตั้งค่า social relay</p>
          : friends.roomAvailable ? <><label className="g-friends-check"><input type="checkbox" name="linkProfile" checked={friends.linked} disabled={!friends.linkAvailable || friends.busy} onChange={(e) => void friends.setLink(e.target.checked)} /><span>เชื่อมโปรไฟล์ของฉันกับห้องนี้</span></label><p className="g-friends-note">แสดง GID ที่ยืนยันการเชื่อมแล้วคู่กับชื่อเล่นเฉพาะห้องนี้ ต้องให้ความยินยอมใหม่เมื่อเปลี่ยนบัญชี เปลี่ยนห้อง หรือเปลี่ยนรหัสเชิญ</p><button type="button" disabled={friends.busy} onClick={() => void friends.setLink(false)}>ยกเลิกการเชื่อมโปรไฟล์</button>{friends.bindings.some((b) => b.memberId === party.view.selfId && b.person.gid !== state.self.gid) && <p className="g-friends-note">สมาชิกนี้เชื่อมกับบัญชีอื่นอยู่ กรุณายกเลิกการเชื่อมจากบัญชีนั้น หรือรอให้สิทธิ์หมดอายุ</p>}</>
            : <p className="g-friends-note">เข้าห้องบน relay ที่ตั้งค่าไว้เพื่อเชื่อมโปรไฟล์หรือเชิญ Friends ยังใช้ relay อื่นสำหรับห้องแบบรหัสได้</p>}
      </div>
      <div className="g-friends-collections">
        <Collection hidden={tab !== "friends"} title="Friends" count={`${state.friends.length} / 200`}>
          {state.friends.length === 0 && <li className="g-friends-empty">เพื่อนที่ตอบรับแล้วจะแสดงที่นี่</li>}
          {state.friends.map((person) => <li key={person.gid}><span className="g-friends-person">{person.displayName}<code>{person.gid}</code></span><span className="g-friends-presence" data-online={person.online}>{person.online ? "ออนไลน์ในแอป" : "ออฟไลน์ / ยังไม่ทราบ"}</span><div className="g-friends-row-actions">{friends.roomAvailable && party.view.selfId === party.view.ownerId && <button type="button" disabled={friends.busy} onClick={() => void friends.invite(person.gid)}>เชิญเข้าห้อง</button>}<details className="g-friends-more"><summary>เพิ่มเติม</summary><div><button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "remove", gid: person.gid })}>เลิกเป็นเพื่อน</button><button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "block", gid: person.gid })}>บล็อก</button></div></details></div></li>)}
        </Collection>
        <Collection hidden={tab !== "requests"} title="คำขอ" count={`${state.requests.length} / 50`}>
          {state.requests.length === 0 && <li className="g-friends-empty">ไม่มีคำขอที่รอตอบรับ</li>}
          {state.requests.map((r) => <li key={r.id}><span className="g-friends-person">{r.person.displayName}<code>{r.person.gid}</code></span><span className="g-friends-meta">{r.direction === "incoming" ? "คำขอที่ได้รับ" : "คำขอที่ส่ง"}</span><div className="g-friends-row-actions">{r.direction === "incoming" ? <><button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "request_accept", requestId: r.id })}>รับคำขอ</button><button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "request_decline", requestId: r.id })}>ปฏิเสธคำขอ</button></> : <button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "request_cancel", requestId: r.id })}>ยกเลิกคำขอ</button>}<button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "block", gid: r.person.gid })}>บล็อก</button></div></li>)}
        </Collection>
        <Collection key={tab} hidden={tab !== "invites"} title="คำเชิญ" count={`${state.invites.length} / 100`}>
          {state.invites.length === 0 && <li className="g-friends-empty">ไม่มีคำเชิญเข้าห้องที่ยังใช้งานได้</li>}
          {state.invites.map((invite) => <Invitation key={invite.id} invite={invite} friends={friends} party={party} />)}
        </Collection>
        <Collection hidden={tab !== "privacy"} title="บัญชีที่บล็อก" count={`${state.blocked.length} / 500`}>
          {state.blocked.length === 0 && <li className="g-friends-empty">ไม่มีบัญชีที่บล็อกไว้</li>}
          {state.blocked.map((p) => <li key={p.gid}><span className="g-friends-person">{p.displayName}<code>{p.gid}</code></span><button type="button" disabled={friends.busy} onClick={() => void friends.mutate({ action: "unblock", gid: p.gid })}>เลิกบล็อก</button></li>)}
        </Collection>
      </div>
      <p hidden={tab !== "privacy"} className="g-friends-note">การเลิกเป็นเพื่อนหรือบล็อกไม่ได้เอาสมาชิกออกจากห้อง ใช้ปุ่มออกจากห้อง หรือให้เจ้าของนำสมาชิกออกและเปลี่ยนรหัสเชิญแยกต่างหาก การเลิกบล็อกไม่ทำให้กลับมาเป็นเพื่อน</p>
    </>}
    {friends?.error && <p className="g-friends-feedback" role="status">{friends.error}</p>}
    {friends?.signedIn && <button type="button" disabled={friends.busy} onClick={() => void friends.refresh()}>โหลด Friends อีกครั้ง</button>}
  </section>;
}
