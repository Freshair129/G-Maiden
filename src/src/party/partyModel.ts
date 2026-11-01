export const PARTY_FRESH_MS = 2_000;
export const PARTY_POLL_MS = 500;

export type PartyStatus = "idle" | "connecting" | "connected" | "reconnecting" | "closed" | "error";
export type MemberState = "live" | "stale" | "waiting" | "different_match";

export interface PartyStats {
  hero: string;
  level: number;
  hp: number;
  maxHp: number;
  manaPercent: number;
  alive: boolean;
  respawnSeconds: number;
}

export interface PartyMember {
  memberId: string;
  displayName: string;
  isOwner: boolean;
  state: MemberState;
  ageMs: number | null;
  sample: PartyStats | null;
}

export interface PartyView {
  status: PartyStatus;
  roomId: string | null;
  relayUrl: string | null;
  roomGeneration: number | null;
  selfId: string | null;
  ownerId: string | null;
  invite: string | null;
  expiresInMs: number | null;
  error: string | null;
  members: PartyMember[];
}

export interface PartyConnectionInput {
  relayUrl: string;
  displayName: string;
  invite: string | null;
  consent: boolean;
}

type ConnectionValidation =
  | { ok: true; value: PartyConnectionInput & { consent: true } }
  | { ok: false; error: string };

const ID_PATTERN = /^[a-f0-9]{32}$/;
const INVITE_PATTERN = /^GMP1\.[a-f0-9]{32}\.[a-f0-9]{64}$/;
const STATUS_VALUES: PartyStatus[] = ["idle", "connecting", "connected", "reconnecting", "closed", "error"];
const MEMBER_STATES: MemberState[] = ["live", "stale", "waiting", "different_match"];

export function emptyPartyView(status: PartyStatus = "idle"): PartyView {
  return { status, relayUrl: null, roomGeneration: null, roomId: null, selfId: null, ownerId: null, invite: null, expiresInMs: null, error: null, members: [] };
}

function validDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0
    && [...value].length <= 32 && !/\p{Cc}/u.test(value) && !/[\uD800-\uDFFF]/u.test(value);
}

