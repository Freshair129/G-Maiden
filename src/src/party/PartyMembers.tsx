import type { SocialBinding } from "./friendsModel";
import {
  memberPresentation,
  MEMBER_STATUS_LABELS,
  type PartyMember,
  type PartyStatus,
  type PartyView,
} from "./partyModel";

function heroName(hero: string): string {
  return hero.replace(/^npc_dota_hero_/, "").replace(/_/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function StatMeter({ label, value, max, text, memberName, kind }: {
  label: string;
  value: number | null;
  max: number;
  text: string;
  memberName: string;
  kind: "health" | "mana";
}) {
  return (
    <div className="g-party-stat">
      <div className="g-party-stat-label"><span>{label}</span><strong>{text}</strong></div>
      {value === null
        ? <div className="g-party-unknown">ยังไม่ทราบ</div>
        : <div
          className="g-party-meter"
          data-kind={kind}
          role="meter"
          aria-label={`${label} ของ ${memberName}`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={text}
        ><div className="g-party-meter-fill" style={{ width: `${value / max * 100}%` }} /></div>}
    </div>
  );
}

const COMPACT_STATUS = {
  live: "สด",
  stale: "ข้อมูลเก่า",
  waiting: "รอ GSI",
  different_match: "คนละแมตช์หรือทีม",
  unavailable: "ไม่มีข้อมูลปัจจุบัน",
};

function PartyMemberCard({ member, status, elapsedMs, isSelf, onKick, disabled, compact, binding, onAddFriend, workspace }: {
  workspace: boolean;
  binding?: SocialBinding;
  onAddFriend?: (gid: string) => void;
  member: PartyMember;
  status: PartyStatus;
  elapsedMs: number;
  isSelf: boolean;
  onKick?: (memberId: string) => void;
  disabled: boolean;
  compact: boolean;
}) {
  const presentation = memberPresentation(member, status, elapsedMs);
  const sample = presentation.sample;
  const life = !sample ? "สถานะชีวิต · ยังไม่ทราบ"
    : sample.alive ? "มีชีวิต"
      : sample.respawnSeconds > 0 ? `เสียชีวิต · รอเกิด ${sample.respawnSeconds} วิ`
        : "เสียชีวิต · รอยืนยันการเกิด";

  if (workspace) return <li className="g-party-member g-party-member-workspace" aria-label={`สมาชิก ${member.displayName}`}>
    <div className="g-party-member-heading">
      <span className="g-party-member-name">{member.displayName}{isSelf ? " · คุณ" : ""}</span>
      <span className="g-party-live-label" data-ready={presentation.state === "live"} aria-label={MEMBER_STATUS_LABELS[presentation.state]}>{COMPACT_STATUS[presentation.state]}</span>
      <details className="g-party-member-tools">
        <summary aria-label={`จัดการสมาชิก ${member.displayName}`}>•••</summary>
        <div className="g-party-member-tools-body">
          <span>{member.isOwner ? "เจ้าของห้อง" : "สมาชิกห้อง"}</span>
          {status === "connected" && binding ? <><code aria-label="GID ที่ยืนยันการเชื่อมกับสมาชิกห้อง">{binding.person.gid}</code>{!isSelf && onAddFriend && <button type="button" disabled={disabled} onClick={() => onAddFriend(binding.person.gid)}>เพิ่มเพื่อน</button>}</> : <span>ยังไม่ได้เชื่อมโปรไฟล์ GID</span>}
          {onKick && !isSelf && !member.isOwner && <button type="button" className="g-party-danger" disabled={disabled} aria-label={`นำ ${member.displayName} ออกจากปาร์ตี้`} onClick={() => onKick(member.memberId)}>นำออก</button>}
        </div>
      </details>
    </div>
    <div className="g-party-workspace-hero"><span>{sample ? `${heroName(sample.hero)} · Lv.${sample.level}` : "ฮีโร่ / เลเวล · —"}</span><span>{life}</span></div>
    <div className="g-party-workspace-vitals">
      <StatMeter label="HP" memberName={member.displayName} kind="health" value={sample?.hp ?? null} max={sample?.maxHp ?? 1} text={sample ? `${sample.hp} / ${sample.maxHp}` : "— / —"} />
      <StatMeter label="MP" memberName={member.displayName} kind="mana" value={sample?.manaPercent ?? null} max={100} text={sample ? `${sample.manaPercent}%` : "—"} />
    </div>
  </li>;

  return (
    <li className="g-party-member" aria-label={`สมาชิก ${member.displayName}`}>
      <div className="g-party-member-heading">
        <span className="g-party-member-name">{member.displayName}{isSelf ? " · คุณ" : ""}</span>
        {member.isOwner && !compact && <span className="g-party-status">เจ้าของ</span>}
      </div>
      {!compact && status === "connected" && binding && <div className="g-party-member-account">
        <code aria-label="GID ที่ยืนยันการเชื่อมกับสมาชิกห้อง">{binding.person.gid}</code>
        {!isSelf && onAddFriend && <button type="button" disabled={disabled} onClick={() => onAddFriend(binding.person.gid)}>เพิ่มเพื่อน</button>}
      </div>}
      <div className="g-party-member-hero">{sample ? `${heroName(sample.hero)} · เลเวล ${sample.level}` : "ฮีโร่ / เลเวล · ยังไม่ทราบ"}</div>
      <span className="g-party-status" data-ready={presentation.state === "live"} aria-label={MEMBER_STATUS_LABELS[presentation.state]}>
        {compact ? COMPACT_STATUS[presentation.state] : MEMBER_STATUS_LABELS[presentation.state]}
      </span>
      <StatMeter
        label="HP" memberName={member.displayName} kind="health"
        value={sample?.hp ?? null} max={sample?.maxHp ?? 1}
        text={sample ? `${sample.hp} / ${sample.maxHp}` : "— / —"}
      />
      <StatMeter
        label="MP" memberName={member.displayName} kind="mana"
        value={sample?.manaPercent ?? null} max={100}
        text={sample ? `${sample.manaPercent}%` : "—"}
      />
      <div className="g-party-member-state">{life}</div>
      {onKick && !isSelf && !member.isOwner && (
        <button type="button" className="g-party-danger" disabled={disabled}
          aria-label={`นำ ${member.displayName} ออกจากปาร์ตี้`} onClick={() => onKick(member.memberId)}>
          นำออก
        </button>
      )}
    </li>
  );
}

export function PartyMembers({ view, elapsedMs, onKick, disabled = false, compact = false, accountBindings = [], onAddFriend, workspace = false }: {
  workspace?: boolean;
  accountBindings?: SocialBinding[];
  onAddFriend?: (gid: string) => void;
  view: PartyView;
  elapsedMs: number;
  onKick?: (memberId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  if (view.members.length === 0) {
    return <p className="g-party-note">ยังไม่มีข้อมูลสมาชิก · แสดงเฉพาะคนที่เข้าร่วมและยินยอมแชร์</p>;
  }
  return <ul className="g-party-member-list" aria-label={compact ? "สถานะสมาชิกปาร์ตี้ เลื่อนแนวนอนเพื่อดูสมาชิกทั้งหมด" : "สถานะสมาชิกปาร์ตี้"} tabIndex={compact ? 0 : undefined}>
    {view.members.map((member) => <PartyMemberCard
      key={member.memberId} member={member} status={view.status} elapsedMs={elapsedMs}
      isSelf={member.memberId === view.selfId} onKick={onKick} disabled={disabled} compact={compact} workspace={workspace}
      binding={accountBindings.find((binding) => binding.memberId === member.memberId)} onAddFriend={onAddFriend}
    />)}
  </ul>;
}
