import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
const url = process.env.SOCIAL_TEST_DATABASE_URL;
import { requireFixture } from "./fixture.mjs";
requireFixture(url);
const id = (n) => {
  const s = createHash("md5").update(String(n)).digest("hex");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${
    s.slice(16, 20)
  }-${s.slice(20)}`;
};
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const actor = (n, b, h = null, p = null, session = "s" + n) =>
  `select social_private.action('${id(n)}','${id(session)}',${
    q(JSON.stringify(b))
  }::jsonb,'https://relay.example.test',${
    p ? q(JSON.stringify(p)) + "::jsonb" : "null"
  },${h ? q(h) : "null"});`;
let serial = 0;
const clients = [];
class DB {
  constructor(name) {
    this.name = name;
    this.buffer = "";
    this.pending = null;
    this.proc = spawn("psql", [url, "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
      env: { ...process.env, PGAPPNAME: name },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (d) => {
      this.buffer += d;
      this.flush();
    });
    this.proc.stderr.on("data", (d) => {
      this.errors = (this.errors || "") + d;
    });
    this.proc.on("exit", (code) => {
      if (this.pending) {
        this.pending.reject(Error(this.errors || `psql exited ${code}`));
      }
    });
    clients.push(this);
  }
  flush() {
    if (!this.pending) return;
    const pos = this.buffer.indexOf(this.pending.marker + "\n");
    if (pos < 0) return;
    const out = this.buffer.slice(0, pos).trim();
    this.buffer = this.buffer.slice(pos + this.pending.marker.length + 1);
    const p = this.pending;
    this.pending = null;
    clearTimeout(p.timer);
    p.resolve(out);
  }
  query(sql) {
    if (this.pending) throw Error("connection busy");
    return new Promise((resolve, reject) => {
      const marker = "DONE_" + (++serial);
      const timer = setTimeout(
        () => reject(Error("timeout " + this.name)),
        15000,
      );
      this.pending = { resolve, reject, marker, timer };
      this.proc.stdin.write(sql + "\n\\echo " + marker + "\n");
    });
  }
  async json(sql) {
    return JSON.parse(await this.query(sql));
  }
  close() {
    this.proc.kill();
  }
}
const admin = new DB("social-race-admin"),
  a = new DB("social-race-a"),
  b = new DB("social-race-b"),
  barrier = new DB("social-race-barrier");
const check = (x, msg) => {
  if (!x) throw Error(msg);
  console.log("PASS " + msg);
};
async function waiting(name) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const n = await admin.query(
      `select count(*) from pg_stat_activity where application_name=${
        q(name)
      } and cardinality(pg_blocking_pids(pid))>0;`,
    );
    if (Number(n) > 0) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("no lock barrier " + name);
}
async function fixture() {
  await admin.query(
    `truncate auth.users cascade; truncate social_private.rate_limits,social_private.redeem_nonces; insert into auth.users(id) select md5(n::text)::uuid from generate_series(1,600)n; insert into auth.sessions select md5('s'||n)::uuid,md5(n::text)::uuid from generate_series(1,600)n; insert into public.profiles(id,gid_code,display_name) select md5(n::text)::uuid,'G-TEST'||n,'Person'||n from generate_series(1,600)n;`,
  );
}
async function invite(sender = 1, recipient = 2, hash = "1".repeat(64)) {
  return await admin.query(
    `insert into social_private.friendships values(least('${
      id(sender)
    }'::uuid,'${id(recipient)}'::uuid),greatest('${id(sender)}'::uuid,'${
      id(recipient)
    }'::uuid)) on conflict do nothing; with i as(insert into social_private.invites(sender,sender_session,recipient,recipient_session,relay_origin,room_id,owner_id,member_id,generation,status,expires_at) values('${
      id(sender)
    }','${id("s" + sender)}','${id(recipient)}','${
      id("s" + recipient)
    }','https://relay.example.test',repeat('2',32),repeat('3',32),repeat('3',32),1,'accepted',clock_timestamp()+interval '5 minutes') returning id) insert into social_private.join_tickets select '${hash}',id,clock_timestamp()+interval '60 seconds' from i returning invite_id;`,
  );
}
let nonce = 0;
const redeem = (
  ticket = "1".repeat(64),
  n = String(++nonce).padStart(64, "0"),
) =>
  `select social_private.redeem('${ticket}','${n}','https://relay.example.test');`;
