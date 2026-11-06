import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { createRelay } from './server.mjs';

const scope = { matchKey: 'a'.repeat(64), team: 'radiant' };
const sample = {
  hero: 'npc_dota_hero_crystal_maiden', level: 12, hp: 721, maxHp: 1200,
  manaPercent: 63, alive: true, respawnSeconds: 0, sourceAgeMs: 100,
};

async function fixture(t, options = {}) {
  const clock = { ms: 1000 };
  const server = createRelay({ now: () => clock.ms, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = 'POST', body, token, headers = {} } = {}) => {
    const response = await fetch(base + path, {
      method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  };
  const create = async (displayName = 'บอส') => {
    const response = await call('/v1/rooms', { body: { displayName } });
    assert.equal(response.status, 201, 'a valid explicit create request is admitted');
    return response.body;
  };
  const join = async (owner, displayName = 'เพื่อน') => {
    const response = await call('/v1/rooms/join', { body: { invite: owner.invite, displayName } });
    assert.equal(response.status, 201);
    return response.body;
  };
  const sync = (member, sequence, sourceScope = scope, sourceSample = sample) => call(`/v1/rooms/${member.roomId}/sync`, {
    token: member.memberToken, body: { sequence, scope: sourceScope, sample: sourceSample },
  });
  return { server, clock, base, call, create, join, sync };
}

test('two actual HTTP clients exchange only their own allowlisted same-team stats', async t => {
  const f = await fixture(t);
  const owner = await f.create();
  const friend = await f.join(owner);
  assert.match(owner.invite, /^GMP1\.[a-f0-9]{32}\.[a-f0-9]{64}$/);
  assert.equal(friend.invite, null);
  assert.notEqual(friend.memberToken, owner.memberToken);
  await f.sync(owner, 1);
  const result = await f.sync(friend, 1, scope, { ...sample, hero: 'npc_dota_hero_axe', hp: 900 });
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.body.members.length, 2);
  const ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.state, 'live');
  assert.equal(ally.sample.hp, 721);
  assert.equal(ally.ageMs, 100);
  assert.deepEqual(Object.keys(ally.sample).sort(), ['alive', 'hero', 'hp', 'level', 'manaPercent', 'maxHp', 'respawnSeconds'].sort());
  const serialized = JSON.stringify(result.body);
  for (const secret of [owner.memberToken, friend.memberToken, owner.invite, scope.matchKey]) assert.ok(!serialized.includes(secret));
});

test('room, match, team, and absent-GSI fences withhold all hero/vitals', async t => {
  const f = await fixture(t);
  const owner = await f.create();
  const friend = await f.join(owner);
  const stranger = await f.create('another room');
  await f.sync(owner, 1);
  let result = await f.sync(friend, 1, { ...scope, team: 'dire' });
  let ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.state, 'different_match');
  assert.equal(ally.sample, null); assert.equal(ally.ageMs, null);
  f.clock.ms += 500;
  result = await f.sync(friend, 2, { ...scope, matchKey: 'b'.repeat(64) });
  ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.state, 'different_match'); assert.equal(ally.sample, null);
  f.clock.ms += 500;
  result = await f.sync(friend, 3, null, null);
  assert.ok(result.body.members.every(m => m.sample === null && m.state === 'waiting'));
  result = await f.call(`/v1/rooms/${owner.roomId}/sync`, { token: stranger.memberToken, body: { sequence: 4, scope, sample } });
  assert.equal(result.status, 401);
});

test('polling cannot refresh another member source age; stale values are hidden', async t => {
  const f = await fixture(t);
  const owner = await f.create(); const friend = await f.join(owner);
  await f.sync(owner, 1);
  f.clock.ms += 1900;
  let result = await f.sync(friend, 1);
  let ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.ageMs, 2000); assert.equal(ally.state, 'live');
  f.clock.ms += 201;
  result = await f.sync(friend, 2);
  ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.ageMs, 2201); assert.equal(ally.state, 'stale'); assert.equal(ally.sample, null);
  f.clock.ms += 500;
  await f.sync(owner, 2, null, null);
  result = await f.sync(friend, 3);
  ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.state, 'waiting'); assert.equal(ally.sample, null);
});

test('a slow publisher upload cannot make an already old sample fresh at relay receipt', async t => {
  const f = await fixture(t);
  const owner = await f.create(); const friend = await f.join(owner);
  // The sender had to receive its previous reply before starting this upload.
  // That whole server-measured interval bounds upload delay without clock sync.
  f.clock.ms += 1500;
  await f.sync(owner, 1, scope, { ...sample, sourceAgeMs: 800 });
  const result = await f.sync(friend, 1);
  const ally = result.body.members.find(m => m.memberId === owner.memberId);
  assert.equal(ally.state, 'stale');
  assert.equal(ally.ageMs, 2300);
  assert.equal(ally.sample, null);
});

test('forged extra fields, malformed vitals and sequence replay never replace a publication', async t => {
  const f = await fixture(t);
  const owner = await f.create(); const friend = await f.join(owner);
  await f.sync(owner, 1);
  f.clock.ms += 500;
  assert.equal((await f.sync(owner, 1, scope, { ...sample, hp: 1 })).status, 409);
  for (const bad of [
    { ...sample, steamid: 'private' }, { ...sample, items: [] },
    { ...sample, hp: 1201 }, { ...sample, hp: null }, { ...sample, alive: 'true' },
    { ...sample, manaPercent: 101 }, { ...sample, sourceAgeMs: -1 },
    { ...sample, hero: 'npc_dota_hero_<script>' },
  ]) {
    const result = await f.sync(owner, 2, scope, bad);
    assert.equal(result.status, 400);
  }
  assert.equal((await f.call(`/v1/rooms/${owner.roomId}/sync`, { token: owner.memberToken, body: { sequence: 2, scope, sample, memberId: friend.memberId } })).status, 400);
  const result = await f.sync(friend, 1);
  assert.equal(result.body.members.find(m => m.memberId === owner.memberId).sample.hp, 721);
});

