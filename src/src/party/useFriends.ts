import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@supabase/supabase-js";
import { localAuthBlocked } from "../securitySession";
import { sessionSocialRequest } from "./friendsApi";
import { exact, parseSocialResult, socialSessionKey, SOCIAL_HEARTBEAT_MS, SOCIAL_POLL_MS, type SocialAction, type SocialBinding, type SocialChallenge, type SocialJoin, type SocialRoster, type SocialSettings, type SocialState } from "./friendsModel";
import type { PartyController } from "./useParty";

type Epoch = { key: string | null; live: boolean; requests: Set<AbortController> };
type TimedState = { epoch: Epoch; value: SocialState; at: number; rtt: number };
type TimedRoster = { epoch: Epoch; scope: string; value: SocialRoster; at: number; rtt: number };
const UNAVAILABLE = "Friends ไม่พร้อมใช้งาน ยังสร้างหรือเข้าห้องด้วยรหัสได้ตามปกติ";
const origin = (url: string | null) => { try { return url ? new URL(url).origin : null; } catch { return null; } };
const JOIN_FAILED = "เข้าห้องไม่สำเร็จ คุณยังไม่ได้เข้าห้อง กรุณาให้ความยินยอมใหม่เพื่อลองอีกครั้ง หากบัตรถูกใช้ไปแล้ว ต้องขอคำเชิญใหม่";

