import { requireSocialContext, withIamConnection } from "./iam_runtime.ts";
import { relayConfig } from "./social_crypto.ts";
import type { SocialDependencies } from "./social.ts";
export function socialRepository(): SocialDependencies["repository"] {
  return {
    action: (context, body, origin, proof, tokenHash) =>
      withIamConnection(async (client) => {
        const result = await client.queryObject<
          { result: Record<string, unknown> }
        >(
          "select social_private.action($1,$2,$3::jsonb,$4,$5::jsonb,$6) as result",
          [
            context.userId,
            context.sessionId,
            JSON.stringify(body),
            origin,
            proof ? JSON.stringify(proof) : null,
            tokenHash,
          ],
        );
        return result.rows[0].result;
      }),
    redeem: (ticketHash, nonceHash, origin) =>
      withIamConnection(async (client) => {
        const result = await client.queryObject<
          { result: Record<string, unknown> }
        >("select social_private.redeem($1,$2,$3) as result", [
          ticketHash,
          nonceHash,
          origin,
        ]);
        return result.rows[0].result;
      }),
  };
}
export function socialDependencies(): SocialDependencies {
  return {
    authorize: requireSocialContext,
    now: Date.now,
    config: relayConfig(
      Deno.env.get("G_PARTY_SOCIAL_RELAY_ORIGIN"),
      Deno.env.get("G_PARTY_SOCIAL_HMAC_KEY"),
    ),
    repository: socialRepository(),
  };
}
