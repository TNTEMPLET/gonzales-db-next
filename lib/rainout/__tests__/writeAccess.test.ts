import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminRole } from "@/lib/auth/adminRoles";

import {
  crossLeagueRainoutActor,
  decideRainoutWrite,
  RAINOUT_WRITE_DENIED_MESSAGE,
  type RainoutWritePath,
} from "../writeAccess";

const PATHS: RainoutWritePath[] = ["game-day", "park-alerts"];

function denied(decision: ReturnType<typeof decideRainoutWrite>) {
  assert.equal(decision.allowed, false);
  if (decision.allowed) return;
  assert.equal(decision.status, 403);
  assert.equal(decision.message, RAINOUT_WRITE_DENIED_MESSAGE);
}

describe("rainout write access", () => {
  it("lets a master admin set and clear rainouts on every path", () => {
    for (const path of PATHS) {
      assert.equal(decideRainoutWrite({ isMaster: true, role: "MASTER_ADMIN", path }).allowed, true);
      assert.equal(decideRainoutWrite({ isMaster: true, role: null, path }).allowed, true);
      assert.equal(
        decideRainoutWrite({ isMaster: true, role: "PARK_DIRECTOR", path }).allowed,
        true,
        path,
      );
    }
  });

  it("lets a league admin set and clear rainouts on every path", () => {
    for (const path of PATHS) {
      assert.equal(decideRainoutWrite({ isMaster: false, role: "ADMIN", path }).allowed, true, path);
      assert.equal(
        decideRainoutWrite({ isMaster: false, role: "MASTER_ADMIN", path }).allowed,
        true,
        path,
      );
    }
  });

  it("keeps board members on today's gates", () => {
    assert.equal(
      decideRainoutWrite({ isMaster: false, role: "BOARD_MEMBER", path: "game-day" }).allowed,
      true,
    );
    denied(decideRainoutWrite({ isMaster: false, role: "BOARD_MEMBER", path: "park-alerts" }));
    denied(decideRainoutWrite({ isMaster: false, role: null, path: "game-day" }));
    denied(decideRainoutWrite({ isMaster: false, role: null, path: "park-alerts" }));
  });

  it("refuses a park director on every path", () => {
    for (const path of PATHS) {
      denied(decideRainoutWrite({ isMaster: false, role: "PARK_DIRECTOR", path }));
    }
  });

  it("refuses a park director who also holds another non-admin role", () => {
    const otherRoles: AdminRole[] = ["BOARD_MEMBER"];
    for (const path of PATHS) {
      denied(
        decideRainoutWrite({
          isMaster: false,
          role: "PARK_DIRECTOR",
          otherRoles,
          path,
        }),
      );
      denied(
        decideRainoutWrite({
          isMaster: false,
          role: "PARK_DIRECTOR",
          otherRoles: ["BOARD_MEMBER", "PARK_DIRECTOR"],
          path,
        }),
      );
    }
  });

  it("does not let another league's admin role write this league when the role here is park director", () => {
    denied(
      decideRainoutWrite({
        isMaster: false,
        role: "PARK_DIRECTOR",
        otherRoles: ["ADMIN"],
        path: "game-day",
      }),
    );
  });
});

describe("cross-league park alert writes", () => {
  it("denies a missing role on the other league unless the caller is a master", () => {
    const missing = crossLeagueRainoutActor({ isMaster: false, targetRole: null });
    denied(missing.decision);
    assert.equal(missing.actor.role, null);
    assert.equal(missing.actor.isMaster, false);

    const master = crossLeagueRainoutActor({ isMaster: true, targetRole: null });
    assert.equal(master.decision.allowed, true);
    assert.equal(master.actor.role, null);
    assert.equal(master.actor.isMaster, true);
  });

  it("judges the other league by that league's role", () => {
    const board = crossLeagueRainoutActor({ isMaster: false, targetRole: "BOARD_MEMBER" });
    denied(board.decision);
    assert.equal(board.actor.role, "BOARD_MEMBER");

    const director = crossLeagueRainoutActor({ isMaster: false, targetRole: "PARK_DIRECTOR" });
    denied(director.decision);
    assert.equal(director.actor.role, "PARK_DIRECTOR");

    const admin = crossLeagueRainoutActor({ isMaster: false, targetRole: "ADMIN" });
    assert.equal(admin.decision.allowed, true);
    assert.equal(admin.actor.role, "ADMIN");
  });
});