try {
  await Promise.all([
    a.query("set role gmaiden_iam_runtime;"),
    b.query("set role gmaiden_iam_runtime;"),
  ]);
  await fixture();
  await admin.query(
    `insert into social_private.friendships select least('${
      id(1)
    }'::uuid,md5(n::text)::uuid),greatest('${
      id(1)
    }'::uuid,md5(n::text)::uuid) from generate_series(100,298)n; insert into social_private.requests(sender,recipient,expires_at) values('${
      id(2)
    }','${id(1)}',clock_timestamp()+interval '30 days'),('${id(3)}','${
      id(1)
    }',clock_timestamp()+interval '30 days');`,
  );
  const ids = (await admin.query(
    "select id from social_private.requests order by sender;",
  )).split("\n");
  await barrier.query(
    `begin;select social_private.lock_accounts('${id(1)}',null);`,
  );
  const acceptA = a.json(
      actor(1, { action: "request_accept", requestId: ids[0] }),
    ),
    acceptB = b.json(actor(1, { action: "request_accept", requestId: ids[1] }));
  await waiting(a.name);
  await waiting(b.name);
  await barrier.query("commit;");
  const accepts = await Promise.all([acceptA, acceptB]);
  check(
    accepts.filter((x) => x.ok).length === 1 &&
      accepts.filter((x) => x.error === "limit_reached").length === 1,
    "concurrent acceptance at 199 permits exactly one",
  );
  check(
    await admin.query(
      `select count(*) from social_private.friendships where a='${
        id(1)
      }' or b='${id(1)}';`,
    ) === "200",
    "friend capacity never exceeded",
  );
  await fixture();
  await admin.query(
    `insert into social_private.requests(sender,recipient,expires_at) select '${
      id(1)
    }',md5(n::text)::uuid,clock_timestamp()+interval '30 days' from generate_series(100,148)n;`,
  );
  await barrier.query(
    `begin;select social_private.lock_accounts('${id(1)}',null);`,
  );
  const reqA = a.json(actor(2, { action: "request", gid: "G-TEST1" })),
    reqB = b.json(actor(3, { action: "request", gid: "G-TEST1" }));
  await waiting(a.name);
  await waiting(b.name);
  await barrier.query("commit;");
  const requests = await Promise.all([reqA, reqB]);
  check(
    requests.filter((x) => x.ok).length === 1 &&
      requests.filter((x) => x.error === "limit_reached").length === 1,
    "request-cap creation race permits exactly fifty",
  );
  await fixture();
  await invite();
  await a.query("begin;" + actor(1, { action: "block", gid: "G-TEST2" }));
  const denied = b.json(redeem());
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await denied).error === "unavailable",
    "block committed first denies redemption",
  );
  await fixture();
  await invite();
  await a.query("begin;");
  check(
    (await a.json(redeem())).roomId === "2".repeat(32),
    "redemption linearizes before later block",
  );
  const blocked = b.json(actor(1, { action: "block", gid: "G-TEST2" }));
  await waiting(b.name);
  await a.query("commit;");
  check((await blocked).ok, "later block commits after authorized redemption");
  check(
    (await b.json(redeem())).error === "unavailable",
    "redeem-first consumes once",
  );
  await fixture();
  await invite();
  await barrier.query(
    `begin;delete from auth.sessions where id='${id("s1")}';`,
  );
  const deleted = b.json(redeem());
  await waiting(b.name);
  await barrier.query("commit;");
  check(
    (await deleted).error === "unavailable",
    "session-delete-first denies admission",
  );
  await fixture();
  await invite();
  await a.query("begin;");
  check(
    (await a.json(redeem())).roomId,
    "admission-session-lock-first authorizes",
  );
  const revocation = barrier.query(
    `delete from auth.sessions where id='${id("s1")}';`,
  );
  await waiting(barrier.name);
  await a.query("commit;");
  await revocation;
  check(
    await admin.query(
      `select count(*) from auth.sessions where id='${id("s1")}';`,
    ) === "0",
    "revocation waits for authorized admission commit",
  );
  await fixture();
  await invite();
  await invite(3, 4, "2".repeat(64));
  await a.query("begin;");
  await a.json(redeem());
  const independent = await b.json(redeem("2".repeat(64)));
  check(
    independent.roomId,
    "unrelated admissions do not share long-held global lock",
  );
  await a.query("commit;");
  await fixture();
  await invite();
  await barrier.query(
    `begin;select social_private.lock_accounts('${id(1)}','${id(2)}');`,
  );
  const expires = b.json(redeem());
  await waiting(b.name);
  await barrier.query(
    "update social_private.join_tickets set expires_at=clock_timestamp();commit;",
  );
  check(
    (await expires).error === "unavailable",
    "expiry reached during pair lock wait denies admission",
  );
  await fixture();
  await invite();
  const sameNonce = "a".repeat(64);
  await a.query("begin;");
  check(
    (await a.json(redeem("1".repeat(64), sameNonce))).roomId,
    "first replay-race consumer authorized",
  );
  const replay = b.json(redeem("1".repeat(64), sameNonce));
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await replay).error === "unavailable",
    "concurrent nonce/ticket replay denied",
  );
  await fixture();
  const challenge = "b".repeat(64);
  await a.json(
    actor(1, {
      action: "challenge",
      purpose: "link",
      recipientGid: null,
      bindingRevision: 0,
    }, challenge),
  );
  const proof = {
    roomId: "2".repeat(32),
    memberId: "3".repeat(32),
    ownerId: "3".repeat(32),
    generation: 1,
    memberIds: ["3".repeat(32)],
    expiresAtMs: Date.now() + 60000,
  };
  await a.query("begin;");
  check(
    (await a.json(
      actor(
        1,
        { action: "link", bindingRevision: 0, consent: true },
        challenge,
        proof,
      ),
    )).ok,
    "first proof consumer binds",
  );
  const proofReplay = b.json(
    actor(
      1,
      { action: "link", bindingRevision: 0, consent: true },
      challenge,
      proof,
    ),
  );
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await proofReplay).error === "unavailable",
    "concurrent challenge replay denied",
  );
  const mintLink = (n, tokenHash, revision = 0, session = "s" + n) =>
    actor(
      n,
      {
        action: "challenge",
        purpose: "link",
        recipientGid: null,
        bindingRevision: revision,
      },
      tokenHash,
      null,
      session,
    );
  const initialLink = (n, tokenHash, payload, session = "s" + n) =>
    actor(
      n,
      {
        action: "link",
        bindingRevision: 0,
        consent: true,
      },
      tokenHash,
      payload,
      session,
    );
  const memberLock =
    `select pg_advisory_xact_lock(hashtextextended('https://relay.example.test' || '${
      "2".repeat(32)
    }' || '${"3".repeat(32)}',38039));`;
  const freshProof = () => ({ ...proof, expiresAtMs: Date.now() + 60000 });
  async function untilExpired(expiresAtMs) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (
        await admin.query(
          `select (extract(epoch from clock_timestamp())*1000 >= ${expiresAtMs})::text;`,
        ) === "true"
      ) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw Error("server clock did not reach the explicit expiry barrier");
  }
  await fixture();
  await a.query("begin;" + actor(1, { action: "unlink" }));
  const delayedMint = b.json(mintLink(1, "c".repeat(64)));
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await delayedMint).error === "conflict",
    "unlink committed before delayed mint rejects pre-unlink revision",
  );
  check(
    await admin.query("select count(*) from social_private.challenges;") ===
      "0",
    "delayed pre-unlink mint persists no new challenge",
  );

  await fixture();
  await a.json(mintLink(1, "c".repeat(64)));
  await a.query("begin;" + actor(1, { action: "unlink" }));
  const delayedInitial = b.json(initialLink(1, "c".repeat(64), freshProof()));
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await delayedInitial).error === "unavailable",
    "unlink before delayed consent-true initial link invalidates intent",
  );
  check(
    await admin.query(
      `select revision::text || ':' || (select count(*) from social_private.room_bindings)::text from social_private.binding_sessions where session_id='${
        id("s1")
      }';`,
    ) === "1:0",
    "acknowledged unlink leaves advanced revision and no revived binding",
  );

  await fixture();
  await a.json(mintLink(1, "c".repeat(64)));
  await a.query("begin;");
  await a.json(initialLink(1, "c".repeat(64), freshProof()));
  const laterUnlink = b.json(actor(1, { action: "unlink" }));
  await waiting(b.name);
  await a.query("commit;");
  await laterUnlink;
  check(
    await admin.query(
      `select revision::text || ':' || (select count(*) from social_private.room_bindings)::text from social_private.binding_sessions where session_id='${
        id("s1")
      }';`,
    ) === "1:0",
    "initial link first then acknowledged unlink clears the old binding",
  );

  // Different accounts reach the same member lock with a still-live old lease.
  // The explicit server-clock barrier lets that lease expire while both wait.
  await fixture();
  await a.json(mintLink(1, "c".repeat(64)));
  await b.json(mintLink(2, "d".repeat(64)));
  const leaseDeadline = Number(
    await admin.query(
      `insert into social_private.room_bindings values('${id(3)}','${
        id("s3")
      }','https://relay.example.test','${"2".repeat(32)}','${
        "3".repeat(32)
      }',1,clock_timestamp()+interval '2 seconds') returning ceil(extract(epoch from expires_at)*1000);`,
    ),
  );
  await barrier.query("begin;" + memberLock);
  const competingA = a.json(initialLink(1, "c".repeat(64), freshProof()));
  const competingB = b.json(initialLink(2, "d".repeat(64), freshProof()));
  await waiting(a.name);
  await waiting(b.name);
  await untilExpired(leaseDeadline);
  await barrier.query("commit;");
  const competing = await Promise.all([competingA, competingB]);
  check(
    competing.filter((x) => x.ok).length === 1 &&
      competing.filter((x) => x.error === "conflict").length === 1,
    "competing accounts at member lease expiry produce exactly one new binding",
  );
  check(
    await admin.query(
      "select count(*) from social_private.room_bindings where expires_at>clock_timestamp();",
    ) === "1",
    "unique member remains singular after concurrent expired-lease replacement",
  );

  await fixture();
  await admin.query(
    `insert into auth.sessions values('${id("other1")}','${id(1)}');`,
  );
  await a.json(mintLink(1, "c".repeat(64)));
  await b.json(mintLink(1, "d".repeat(64), 0, "other1"));
  await a.query("begin;");
  await a.json(initialLink(1, "c".repeat(64), freshProof()));
  const otherSession = b.json(
    initialLink(1, "d".repeat(64), freshProof(), "other1"),
  );
  await waiting(b.name);
  await a.query("commit;");
  check(
    (await otherSession).error === "conflict",
    "another session of the same account cannot replace a live member binding",
  );
  check(
    await admin.query(
      `select session_id::text from social_private.room_bindings;`,
    ) === id("s1"),
    "winning member label remains attached to its original session",
  );

  await fixture();
  await a.json(mintLink(1, "c".repeat(64)));
  await barrier.query("begin;" + memberLock);
  const shortProof = { ...freshProof(), expiresAtMs: Date.now() + 2000 };
  const expiresAtMember = a.json(initialLink(1, "c".repeat(64), shortProof));
  await waiting(a.name);
  await untilExpired(shortProof.expiresAtMs);
  await barrier.query("commit;");
  check(
    (await expiresAtMember).error === "unavailable",
    "proof expiry reached during member lock wait denies initial link",
  );
  check(
    await admin.query("select count(*) from social_private.room_bindings;") ===
      "0",
    "expired waiting initial proof persists no member binding",
  );

  await fixture();
  await a.json(mintLink(1, "c".repeat(64)));
  const renewalDeadline = Number(
    await admin.query(
      `insert into social_private.room_bindings values('${id(1)}','${
        id("s1")
      }','https://relay.example.test','${"2".repeat(32)}','${
        "3".repeat(32)
      }',1,clock_timestamp()+interval '2 seconds') returning ceil(extract(epoch from expires_at)*1000);`,
    ),
  );
  await barrier.query("begin;" + memberLock);
  const renewal = a.json(
    actor(
      1,
      { action: "link", bindingRevision: 0, consent: false },
      "c".repeat(64),
      freshProof(),
    ),
  );
  await waiting(a.name);
  await untilExpired(renewalDeadline);
  await barrier.query("commit;");
  check(
    (await renewal).error === "consent_required",
    "renewal lease expiring during member lock wait requires fresh consent",
  );
  check(
    await admin.query(
      "select count(*) from social_private.room_bindings where expires_at>clock_timestamp();",
    ) === "0",
    "waiting renewal never extends an expired consent lease",
  );
  console.log("PASS deterministic SQL concurrency suite");
} finally {
  for (const c of clients) c.close();
}
