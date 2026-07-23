import { assertEquals } from "jsr:@std/assert";
import { isPostOrOptions, normaliseGid } from "./gmad.ts";

Deno.test("GMAD accepts only the documented function methods", () => {
  assertEquals(isPostOrOptions("POST"), true);
  assertEquals(isPostOrOptions("OPTIONS"), true);
  assertEquals(isPostOrOptions("GET"), false);
});

Deno.test("GMAD normalises only syntactically plausible GIDs", () => {
  assertEquals(normaliseGid(" g-b234567z "), "G-B234567Z");
  assertEquals(normaliseGid("not-a-gid"), null);
  assertEquals(normaliseGid(42), null);
});