export function useFriends({ session, party, panelVisible }: { session: Session | null; party: PartyController; panelVisible: boolean }) {
  const key = localAuthBlocked() ? null : socialSessionKey(session);
  const scope = JSON.stringify([origin(party.view.relayUrl), party.view.roomId, party.view.selfId, party.view.roomGeneration]);
  const epoch = useRef<Epoch>({ key, live: true, requests: new Set() });
  const linkVersion = useRef(0);
  const linkedIntent = useRef(false);
  const reconciled = useRef<{ epoch: Epoch; scope: string } | null>(null);
  const previousScope = useRef(scope);
  const pendingJoin = useRef<Epoch | null>(null);
  const cancellation = useRef<Promise<boolean> | null>(null);
  const cancellationFailed = useRef(false);
  if (epoch.current.key !== key) {
    epoch.current.live = false;
    epoch.current.requests.forEach((controller) => controller.abort());
    epoch.current = { key, live: true, requests: new Set() };
    linkedIntent.current = false; linkVersion.current++; reconciled.current = null;
  }
  if (previousScope.current !== scope) {
    previousScope.current = scope;
    linkedIntent.current = false; linkVersion.current++; reconciled.current = null;
  }
  const [snapshot, setSnapshot] = useState<TimedState | null>(null);
  const [roster, setRoster] = useState<TimedRoster | null>(null);
  const knownRoster = useRef(roster); knownRoster.current = roster;
  const [clock, setClock] = useState(() => performance.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, refresh] = useState(0);
  const operation = useRef<Epoch | null>(null);
  const data = useRef<TimedState | null>(null);
  const read = useRef<{ epoch: Epoch; promise: Promise<SocialState | null> } | null>(null);
  const stateSerial = useRef(0);
  const linkFlight = useRef<{ epoch: Epoch; version: number } | null>(null);
  const rosterFlight = useRef<Epoch | null>(null);
  const transitionTail = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef({ party, scope, panelVisible });
  latest.current = { party, scope, panelVisible };

  const current = useCallback((e: Epoch) => e === epoch.current && e.live && !!e.key && !localAuthBlocked(), []);
  const available = useCallback((e: Epoch) => current(e) && !cancellation.current && !cancellationFailed.current && !(pendingJoin.current && pendingJoin.current !== e), [current]);
  const request = useCallback(async <T,>(body: SocialAction, e: Epoch): Promise<T> => {
    if (!current(e)) throw new Error("invalid_session");
    const controller = new AbortController(); e.requests.add(controller);
    try {
      const raw = await sessionSocialRequest<unknown>(body, e.key!, controller.signal);
      if (!current(e) || controller.signal.aborted) throw new Error("invalid_session");
      const result = parseSocialResult(body, raw);
      if (result === null) throw new Error("invalid_state");
      return result as T;
    } finally { e.requests.delete(controller); }
  }, [current]);

  const load = useCallback((e: Epoch): Promise<SocialState | null> => {
    if (!available(e)) return Promise.resolve(null);
    if (read.current?.epoch === e) return read.current.promise;
    const serial = stateSerial.current;
    const started = performance.now();
    const promise = (async () => {
      try {
        const value = await request<SocialState>({ action: "state" }, e);
        if (!current(e) || serial !== stateSerial.current) return null;
        const timed = { epoch: e, value, at: performance.now(), rtt: Math.max(0, performance.now() - started) };
        data.current = timed; setSnapshot(timed); setClock(timed.at); setError(null);
        return value;
      } catch {
        if (current(e) && serial === stateSerial.current) { data.current = null; setSnapshot(null); setRoster(null); setError(UNAVAILABLE); }
        return null;
      } finally { if (read.current?.epoch === e) read.current = null; }
    })();
    read.current = { epoch: e, promise };
    return promise;
  }, [available, current, request]);

  const reconcile = useCallback((e: Epoch, nextScope: string) => {
    linkedIntent.current = false; linkVersion.current++; reconciled.current = null;
    stateSerial.current++;
    refresh((v) => v + 1);
    const work = transitionTail.current.catch(() => {}).then(async () => {
      if (cancellation.current) await cancellation.current;
      if (!available(e)) return;
      try {
        const previousRevision = data.current?.epoch === e ? data.current.value.bindingRevision : null;
        await request({ action: "unlink" }, e);
        // An older read cannot serve as the authoritative post-unlink revision.
        if (read.current?.epoch === e) await read.current.promise;
        const value = await load(e);
        if (!value || (previousRevision !== null && value.bindingRevision <= previousRevision)) throw new Error("unavailable");
        if (current(e) && latest.current.scope === nextScope) { reconciled.current = { epoch: e, scope: nextScope }; refresh((v) => v + 1); }
      } catch {
        if (current(e)) { reconciled.current = null; setError("ยังยืนยันการยกเลิกการเชื่อมโปรไฟล์ไม่ได้ จึงยังเชื่อมใหม่ไม่ได้ กรุณาลองยกเลิกการเชื่อมอีกครั้ง"); refresh((v) => v + 1); }
      }
    });
    transitionTail.current = work;
    return work;
  }, [available, current, load, request]);

  useEffect(() => {
    const e = epoch.current; e.live = true;
    setBusy(false); setError(null);
    cancellationFailed.current = false;
    const initialize = async () => {
      // Only a social admission begun by this controller is cancelled on an
      // account transition. Signing out never leaves an existing guest room.
      if (pendingJoin.current && pendingJoin.current !== e) {
        const stop = latest.current.party.leave(); cancellation.current = stop;
        refresh((v) => v + 1);
        const stopped = await stop.catch(() => false);
        if (cancellation.current === stop) cancellation.current = null;
        if (!stopped) { cancellationFailed.current = true; setError("พักการใช้ Friends จนกว่าจะยืนยันการยกเลิกเข้าห้องจากแอปได้ กรุณาลองโหลด Friends อีกครั้ง"); refresh((v) => v + 1); return; }
        pendingJoin.current = null;
      }
      if (!current(e)) return;
      await load(e);
    };
    void initialize();
    const timer = window.setInterval(() => { void load(e); }, SOCIAL_POLL_MS);
    return () => { e.live = false; e.requests.forEach((controller) => controller.abort()); window.clearInterval(timer); };
  }, [key, current, load]);

  useEffect(() => {
    const e = epoch.current;
    // Reconcile even idle -> room and room -> idle, including rotation and a
    // delayed initial link. The server revision fences requests already sent.
    if (e.key) void reconcile(e, scope);
  }, [key, scope, reconcile]);

  const stateIsCurrent = snapshot?.epoch === epoch.current && available(epoch.current);
  const source = stateIsCurrent ? snapshot : null;
  const presenceVisible = source?.value.settings.presenceVisible === true;
  useEffect(() => {
    const e = epoch.current;
    if (!presenceVisible || !available(e)) return;
    let flight = false;
    const heartbeat = async () => {
      if (flight || !available(e) || data.current?.epoch !== e || !data.current.value.settings.presenceVisible) return;
      flight = true;
      try { await request({ action: "heartbeat" }, e); } catch { if (current(e)) { setSnapshot(null); data.current = null; setRoster(null); setError(UNAVAILABLE); } } finally { flight = false; }
    };
    void heartbeat();
    const timer = window.setInterval(() => { void heartbeat(); }, SOCIAL_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [presenceVisible, key, available, current, request]);

  const proofFor = useCallback(async (purpose: "link" | "roster" | "invite", recipientGid: string | null, e: Epoch, version: number, requestedScope: string, revision: number | null) => {
    const room = latest.current.party.view;
    const safe = () => available(e) && latest.current.scope === requestedScope && linkVersion.current === version;
    if (!safe() || room.status !== "connected" || !room.relayUrl || origin(room.relayUrl) !== data.current?.value.relayOrigin) throw new Error("unavailable");
    const challenge = await request<SocialChallenge>({ action: "challenge", purpose, recipientGid, bindingRevision: revision }, e);
    if (!safe() || challenge.relayOrigin !== origin(room.relayUrl)) throw new Error("unavailable");
    const raw = await invoke<unknown>("party_social_proof", { challenge: challenge.challenge, relayUrl: room.relayUrl });
    if (!safe() || !exact(raw, ["proof"]) || typeof raw.proof !== "string" || raw.proof.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw.proof)) throw new Error("unavailable");
    return raw.proof;
  }, [available, request]);

  const hasForeignBinding = useCallback((e: Epoch) => {
    const value = data.current; const observed = knownRoster.current; const p = latest.current.party.view;
    return value?.epoch === e && observed?.epoch === e && observed.scope === latest.current.scope && observed.value.roomId === p.roomId && observed.value.generation === p.roomGeneration
      && observed.value.bindings.some((b) => b.memberId === p.selfId && b.person.gid !== value.value.self.gid && b.expiresAtMs > observed.value.serverNowMs + observed.rtt + Math.max(0, performance.now() - observed.at));
  }, []);

  const renew = useCallback(async (initial: boolean) => {
    const e = epoch.current; const requestedScope = latest.current.scope; const version = linkVersion.current;
    const value = data.current;
    if (hasForeignBinding(e) || (linkFlight.current?.epoch === e && linkFlight.current.version === version) || !available(e) || value?.epoch !== e || reconciled.current?.epoch !== e || reconciled.current.scope !== requestedScope || (!initial && !linkedIntent.current)) return false;
    const flight = { epoch: e, version }; linkFlight.current = flight;
    try {
      const proof = await proofFor("link", null, e, version, requestedScope, value.value.bindingRevision);
      if (!available(e) || version !== linkVersion.current || latest.current.scope !== requestedScope) return false;
      await request({ action: "link", proof, bindingRevision: value.value.bindingRevision, consent: initial }, e);
      if (!available(e) || version !== linkVersion.current || latest.current.scope !== requestedScope) return false;
      linkedIntent.current = true; refresh((v) => v + 1); return true;
    } catch {
      if (current(e) && version === linkVersion.current) { linkedIntent.current = false; setRoster(null); setError("เชื่อมโปรไฟล์ไม่ได้ กรุณาตรวจสถานะห้องแล้วให้ความยินยอมใหม่เพื่อลองอีกครั้ง"); refresh((v) => v + 1); }
      return false;
    } finally { if (linkFlight.current === flight) linkFlight.current = null; }
  }, [available, current, hasForeignBinding, proofFor, request]);

  useEffect(() => {
    const timer = window.setInterval(() => { if (linkedIntent.current) void renew(false); }, SOCIAL_HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [renew]);

  const refreshRoster = useCallback(async () => {
    const e = epoch.current; const requestedScope = latest.current.scope; const version = linkVersion.current;
    if (!latest.current.panelVisible || rosterFlight.current === e || !available(e) || data.current?.epoch !== e || latest.current.party.view.status !== "connected" || origin(latest.current.party.view.relayUrl) !== data.current.value.relayOrigin) return;
    rosterFlight.current = e; const start = performance.now();
    try {
      const proof = await proofFor("roster", null, e, version, requestedScope, null);
      const value = await request<SocialRoster>({ action: "roster", proof }, e);
      if (current(e) && version === linkVersion.current && latest.current.scope === requestedScope) setRoster({ epoch: e, scope: requestedScope, value, at: performance.now(), rtt: Math.max(0, performance.now() - start) });
    } catch { if (current(e) && version === linkVersion.current) setRoster(null); }
    finally { if (rosterFlight.current === e) rosterFlight.current = null; }
  }, [available, current, proofFor, request]);
  const hasSource = !!source;
  useEffect(() => {
    if (!panelVisible || !hasSource) return;
    void refreshRoster();
    const timer = window.setInterval(() => { void refreshRoster(); }, SOCIAL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [panelVisible, key, scope, hasSource, refreshRoster]);

  useEffect(() => {
    const now = performance.now();
    const deadlines: number[] = [];
    if (source) {
      const elapsed = now - source.at + source.rtt;
      source.value.friends.forEach((f) => { if (f.online) deadlines.push(f.onlineForMs - elapsed); });
      [...source.value.requests, ...source.value.invites].forEach((x) => deadlines.push(x.expiresAtMs - source.value.serverNowMs - elapsed));
    }
    if (roster?.epoch === epoch.current) roster.value.bindings.forEach((b) => deadlines.push(b.expiresAtMs - roster.value.serverNowMs - roster.rtt - (now - roster.at)));
    if (panelVisible && source?.value.invites.length) deadlines.push(1000);
    const deadline = Math.min(...deadlines.filter((v) => v > 0));
    if (!Number.isFinite(deadline)) return;
    const timer = window.setTimeout(() => setClock(performance.now()), Math.ceil(deadline));
    return () => window.clearTimeout(timer);
  }, [source, roster, clock, panelVisible]);

  const mutate = useCallback(async (body: SocialAction): Promise<boolean> => {
    const e = epoch.current;
    if (!available(e) || operation.current === e || data.current?.epoch !== e) return false;
    operation.current = e; setBusy(true); setError(null);
    try { await request(body, e); await load(e); return current(e); }
    catch { if (current(e)) setError("ยังยืนยันผลคำสั่งไม่ได้ กรุณาโหลดข้อมูลแล้วลองอีกครั้ง"); return false; }
    finally { if (operation.current === e) operation.current = null; if (current(e)) setBusy(false); }
  }, [available, current, load, request]);

  const setPresence = useCallback((visible: boolean) => {
    const value = data.current;
    if (!value || value.epoch !== epoch.current) return Promise.resolve(false);
    return mutate({ action: "settings", ...value.value.settings, presenceVisible: visible });
  }, [mutate]);
  const setSettings = useCallback((settings: SocialSettings) => mutate({ action: "settings", ...settings }), [mutate]);
  const setLink = useCallback(async (consent: boolean) => {
    if (!consent) { await reconcile(epoch.current, latest.current.scope); return false; }
    return renew(true);
  }, [reconcile, renew]);
  const invite = useCallback(async (gid: string) => {
    const e = epoch.current;
    if (!available(e) || operation.current === e || data.current?.epoch !== e || latest.current.party.view.selfId !== latest.current.party.view.ownerId) return false;
    operation.current = e; setBusy(true);
    try {
      const version = linkVersion.current; const requestedScope = latest.current.scope;
      const proof = await proofFor("invite", gid, e, version, requestedScope, null);
      await request({ action: "invite", proof }, e); await load(e); return current(e);
    } catch { if (current(e)) setError("ส่งคำเชิญเข้าห้องไม่สำเร็จ กรุณาลองอีกครั้ง"); return false; }
    finally { if (operation.current === e) operation.current = null; if (current(e)) setBusy(false); }
  }, [available, current, load, proofFor, request]);
  const acceptInvite = useCallback(async (inviteId: string, displayName: string, consent: boolean) => {
    const e = epoch.current; const p = latest.current.party;
    if (!consent || !available(e) || operation.current === e || data.current?.epoch !== e || p.canLeave || p.busy || !["idle", "closed"].includes(p.view.status)) return false;
    const invitation = data.current.value.invites.find((x) => x.id === inviteId && x.direction === "incoming");
    const now = data.current.value.serverNowMs + data.current.rtt + Math.max(0, performance.now() - data.current.at);
    if (!invitation || invitation.expiresAtMs <= now || !displayName.trim() || [...displayName.trim()].length > 32 || /\p{Cc}|[\uD800-\uDFFF]/u.test(displayName)) return false;
    operation.current = e; setBusy(true); setError(null);
    try {
      const join = await request<SocialJoin>({ action: "invite_accept", inviteId, consent: true }, e);
      if (!available(e) || join.relayOrigin !== data.current?.value.relayOrigin || latest.current.party.canLeave || latest.current.party.busy) return false;
      const timing = data.current;
      if (!timing || join.expiresAtMs <= timing.value.serverNowMs + timing.rtt + Math.max(0, performance.now() - timing.at)) throw new Error("expired_ticket");
      pendingJoin.current = e;
      const joined = await latest.current.party.joinSocial({ ticket: join.ticket, relayUrl: join.relayOrigin, roomId: join.roomId, displayName: displayName.trim(), consent: true });
      if (!current(e)) return false;
      pendingJoin.current = null;
      if (!joined) setError(JOIN_FAILED);
      else setError("เข้าร่วมห้องแล้ว กำลังแชร์ GSI จนกว่าจะออกจากห้อง");
      await load(e); if (current(e)) setError(joined ? "เข้าร่วมห้องแล้ว กำลังแชร์ GSI จนกว่าจะออกจากห้อง" : JOIN_FAILED);
      return joined;
    } catch { if (current(e)) setError(JOIN_FAILED); return false; }
    finally { if (operation.current === e) operation.current = null; if (current(e)) setBusy(false); }
  }, [available, current, load, request]);

  const refreshState = useCallback(async () => {
    const e = epoch.current;
    if (!current(e)) return null;
    if (cancellationFailed.current) {
      const stop = latest.current.party.leave(); cancellation.current = stop;
      const stopped = await stop.catch(() => false);
      if (cancellation.current === stop) cancellation.current = null;
      if (!stopped || !current(e)) return null;
      cancellationFailed.current = false; pendingJoin.current = null;
      await load(e); await reconcile(e, latest.current.scope);
    }
    return load(e);
  }, [current, load, reconcile]);

  const elapsed = source ? source.rtt + Math.max(0, clock - source.at) : 0;
  const state: SocialState | null = source ? { ...source.value,
    friends: source.value.friends.map((f) => ({ ...f, online: f.online && f.onlineForMs > elapsed, onlineForMs: Math.max(0, f.onlineForMs - elapsed) })),
    requests: source.value.requests.filter((x) => x.expiresAtMs > source.value.serverNowMs + elapsed),
    invites: source.value.invites.filter((x) => x.expiresAtMs > source.value.serverNowMs + elapsed),
  } : null;
  const bindings: SocialBinding[] = state && roster?.epoch === epoch.current && roster.scope === scope && party.view.status === "connected" && roster.value.roomId === party.view.roomId && roster.value.generation === party.view.roomGeneration
    ? roster.value.bindings.filter((b) => party.view.members.some((m) => m.memberId === b.memberId) && b.expiresAtMs > roster.value.serverNowMs + roster.rtt + Math.max(0, clock - roster.at)) : [];
  const roomAvailable = !!state?.relayOrigin && party.view.status === "connected" && origin(party.view.relayUrl) === state.relayOrigin;
  return { state, nowMs: source ? source.value.serverNowMs + elapsed : null, ready: !!state, signedIn: !!key, busy: busy && !!state, error: key ? error : null, bindings,
    linked: roomAvailable && linkedIntent.current && !hasForeignBinding(epoch.current),
    linkAvailable: roomAvailable && !hasForeignBinding(epoch.current) && reconciled.current?.epoch === epoch.current && reconciled.current.scope === scope && !(linkFlight.current?.epoch === epoch.current && linkFlight.current.version === linkVersion.current),
    roomAvailable, mutate, setPresence, setSettings, setLink, invite, acceptInvite, refresh: refreshState,
  };
}
export type FriendsController = ReturnType<typeof useFriends>;
