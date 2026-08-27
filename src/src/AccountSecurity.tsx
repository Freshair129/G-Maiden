import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./auth";
import {
  readSecurityEvents,
  readSecurityState,
  requestSessionAction,
  type SecurityEvent,
  type SecurityState,
} from "./securityApi";

function displayTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function eventLabel(event: SecurityEvent): string {
  const scope = event.context.scope;
  return typeof scope === "string" ? `${event.event_type} · ${scope}` : event.event_type;
}

export default function AccountSecurity() {
  const { user } = useAuth();
  const [state, setState] = useState<SecurityState | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) {
      setState(null);
      setEvents([]);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const [nextState, nextEvents] = await Promise.all([
        readSecurityState(),
        readSecurityEvents(),
      ]);
      setState(nextState);
      setEvents(nextEvents);
    } catch {
      setMessage("Security state is unavailable right now. No provider state is inferred locally.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void reload(); }, [reload]);

  async function signOutOthers() {
    setActionBusy(true);
    setMessage(null);
    try {
      await requestSessionAction("others");
      setMessage("Other provider sessions were signed out. This device remains active.");
      await reload();
    } catch {
      setMessage("Could not sign out other sessions. A fresh MFA step-up may be required.");
    } finally {
      setActionBusy(false);
    }
  }

  if (!user) {
    return <section className="account-card muted"><h3 className="account-h3">Account Security</h3><p className="account-hint">Sign in with Google to view your current session and security activity.</p></section>;
  }

  return (
    <div className="security-grid">
      <section className="account-card">
        <h3 className="account-h3">Account Security</h3>
        <p className="account-note">Provider session state is authoritative. Devices below are app-observed only.</p>
        {loading && !state ? <div className="account-hint">Loading security state…</div> : null}
        {state ? (
          <>
            <div className="security-row"><span>Current session</span><strong>{state.current_session.session_ref ?? "unavailable"}</strong></div>
            <div className="security-row"><span>Assurance</span><strong>{state.current_session.aal.toUpperCase()}</strong></div>
            <div className="security-row"><span>Factors</span><strong>{state.factors.length ? state.factors.map((f) => `${f.type} (${f.status})`).join(", ") : "None enrolled"}</strong></div>
            <div className="security-row"><span>Recovery contacts</span><strong>Not enrolled in Phase 2</strong></div>
            <button type="button" className="auth-out security-action" onClick={() => void signOutOthers()} disabled={actionBusy}>
              {actionBusy ? "Signing out…" : "Sign out other sessions"}
            </button>
          </>
        ) : null}
        {message ? <div className="account-msg">{message}</div> : null}
      </section>

      <section className="account-card">
        <h3 className="account-h3">Observed devices</h3>
        {state?.devices.length ? state.devices.map((device) => (
          <div className="security-device" key={device.id}>
            <div><strong>{device.label || device.platform}</strong><span>{device.app_version}</span></div>
            <small>{device.source.replace("_", " ")} · last seen {displayTime(device.last_seen_at)}</small>
          </div>
        )) : <p className="account-hint">No app-observed devices yet.</p>}
      </section>

      <section className="account-card security-activity">
        <h3 className="account-h3">Your security activity</h3>
        {events.length ? events.map((event) => (
          <div className="security-event" key={event.id}>
            <strong>{eventLabel(event)}</strong>
            <span>{event.outcome} · {displayTime(event.occurred_at)}</span>
          </div>
        )) : <p className="account-hint">No redacted activity recorded yet.</p>}
      </section>
    </div>
  );
}
