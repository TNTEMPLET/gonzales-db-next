import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";

import { DIVISION_AGES_WRITE_DENIED, gateDivisionAges } from "../access";

const DENIED: AdminRole[] = ["PARK_DIRECTOR", "BOARD_MEMBER"];
const ALLOWED: AdminRole[] = ["ADMIN", "MASTER_ADMIN"];

describe("division ages API auth", () => {
  it("denies park directors and board members and allows admin and master admin", () => {
    for (const role of DENIED) {
      assert.equal(canAccessAdminModule(role, "DIVISION_AGES"), false, role);
      assert.deepEqual(gateDivisionAges({ ok: true, role }, true), {
        ok: false,
        status: 403,
        message: DIVISION_AGES_WRITE_DENIED,
      });
    }
    for (const role of ALLOWED) {
      assert.equal(canAccessAdminModule(role, "DIVISION_AGES"), true, role);
      assert.deepEqual(gateDivisionAges({ ok: true, role }, true), { ok: true });
      assert.deepEqual(gateDivisionAges({ ok: true, role }, false), { ok: true });
    }
  });

  it("keeps a failed module check from becoming a write", () => {
    assert.deepEqual(gateDivisionAges({ ok: false, status: 401, message: "Unauthorized" }, true), {
      ok: false,
      status: 401,
      message: "Unauthorized",
    });
    assert.deepEqual(gateDivisionAges({ ok: false, status: 403, message: "Forbidden" }, false), {
      ok: false,
      status: 403,
      message: "Forbidden",
    });
  });
});
