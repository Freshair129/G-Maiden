import {
  signProof,
  signRedeem,
  verifyProof,
  verifyRedeem,
} from "./social_crypto.ts";
function assert(v: unknown) {
  if (!v) throw Error("assertion failed");
}
const key = "00".repeat(32),
  origin = "https://relay.example.test",
  now = 1700000000000;
export const vector = {
  v: 1,
  relayOrigin: origin,
  challenge: "11".repeat(32),
  roomId: "22".repeat(16),
  memberId: "33".repeat(16),
  ownerId: "33".repeat(16),
  generation: 1,
  memberIds: ["33".repeat(16)],
  issuedAtMs: now,
  expiresAtMs: now + 60000,
};
Deno.test("proof exact bytes, canonical encoding, exclusive expiry and signature mutations", async () => {
  const proof = await signProof(vector, key);
  assert(await verifyProof(proof, key, origin, now));
  for (
    const [p, o, t] of [
      [proof, origin, now + 60000],
      [proof, origin, now - 5001],
      [proof, origin + "/x", now],
      [proof + "=", origin, now],
      [proof.slice(0, -1) + "X", origin, now],
    ] as const
  ) assert(!await verifyProof(p, key, o, t));
  for (
    const payload of [{ ...vector, extra: true }, {
      ...vector,
      memberIds: [vector.memberId, vector.memberId],
    }, { ...vector, expiresAtMs: now + 60001 }]
  ) assert(!await verifyProof(await signProof(payload, key), key, origin, now));
});
Deno.test("redeem signs raw UTF8 including whitespace", async () => {
  const body = ' {"ticket":"x"}';
  const sig = await signRedeem(body, key);
  assert(await verifyRedeem(body, sig, key));
  assert(!await verifyRedeem(body.trim(), sig, key));
});
Deno.test("fixed shared relay vector matches exact signature", async () => {
  const proof = await signProof(vector, key);
  assert(proof.split(".")[1] === "wqozqxv-tD61g7YUki6NEayO3ftyBsVsND-oTYWlSOo");
});
Deno.test("future skew boundary, key/origin/claims changes and payload bounds", async () => {
  assert(
    await verifyProof(
      await signProof({
        ...vector,
        issuedAtMs: now + 5000,
        expiresAtMs: now + 60000,
      }, key),
      key,
      origin,
      now,
    ),
  );
  const proof = await signProof(vector, key);
  assert(!await verifyProof(proof, "01".repeat(32), origin, now));
  for (
    const payload of [
      { ...vector, roomId: "f".repeat(31) },
      { ...vector, memberIds: [] },
      { ...vector, memberIds: ["44".repeat(16)] },
      { ...vector, generation: 0 },
      { ...vector, generation: 1.5 },
      { ...vector, issuedAtMs: now + 5001 },
      { ...vector, expiresAtMs: now },
      { ...vector, relayOrigin: "https://evil.test" },
      { ...vector, challenge: "a".repeat(63) },
      { ...vector, secret: "x".repeat(2048) },
    ]
  ) assert(!await verifyProof(await signProof(payload, key), key, origin, now));
  const parts = proof.split(".");
  const changed = parts[0].slice(0, -1) + "A" + "." + parts[1];
  assert(!await verifyProof(changed, key, origin, now));
});
import { relayConfig } from "./social_crypto.ts";
Deno.test("production config canonical HTTPS only, no credentials, callback path or loopback", () => {
  assert(relayConfig(origin, key));
  for (
    const url of [
      "http://relay.example.test",
      "https://relay.example.test/",
      "https://relay.example.test/path",
      "https://relay.example.test?url=https://evil.test",
      "https://user:pw@relay.example.test",
      "https://localhost",
      "https://127.0.0.2",
      "https://[::1]",
      "https://[::ffff:127.0.0.1]",
    ]
  ) assert(!relayConfig(url, key));
  assert(!relayConfig(origin, "wrong"));
  assert(!relayConfig(undefined, key));
});
