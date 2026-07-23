import { assertEquals } from "jsr:@std/assert";
import { corsJson, corsPreflight, isAllowedMintMethod } from "./cors.ts";

Deno.test("mint-gid preflight permits the browser request headers", () => {
  const response = corsPreflight();

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    response.headers.get("Access-Control-Allow-Headers"),
    "authorization, x-client-info, apikey, content-type",
  );
  assertEquals(response.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
});

Deno.test("mint-gid errors retain CORS headers", () => {
  const response = corsJson(401, { error: "missing authorization" });

  assertEquals(response.status, 401);
  assertEquals(response.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(response.headers.get("Content-Type"), "application/json");
});

Deno.test("mint-gid advertised methods exclude non-POST requests", () => {
  assertEquals(isAllowedMintMethod("POST"), true);
  assertEquals(isAllowedMintMethod("OPTIONS"), true);
  assertEquals(isAllowedMintMethod("GET"), false);
});