test('owner kicks, invite rotation, member leave and owner close revoke their distinct capabilities', async t => {
  const f = await fixture(t);
  const owner = await f.create(); const friend = await f.join(owner);
  let result = await f.call(`/v1/rooms/${owner.roomId}/members/${owner.memberId}`, { method: 'DELETE', token: friend.memberToken });
  assert.equal(result.status, 403);
  result = await f.call(`/v1/rooms/${owner.roomId}/invite`, { token: friend.memberToken, body: {} });
  assert.equal(result.status, 403);
  result = await f.call(`/v1/rooms/${owner.roomId}/members/${friend.memberId}`, { method: 'DELETE', token: owner.memberToken });
  assert.equal(result.status, 204);
  assert.equal((await f.sync(friend, 1)).status, 401);
  const rotated = await f.call(`/v1/rooms/${owner.roomId}/invite`, { token: owner.memberToken, body: {} });
  assert.equal(rotated.status, 200); assert.notEqual(rotated.body.invite, owner.invite);
  assert.equal((await f.call('/v1/rooms/join', { body: { invite: owner.invite, displayName: 'old code' } })).status, 404);
  const newFriend = await f.join({ ...owner, invite: rotated.body.invite });
  assert.equal((await f.call(`/v1/rooms/${owner.roomId}/members/me`, { method: 'DELETE', token: newFriend.memberToken })).status, 204);
  assert.equal((await f.sync(newFriend, 1)).status, 401);
  assert.equal((await f.call(`/v1/rooms/${owner.roomId}/members/me`, { method: 'DELETE', token: owner.memberToken })).status, 204);
  assert.equal((await f.sync(owner, 1)).status, 404);
});

test('five-member capacity, membership expiry and maximum room lifetime are bounded', async t => {
  const f = await fixture(t);
  const owner = await f.create();
  for (let i = 0; i < 4; i++) await f.join(owner, `friend ${i}`);
  assert.equal((await f.call('/v1/rooms/join', { body: { invite: owner.invite, displayName: 'sixth' } })).status, 409);
  f.clock.ms += 29000; await f.sync(owner, 1);
  f.clock.ms += 1001;
  const newcomer = await f.join(owner, 'replacement');
  const result = await f.sync(newcomer, 1);
  assert.equal(result.body.members.length, 2);
  f.clock.ms += 4 * 60 * 60 * 1000;
  assert.equal((await f.sync(owner, 2)).status, 404);
});

test('origin, oversized bodies, query credentials and invalid names are rejected', async t => {
  const f = await fixture(t);
  for (const displayName of ['', 'x'.repeat(33), 'line\nbreak']) {
    assert.equal((await f.call('/v1/rooms', { body: { displayName } })).status, 400);
  }
  assert.equal((await f.call('/v1/rooms', { body: { displayName: 'name', extra: 'raw GSI' } })).status, 400);
  assert.equal((await f.call('/v1/rooms', { body: { displayName: 'name' }, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await f.call('/v1/rooms?token=secret', { body: { displayName: 'name' } })).status, 400);
  assert.equal((await f.call('/v1/rooms', { body: { displayName: 'x'.repeat(5000) } })).status, 400);
  const result = await f.call('/health', { method: 'GET' });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { ok: true, protocol: 1 });
});

test('a joined nickname cannot poison Rust string decoding with an unpaired surrogate', async t => {
  const f = await fixture(t);
  const owner = await f.create('บอส');
  for (const displayName of ['\ud800', '\udfff', 'เพื่อน\ud800']) {
    assert.equal((await f.call('/v1/rooms/join', { body: { invite: owner.invite, displayName } })).status, 400);
    assert.equal((await f.call('/v1/rooms', { body: { displayName } })).status, 400);
  }
  const friend = await f.join(owner, 'เพื่อน 🧊🎮');
  const result = await f.sync(friend, 1);
  assert.equal(result.body.members.find(m => m.memberId === friend.memberId).displayName, 'เพื่อน 🧊🎮');
});

test('creation and sync rates are bounded without trusting forwarded IP headers', async t => {
  const f = await fixture(t);
  const owner = await f.create();
  assert.equal((await f.sync(owner, 1)).status, 200);
  assert.equal((await f.sync(owner, 2)).status, 429);
  f.clock.ms += 200;
  assert.equal((await f.sync(owner, 2)).status, 200);
  for (let i = 0; i < 9; i++) await f.create(`owner ${i}`);
  const result = await f.call('/v1/rooms', { body: { displayName: 'too many' }, headers: { 'x-forwarded-for': '8.8.8.8' } });
  assert.equal(result.status, 429);
  f.clock.ms += 60000;
  assert.equal((await f.call('/v1/rooms', { body: { displayName: 'later' } })).status, 201);
});

test('chunked oversize input is bounded, not just Content-Length', async t => {
  const f = await fixture(t);
  const result = await new Promise((resolve, reject) => {
    const request = httpRequest(f.base + '/v1/rooms', { method: 'POST', headers: { 'content-type': 'application/json' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.write('{"displayName":"'); request.write('a'.repeat(4096)); request.end('"}');
  });
  assert.equal(result, 400);
});