export function validatePartyConnection(input: PartyConnectionInput): ConnectionValidation {
  if (input.consent !== true) return { ok: false, error: "กรุณายินยอมแชร์ข้อมูลของคุณก่อนเข้าปาร์ตี้" };
  const displayName = input.displayName.trim();
  if (!validDisplayName(displayName)) return { ok: false, error: "ใช้ชื่อเล่น 1–32 ตัวอักษร โดยไม่มีอักขระควบคุม" };

  const relayUrl = input.relayUrl.trim();
  try {
    const url = new URL(relayUrl);
    const authority = /^https?:\/\/([^/?#]+)\/?$/i.exec(relayUrl)?.[1];
    const localHttp = authority !== undefined && /^(127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(authority);
    if (!authority || url.username || url.password || url.search || url.hash || url.pathname !== "/"
      || (url.protocol !== "https:" && !(url.protocol === "http:" && localHttp))) {
      return { ok: false, error: "ใช้ HTTPS ของ relay โดยไม่มี path, รหัสผ่าน, query หรือ fragment; HTTP ใช้ได้เฉพาะ 127.0.0.1 หรือ [::1]" };
    }
    const invite = input.invite === null ? null : input.invite.trim();
    if (invite !== null && !INVITE_PATTERN.test(invite)) return { ok: false, error: "รหัสเชิญไม่ถูกต้อง กรุณาใช้รหัส GMP1 ที่ได้รับจากเจ้าของปาร์ตี้" };
    return { ok: true, value: { relayUrl: url.origin, displayName, invite, consent: true } };
  } catch {
    return { ok: false, error: "กรุณาระบุ URL ของ relay ที่ถูกต้อง" };
  }
}

function objectWithKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function nullableId(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && ID_PATTERN.test(value));
}

function validStats(value: unknown): value is PartyStats {
  if (!objectWithKeys(value, ["hero", "level", "hp", "maxHp", "manaPercent", "alive", "respawnSeconds"])) return false;
  return typeof value.hero === "string" && /^npc_dota_hero_[a-z0-9_]{1,100}$/.test(value.hero)
    && integer(value.level, 1, 30) && integer(value.maxHp, 1, 100_000)
    && integer(value.hp, 0, value.maxHp) && integer(value.manaPercent, 0, 100)
    && typeof value.alive === "boolean" && integer(value.respawnSeconds, 0, 600);
}

function validMember(value: unknown): value is PartyMember {
  if (!objectWithKeys(value, ["memberId", "displayName", "isOwner", "state", "ageMs", "sample"])) return false;
  if (typeof value.memberId !== "string" || !ID_PATTERN.test(value.memberId)
    || !validDisplayName(value.displayName) || typeof value.isOwner !== "boolean"
    || !MEMBER_STATES.includes(value.state as MemberState)
    || !(value.ageMs === null || integer(value.ageMs, 0))) return false;
  if (value.state === "live") return value.ageMs !== null && validStats(value.sample);
  return value.sample === null;
}

export function parsePartyView(value: unknown): PartyView | null {
  if (!objectWithKeys(value, ["status", "relayUrl", "roomGeneration", "roomId", "selfId", "ownerId", "invite", "expiresInMs", "error", "members"])) return null;
  if (!STATUS_VALUES.includes(value.status as PartyStatus)
    || !(value.relayUrl === null || (typeof value.relayUrl === "string" && validatePartyConnection({ relayUrl: value.relayUrl, displayName: "scope", consent: true, invite: null }).ok))
    || !(value.roomGeneration === null || integer(value.roomGeneration, 1))
    || !nullableId(value.roomId) || !nullableId(value.selfId) || !nullableId(value.ownerId)
    || !(value.invite === null || (typeof value.invite === "string" && INVITE_PATTERN.test(value.invite)))
    || !(value.expiresInMs === null || integer(value.expiresInMs, 0))
    || !(value.error === null || (typeof value.error === "string" && value.error.length <= 128))
    || !Array.isArray(value.members) || value.members.length > 5 || !value.members.every(validMember)) return null;
  if (value.status === "connected" && (!value.roomId || !value.selfId || !value.ownerId || !value.relayUrl || !value.roomGeneration)) return null;
  if (value.invite !== null && (value.selfId !== value.ownerId || !value.roomId || !value.invite.startsWith(`GMP1.${value.roomId}.`))) return null;
  if (new Set(value.members.map((member) => member.memberId)).size !== value.members.length) return null;
  if (value.members.some((member) => member.isOwner !== (member.memberId === value.ownerId))) return null;
  return value as unknown as PartyView;
}

export interface MemberPresentation {
  state: MemberState | "unavailable";
  sample: PartyStats | null;
  ageMs: number | null;
}

export function memberPresentation(member: PartyMember, status: PartyStatus, elapsedMs: number): MemberPresentation {
  if (status !== "connected") return { state: "unavailable", sample: null, ageMs: null };
  if (member.state !== "live") return { state: member.state, sample: null, ageMs: member.ageMs };
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : Infinity;
  const ageMs = member.ageMs === null ? Infinity : member.ageMs + elapsed;
  if (ageMs > PARTY_FRESH_MS) return { state: "stale", sample: null, ageMs };
  if (!validStats(member.sample)) return { state: "unavailable", sample: null, ageMs: null };
  return { state: "live", sample: member.sample, ageMs };
}

export const PARTY_STATUS_LABELS: Record<PartyStatus, string> = {
  idle: "ยังไม่ได้เข้าปาร์ตี้",
  connecting: "กำลังเชื่อมต่อ",
  connected: "เชื่อมต่อปาร์ตี้แล้ว",
  reconnecting: "ขาดการเชื่อมต่อ · กำลังลองใหม่",
  closed: "ปาร์ตี้ปิดแล้ว",
  error: "ยังยืนยันสถานะไม่ได้",
};

export const MEMBER_STATUS_LABELS: Record<MemberPresentation["state"], string> = {
  live: "ข้อมูลสด · แมตช์และทีมตรงกัน",
  stale: "ข้อมูลเก่า · ยังไม่ทราบสถานะ",
  waiting: "รอข้อมูล GSI ที่ยืนยันได้",
  different_match: "คนละแมตช์หรือทีม",
  unavailable: "ไม่มีข้อมูลปัจจุบัน",
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "ข้อมูลไม่ถูกต้อง กรุณาตรวจ URL ชื่อเล่น และรหัสเชิญ",
  unauthorized: "สิทธิ์เข้าปาร์ตี้หมดแล้ว กรุณาเข้าร่วมใหม่",
  room_unavailable: "ไม่พบปาร์ตี้หรือปาร์ตี้ปิดแล้ว กรุณาขอรหัสเชิญใหม่",
  room_full: "ปาร์ตี้เต็มแล้ว รับสมาชิกได้สูงสุด 5 คน",
  forbidden: "คำสั่งนี้ใช้ได้เฉพาะเจ้าของปาร์ตี้",
  replayed_sequence: "ข้อมูลมาถึงผิดลำดับ จึงไม่แสดงสถานะเก่า",
  rate_limited: "ส่งคำขอถี่เกินไป กรุณารอสักครู่",
  capacity: "relay เต็มชั่วคราว กรุณาลองอีกครั้ง",
  invalid_state: "สถานะที่ได้รับไม่ถูกต้อง จึงซ่อนข้อมูลสมาชิกไว้",
  consent_required: "กรุณายินยอมแชร์ข้อมูลของคุณก่อนเข้าปาร์ตี้",
};

export function partyErrorMessage(error: unknown): string {
  return typeof error === "string" && Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, error)
    ? ERROR_MESSAGES[error]
    : "ติดต่อปาร์ตี้ไม่ได้ในขณะนี้ จึงไม่แสดงข้อมูลสุขภาพเก่า กรุณาตรวจ relay หรือออกจากปาร์ตี้";
}
