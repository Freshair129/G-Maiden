import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const MAX_BODY = 4096;
const MAX_ROOMS = 100;
const MAX_MEMBERS = 5;
const MAX_LIMITER_KEYS = 1024;
const ROOM_TTL = 4 * 60 * 60 * 1000;
const MEMBER_TTL = 30_000;
const SOURCE_FRESH_MS = 2000;
const SOURCE_RETAIN_MS = 10_000;
const ID = /^[a-f0-9]{32}$/;
const SECRET = /^[a-f0-9]{64}$/;
const INVITE = /^GMP1\.([a-f0-9]{32})\.([a-f0-9]{64})$/;

class RelayError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const reject = (status = 400, code = 'invalid_request') => { throw new RelayError(status, code); };
const hash = value => createHash('sha256').update(value).digest();
const secretMatches = (value, expected) => SECRET.test(value) && timingSafeEqual(hash(value), expected);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

function exactObject(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) reject();
}

function displayName(value) {
  if (typeof value !== 'string' || !value.isWellFormed()) reject();
  const name = value.trim();
  if (!name || [...name].length > 32 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) reject();
  return name;
}

function validateSync(body) {
  exactObject(body, ['sequence', 'scope', 'sample']);
  if (!integer(body.sequence, 1, Number.MAX_SAFE_INTEGER)) reject();
  if (body.scope !== null) {
    exactObject(body.scope, ['matchKey', 'team']);
    if (typeof body.scope.matchKey !== 'string' || !SECRET.test(body.scope.matchKey) ||
        !['radiant', 'dire'].includes(body.scope.team)) reject();
  }
  if (body.sample === null) return;
  if (body.scope === null) reject();
  const s = body.sample;
  exactObject(s, ['hero', 'level', 'hp', 'maxHp', 'manaPercent', 'alive', 'respawnSeconds', 'sourceAgeMs']);
  if (typeof s.hero !== 'string' || !/^npc_dota_hero_[a-z0-9_]{1,100}$/.test(s.hero) ||
      !integer(s.level, 1, 30) || !integer(s.hp, 0, 100_000) ||
      !integer(s.maxHp, 1, 100_000) || s.hp > s.maxHp ||
      !integer(s.manaPercent, 0, 100) || typeof s.alive !== 'boolean' ||
      !integer(s.respawnSeconds, 0, 600) || !integer(s.sourceAgeMs, 0, SOURCE_RETAIN_MS)) reject();
}

function publicStats(s) {
  return {
    hero: s.hero, level: s.level, hp: s.hp, maxHp: s.maxHp,
    manaPercent: s.manaPercent, alive: s.alive, respawnSeconds: s.respawnSeconds,
  };
}

function readJson(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers['content-type'] ?? '')) reject();
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) reject();
  return new Promise((resolve, fail) => {
    let size = 0; let settled = false; let chunks = [];
    const invalid = () => {
      if (settled) return;
      settled = true; chunks = []; fail(new RelayError(400, 'invalid_request'));
    };
    request.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_BODY) { invalid(); return; }
      chunks.push(chunk);
    });
    request.once('end', () => {
      if (settled) return;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        settled = true; chunks = []; resolve(body);
      } catch { invalid(); }
    });
    request.once('error', invalid);
    request.once('aborted', invalid);
  });
}

function reply(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(status >= 400 ? { connection: 'close' } : {}),
  });
  response.end(status === 204 ? undefined : JSON.stringify(body));
}

