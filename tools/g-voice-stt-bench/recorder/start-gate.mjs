export function createStartGate() {
  let pending = null;
  let pttHeld = false;
  let nextToken = 1;
  return {
    setPttHeld(held) { pttHeld = held; },
    start({ ptt }) {
      if (pending) return null;
      const token = nextToken; nextToken += 1;
      pending = { token, ptt, cancelled: false };
      return token;
    },
    canActivate(token) { return pending?.token === token && !pending.cancelled && (!pending.ptt || pttHeld); },
    cancel() { if (pending) pending.cancelled = true; },
    cancelPtt() { if (pending?.ptt) pending.cancelled = true; },
    isStarting() { return pending !== null; },
    finish(token) { if (pending?.token === token) pending = null; },
  };
}
