import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canAccessAdminModule,
  getAdminModuleLabel,
  getMinimumRoleForModule,
  suggestLeastPrivilegeRole,
  type AdminModule,
  type AdminRole,
} from "@/lib/auth/adminRoles";

const JOB_KEYS = ["SURVEYS", "SCHEDULER", "SPORTS_CONNECT", "ORDERS", "GAME_DAY", "DIVISION_AGES"] as const;

const ROLES: AdminRole[] = ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN", "MASTER_ADMIN"];

function allowed(role: AdminRole, module: AdminModule) {
  return canAccessAdminModule(role, module);
}

function restoreOrdersFlag(previous: string | undefined) {
  if (previous === undefined) delete process.env.ORDERS_ENABLED;
  else process.env.ORDERS_ENABLED = previous;
}

describe("admin job module keys", () => {
  it("sets the minimum role for each new key", () => {
    assert.equal(getMinimumRoleForModule("SURVEYS"), "ADMIN");
    assert.equal(getMinimumRoleForModule("SCHEDULER"), "ADMIN");
    assert.equal(getMinimumRoleForModule("SPORTS_CONNECT"), "ADMIN");
    assert.equal(getMinimumRoleForModule("ORDERS"), "MASTER_ADMIN");
    assert.equal(getMinimumRoleForModule("GAME_DAY"), "PARK_DIRECTOR");
    assert.equal(getMinimumRoleForModule("DIVISION_AGES"), "ADMIN");
    assert.equal(getAdminModuleLabel("DIVISION_AGES"), "Division ages");
    assert.equal(getMinimumRoleForModule("VENUES"), "MASTER_ADMIN");
    assert.equal(getAdminModuleLabel("VENUES"), "Shared parks");
  });

  it("keeps division ages at admin and above on org sites and the master site", () => {
    for (const masterDeployment of [false, true]) {
      assert.equal(
        canAccessAdminModule("PARK_DIRECTOR", "DIVISION_AGES", { masterDeployment }),
        false,
        `park director masterDeployment=${masterDeployment}`,
      );
      assert.equal(
        canAccessAdminModule("BOARD_MEMBER", "DIVISION_AGES", { masterDeployment }),
        false,
        `board member masterDeployment=${masterDeployment}`,
      );
      assert.equal(
        canAccessAdminModule("ADMIN", "DIVISION_AGES", { masterDeployment }),
        true,
        `admin masterDeployment=${masterDeployment}`,
      );
      assert.equal(
        canAccessAdminModule("MASTER_ADMIN", "DIVISION_AGES", { masterDeployment }),
        true,
        `master admin masterDeployment=${masterDeployment}`,
      );
    }
  });

  it("denies non-masters on the orders API gate and allows a master admin when orders are on", () => {
    const previous = process.env.ORDERS_ENABLED;
    process.env.ORDERS_ENABLED = "true";
    try {
      for (const role of ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN"] as const) {
        assert.equal(allowed(role, "ORDERS"), false, role);
      }
      assert.equal(allowed("MASTER_ADMIN", "ORDERS"), true);
    } finally {
      restoreOrdersFlag(previous);
    }
  });

  it("keeps surveys, the scheduler, and Sports Connect at admin and above", () => {
    for (const module of ["SURVEYS", "SCHEDULER", "SPORTS_CONNECT"] as const) {
      assert.equal(allowed("PARK_DIRECTOR", module), false);
      assert.equal(allowed("BOARD_MEMBER", module), false);
      assert.equal(allowed("ADMIN", module), true);
      assert.equal(allowed("MASTER_ADMIN", module), true);
    }
  });

  it("keeps game day open to every admin role", () => {
    for (const role of ROLES) {
      assert.equal(allowed(role, "GAME_DAY"), true, role);
    }
  });

  it("still lets a park director enter scores, open reports, and run season setup", () => {
    for (const module of ["SCORES", "REPORTS", "SEASON_SETUP", "GAME_DAY"] as const) {
      assert.equal(allowed("PARK_DIRECTOR", module), true, module);
    }
  });

  it("denies shared parks to everyone except a master admin", () => {
    for (const masterDeployment of [false, true]) {
      for (const role of ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN"] as const) {
        assert.equal(
          canAccessAdminModule(role, "VENUES", { masterDeployment }),
          false,
          `${role} masterDeployment=${masterDeployment}`,
        );
      }
    }
    assert.equal(canAccessAdminModule("MASTER_ADMIN", "VENUES", { masterDeployment: true }), true);
  });

  it("suggests the least role that covers the requested jobs", () => {
    assert.equal(suggestLeastPrivilegeRole(["GAME_DAY", "SCORES", "REPORTS"]).role, "PARK_DIRECTOR");
    assert.equal(suggestLeastPrivilegeRole(["ORDERS"]).role, "MASTER_ADMIN");
    assert.equal(suggestLeastPrivilegeRole(["SURVEYS", "SCHEDULER", "SPORTS_CONNECT"]).role, "ADMIN");
    assert.equal(suggestLeastPrivilegeRole(["ORDERS", "SURVEYS"]).role, "MASTER_ADMIN");
    assert.equal(suggestLeastPrivilegeRole(["ROLE_ASSIGNMENT"]).role, "MASTER_ADMIN");
    assert.equal(suggestLeastPrivilegeRole(["VENUES"]).role, "MASTER_ADMIN");
    assert.equal(suggestLeastPrivilegeRole([]).role, "PARK_DIRECTOR");
    for (const module of JOB_KEYS) {
      const suggestion = suggestLeastPrivilegeRole([module]);
      assert.equal(suggestion.role, getMinimumRoleForModule(module));
      assert.ok(suggestion.notes.length > 0);
    }
  });
});
