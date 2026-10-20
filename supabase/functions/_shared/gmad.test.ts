import { assertEquals } from "jsr:@std/assert";
import { isPostOrOptions } from "./gmad.ts";

Deno.test("GMAD accepts only the documented function methods", () => {
  assertEquals(isPostOrOptions("POST"), true);
  assertEquals(isPostOrOptions("OPTIONS"), true);
  assertEquals(isPostOrOptions("GET"), false);
});