/** Each server owns its rooms; the clock is injected for deterministic expiry tests. */
export function createRelay({ now = () => performance.now() } = {}) {
  const rooms = new Map();
  const attempts = new Map();

  function reap(at) {
    for (const [id, room] of rooms) {
      const owner = room.members.get(room.ownerId);
      if (at >= room.expiresAt || !owner || at - owner.lastSeen >= MEMBER_TTL) {
        rooms.delete(id); continue;
      }
      for (const [memberId, member] of room.members) {
        if (at - member.lastSeen >= MEMBER_TTL) room.members.delete(memberId);
        else if (member.sample && member.sample.sourceAgeMs + Math.max(0, at - member.observedAt) > SOURCE_RETAIN_MS) member.sample = null;
      }
    }
    for (const [key, entry] of attempts) if (at >= entry.until) attempts.delete(key);
  }

  function limit(ip, kind, maximum, at) {
    const key = `${kind}:${ip}`;
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= MAX_LIMITER_KEYS) reject(503, 'capacity');
      entry = { count: 0, until: at + 60_000 };
      attempts.set(key, entry);
    }
    if (entry.count >= maximum) reject(429, 'rate_limited');
    entry.count++;
  }

  function addMember(room, name, at) {
    const memberId = randomBytes(16).toString('hex');
    const memberToken = randomBytes(32).toString('hex');
    const member = {
      memberId, displayName: name, tokenHash: hash(memberToken), lastSeen: at,
      sequence: 0, lastSync: null, lastReplyAt: at, scope: null, sample: null, observedAt: at,
    };
    room.members.set(memberId, member);
    return { member, memberToken };
  }

  function membership(room, member, memberToken, invite, at) {
    return {
      roomId: room.roomId, memberId: member.memberId, memberToken,
      ownerId: room.ownerId, invite, expiresInMs: Math.max(0, Math.floor(room.expiresAt - at)),
    };
  }

  function authenticate(request, room) {
    const auth = request.headers.authorization ?? '';
    if (!/^Bearer [a-f0-9]{64}$/.test(auth)) reject(401, 'unauthorized');
    const token = auth.slice(7);
    const member = [...room.members.values()].find(m => secretMatches(token, m.tokenHash));
    if (!member) reject(401, 'unauthorized');
    return member;
  }

  function snapshot(room, viewer, at) {
    return {
      roomId: room.roomId, selfId: viewer.memberId, ownerId: room.ownerId,
      expiresInMs: Math.max(0, Math.floor(room.expiresAt - at)),
      members: [...room.members.values()].map(member => {
        const row = {
          memberId: member.memberId, displayName: member.displayName,
          isOwner: member.memberId === room.ownerId,
          state: 'waiting', ageMs: null, sample: null,
        };
        if (!viewer.scope || !member.scope) return row;
        if (viewer.scope.matchKey !== member.scope.matchKey || viewer.scope.team !== member.scope.team) {
          row.state = 'different_match'; return row;
        }
        if (!member.sample) return row;
        row.ageMs = Math.ceil(member.sample.sourceAgeMs + Math.max(0, at - member.observedAt));
        row.state = row.ageMs <= SOURCE_FRESH_MS ? 'live' : 'stale';
        if (row.state === 'live') row.sample = publicStats(member.sample);
        return row;
      }),
    };
  }

  const server = createServer({ maxHeaderSize: 8192 }, async (request, response) => {
    try {
      const at = now();
      reap(at);
      // Native clients send no Origin. Do not let arbitrary web pages drive a
      // loopback relay, and do not enable wildcard CORS for credentials.
      if (request.headers.origin) reject(403, 'forbidden');
      const path = request.url ?? '';
      if (path.includes('?') || path.includes('#') || path.length > 200) reject();
      if (request.method === 'GET' && path === '/health') {
        request.resume(); reply(response, 200, { ok: true, protocol: 1 }); return;
      }
      if (request.method === 'POST' && path === '/v1/rooms') {
        limit(request.socket.remoteAddress ?? 'unknown', 'create', 10, at);
        const body = await readJson(request);
        exactObject(body, ['displayName']);
        const name = displayName(body.displayName);
        if (rooms.size >= MAX_ROOMS) reject(503, 'capacity');
        const createdAt = now();
        const roomId = randomBytes(16).toString('hex');
        const inviteSecret = randomBytes(32).toString('hex');
        const room = { roomId, inviteHash: hash(inviteSecret), ownerId: '', expiresAt: createdAt + ROOM_TTL, members: new Map() };
        const { member, memberToken } = addMember(room, name, createdAt);
        room.ownerId = member.memberId;
        rooms.set(roomId, room);
        reply(response, 201, membership(room, member, memberToken, `GMP1.${roomId}.${inviteSecret}`, createdAt)); return;
      }
      if (request.method === 'POST' && path === '/v1/rooms/join') {
        limit(request.socket.remoteAddress ?? 'unknown', 'join', 20, at);
        const body = await readJson(request);
        exactObject(body, ['invite', 'displayName']);
        const name = displayName(body.displayName);
        const parsed = typeof body.invite === 'string' && INVITE.exec(body.invite);
        if (!parsed) reject();
        const joinedAt = now(); reap(joinedAt);
        const room = rooms.get(parsed[1]);
        if (!room || !secretMatches(parsed[2], room.inviteHash)) reject(404, 'room_unavailable');
        if (room.members.size >= MAX_MEMBERS) reject(409, 'room_full');
        const { member, memberToken } = addMember(room, name, joinedAt);
        reply(response, 201, membership(room, member, memberToken, null, joinedAt)); return;
      }
      const route = /^\/v1\/rooms\/([a-f0-9]{32})\/(sync|invite|members\/(?:me|[a-f0-9]{32}))$/.exec(path);
      if (!route) reject(404, 'room_unavailable');
      const room = rooms.get(route[1]);
      if (!room) reject(404, 'room_unavailable');
      const member = authenticate(request, room);
      const action = route[2];
      if (action === 'sync' && request.method === 'POST') {
        const body = await readJson(request);
        validateSync(body);
        const syncedAt = now(); reap(syncedAt);
        // Reading an HTTP body is asynchronous: leave/kick/expiry may have won
        // since auth. Never resurrect or publish a detached membership.
        if (rooms.get(room.roomId) !== room) reject(404, 'room_unavailable');
        if (room.members.get(member.memberId) !== member) reject(401, 'unauthorized');
        if (body.sequence <= member.sequence) reject(409, 'replayed_sequence');
        if (member.lastSync !== null && syncedAt - member.lastSync < 200) reject(429, 'rate_limited');
        // Supported clients await the previous admission/sync reply before
        // forming another sample. The whole interval is a conservative bound
        // on upload transit; receiving clients add their own whole RTT too.
        // After a timeout clients first await a null sync probe to restore this
        // ordering. Administrative requests never advance lastReplyAt.
        const uploadBound = Math.max(0, syncedAt - member.lastReplyAt);
        member.sequence = body.sequence; member.lastSync = syncedAt; member.lastSeen = syncedAt;
        member.scope = body.scope;
        member.sample = body.sample === null ? null : {
          ...body.sample, sourceAgeMs: Math.ceil(body.sample.sourceAgeMs + uploadBound),
        };
        member.observedAt = syncedAt; member.lastReplyAt = syncedAt;
        reply(response, 200, snapshot(room, member, syncedAt)); return;
      }
      if (action === 'invite' && request.method === 'POST') {
        if (member.memberId !== room.ownerId) reject(403, 'forbidden');
        exactObject(await readJson(request), []);
        reap(now());
        if (rooms.get(room.roomId) !== room) reject(404, 'room_unavailable');
        const secret = randomBytes(32).toString('hex');
        room.inviteHash = hash(secret);
        reply(response, 200, { invite: `GMP1.${room.roomId}.${secret}` }); return;
      }
      if (action.startsWith('members/') && request.method === 'DELETE') {
        request.resume();
        const targetId = action.slice('members/'.length);
        if (targetId === 'me') {
          if (member.memberId === room.ownerId) rooms.delete(room.roomId);
          else room.members.delete(member.memberId);
        } else {
          if (member.memberId !== room.ownerId || targetId === room.ownerId) reject(403, 'forbidden');
          if (!ID.test(targetId)) reject();
          room.members.delete(targetId);
        }
        reply(response, 204); return;
      }
      reject(404, 'room_unavailable');
    } catch (error) {
      request.resume();
      if (!response.headersSent && !response.destroyed) {
        reply(response, error instanceof RelayError ? error.status : 500,
          { error: error instanceof RelayError ? error.code : 'unavailable' });
      }
    }
  });
  server.maxConnections = 256;
  server.maxHeadersCount = 32;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.keepAliveTimeout = 5000;
  server.setTimeout(5000, socket => socket.destroy());
  const timer = setInterval(() => reap(now()), 1000);
  timer.unref();
  server.once('close', () => { clearInterval(timer); rooms.clear(); attempts.clear(); });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.G_PARTY_PORT ?? 8787);
  const host = process.env.G_PARTY_HOST ?? '127.0.0.1';
  if (!integer(port, 1, 65535)) {
    process.stderr.write('G_PARTY_PORT must be an integer from 1 to 65535.\n');
    process.exitCode = 1;
  } else {
    const server = createRelay();
    server.on('error', () => { process.stderr.write('G-Party relay could not listen.\n'); process.exitCode = 1; server.close(); });
    server.listen(port, host, () => { process.stdout.write('G-Party relay ready; protocol 1.\n'); });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      server.closeAllConnections(); server.close();
    });
  }
}
