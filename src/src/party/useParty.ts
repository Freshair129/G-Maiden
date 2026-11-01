import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  emptyPartyView,
  parsePartyView,
  partyErrorMessage,
  PARTY_FRESH_MS,
  PARTY_POLL_MS,
  validatePartyConnection,
  type PartyConnectionInput,
  type PartyView,
} from "./partyModel";

type PartyAction = "connect" | "leave" | "kick" | "rotate";
interface TimedView { view: PartyView; receivedAt: number }

export function useParty() {
  const [snapshot, setSnapshot] = useState<TimedView>(() => ({ view: emptyPartyView(), receivedAt: performance.now() }));
  const [clock, setClock] = useState(() => performance.now());
  const [busy, setBusy] = useState<PartyAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canLeave, setCanLeave] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const action = useRef<PartyAction | null>(null);
  const inFlight = useRef<object | null>(null);

  const fail = useCallback((reason: unknown) => {
    const now = performance.now();
    setSnapshot({ view: emptyPartyView("error"), receivedAt: now });
    setClock(now);
    setError(partyErrorMessage(reason));
    // A failed IPC read does not prove that native sharing has stopped.
    setCanLeave(true);
  }, []);

  const accept = useCallback((raw: unknown, requestedAt: number) => {
    const parsed = parsePartyView(raw);
    if (!parsed) { fail("invalid_state"); return; }
    const now = performance.now();
    // An IPC response can wait behind a busy WebView. Its transit time must not
    // grant an old sample a fresh two-second display window.
    const transitMs = Math.max(0, Math.ceil(now - requestedAt));
    const view: PartyView = {
      ...parsed,
      status: parsed.status === "connected" && parsed.error !== null ? "error" : parsed.status,
      expiresInMs: parsed.expiresInMs === null ? null : Math.max(0, parsed.expiresInMs - transitMs),
      members: parsed.members.map((member) => ({
        ...member, ageMs: member.ageMs === null ? null : member.ageMs + transitMs,
      })),
    };
    setSnapshot({ view, receivedAt: now });
    setClock(now);
    setError(view.error ? partyErrorMessage(view.error) : null);
    if (view.status === "idle" || view.status === "closed" || (view.status === "error" && view.roomId === null)) setCanLeave(false);
    else setCanLeave(true);
  }, [fail]);

  const poll = useCallback(async () => {
    if (!active.current || action.current || inFlight.current) return;
    const token = {};
    const fence = generation.current;
    const requestedAt = performance.now();
    inFlight.current = token;
    try {
      const raw = await invoke<unknown>("party_get_state");
      if (active.current && generation.current === fence) accept(raw, requestedAt);
    } catch (reason) {
      if (active.current && generation.current === fence) fail(reason);
    } finally {
      if (inFlight.current === token) inFlight.current = null;
    }
  }, [accept, fail]);

  useEffect(() => {
    active.current = true;
    void poll();
    const timer = window.setInterval(() => {
      setClock(performance.now());
      void poll();
    }, PARTY_POLL_MS);
    return () => {
      active.current = false;
      generation.current += 1;
      inFlight.current = null;
      window.clearInterval(timer);
      // Native owns the session; changing tabs must not leave the party.
    };
  }, [poll]);

  useEffect(() => {
    if (snapshot.view.status !== "connected") return;
    const elapsed = Math.max(0, performance.now() - snapshot.receivedAt);
    const deadlines = snapshot.view.members.flatMap((member) =>
      member.state === "live" && member.ageMs !== null ? [PARTY_FRESH_MS - member.ageMs + 1 - elapsed] : []);
    if (snapshot.view.expiresInMs !== null) deadlines.push(snapshot.view.expiresInMs - elapsed);
    const next = Math.min(...deadlines.filter((deadline) => deadline > 0));
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setClock(performance.now()), Math.ceil(next));
    return () => window.clearTimeout(timer);
  }, [snapshot, clock]);

  const runAction = useCallback(async (kind: PartyAction, command: string, args?: Record<string, unknown>) => {
    if (action.current && kind !== "leave") return;
    if (action.current === "leave") return;
    const fence = ++generation.current;
    const requestedAt = performance.now();
    action.current = kind;
    inFlight.current = null;
    setBusy(kind);
    setError(null);
    if (kind === "connect" || kind === "leave") {
      const now = performance.now();
      setSnapshot({ view: emptyPartyView(kind === "connect" ? "connecting" : "idle"), receivedAt: now });
      setClock(now);
      setCanLeave(true);
    }
    if (kind === "kick") {
      setSnapshot((previous) => ({ ...previous, view: {
        ...previous.view, members: previous.view.members.filter((member) => member.memberId !== args?.memberId),
      } }));
    }
    try {
      const raw = args === undefined ? await invoke<unknown>(command) : await invoke<unknown>(command, args);
      if (active.current && generation.current === fence) accept(raw, requestedAt);
    } catch (reason) {
      if (active.current && generation.current === fence) {
        fail(reason);
        if (kind === "leave") setError("ยังยืนยันการหยุดแชร์ไม่ได้ กรุณากดออกและหยุดแชร์อีกครั้ง");
      }
    } finally {
      if (active.current && generation.current === fence) {
        action.current = null;
        setBusy(null);
      }
    }
  }, [accept, fail]);

  const connect = useCallback(async (input: PartyConnectionInput) => {
    const validated = validatePartyConnection(input);
    if (!validated.ok) { setError(validated.error); return; }
    await runAction("connect", "party_connect", { ...validated.value });
  }, [runAction]);

  const leave = useCallback(() => runAction("leave", "party_leave"), [runAction]);
  const kick = useCallback((memberId: string) => runAction("kick", "party_kick", { memberId }), [runAction]);
  const rotateInvite = useCallback(() => runAction("rotate", "party_rotate_invite"), [runAction]);

  const elapsedMs = Math.max(0, clock - snapshot.receivedAt);
  const roomExpired = snapshot.view.status === "connected" && snapshot.view.expiresInMs !== null
    && elapsedMs >= snapshot.view.expiresInMs;

  return {
    view: roomExpired ? emptyPartyView("closed") : snapshot.view,
    elapsedMs,
    busy,
    error,
    canLeave,
    connect,
    leave,
    kick,
    rotateInvite,
  };
}

export type PartyController = ReturnType<typeof useParty>;
