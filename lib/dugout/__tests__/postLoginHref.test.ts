import assert from "node:assert/strict";
import { test } from "node:test";

import { getPostLoginHref, isSafeNextPath } from "@/lib/dugout/postLoginHref";

test("isSafeNextPath only allows same-origin relative paths", () => {
  assert.equal(isSafeNextPath("/admin/scores"), true);
  assert.equal(isSafeNextPath("//evil.com"), false);
  assert.equal(isSafeNextPath("https://evil.com"), false);
  assert.equal(isSafeNextPath(null), false);
});

test("honors a safe next path over role defaults", () => {
  assert.equal(
    getPostLoginHref({ isAdmin: true, isCoach: true, nextParam: "/coach-corner" }),
    "/coach-corner",
  );
});

test("admins go to /admin even when they also coach", () => {
  assert.equal(getPostLoginHref({ isAdmin: true, isCoach: true }), "/admin");
  assert.equal(getPostLoginHref({ isAdmin: true, isCoach: false }), "/admin");
});

test("coaches who are not admins go to Dugout", () => {
  assert.equal(getPostLoginHref({ isAdmin: false, isCoach: true }), "/dugout");
});

test("everyone else lands on the public home", () => {
  assert.equal(getPostLoginHref({}), "/");
  assert.equal(getPostLoginHref({ isAdmin: false, isCoach: false }), "/");
});
