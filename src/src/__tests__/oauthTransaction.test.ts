import { describe, expect, test } from "vitest";
import { oauthStateFromAuthorizationUrl } from "../oauthTransaction";

describe("oauthStateFromAuthorizationUrl", () => {
  test("returns the issuer-created state from a valid authorization URL", () => {
    expect(
      oauthStateFromAuthorizationUrl(
        "https://issuer.example/authorize?state=0123456789abcdef0123456789abcdef&code_challenge=x",
      ),
    ).toBe("0123456789abcdef0123456789abcdef");
  });

  test.each([
    "not a URL",
    "https://issuer.example/authorize",
    "https://issuer.example/authorize?state=short",
  ])("fails closed for an unusable authorization URL: %s", (url) => {
    expect(oauthStateFromAuthorizationUrl(url)).toBeNull();
  });

  test("rejects an oversized state", () => {
    const state = "x".repeat(4097);
    expect(oauthStateFromAuthorizationUrl(`https://issuer.example/authorize?state=${state}`)).toBeNull();
  });
});
