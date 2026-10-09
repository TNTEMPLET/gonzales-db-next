import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ContentOrgId } from "@/lib/siteConfig";

import {
  canWriteRainoutByOrgForPreview,
  canWriteRainoutByOrgFromRoles,
  gameDayRainoutWriteForPreview,
  type DashboardRainoutPreviewRole,
} from "../dashboardPreview";
import { decideRainoutWrite } from "../writeAccess";

const ORGS = ["gonzales", "ascension", "fallball"] as const satisfies readonly ContentOrgId[];

describe("dashboard rainout role preview", () => {
  it("keeps the signed-in write flag when no preview is active", () => {
    assert.equal(gameDayRainoutWriteForPreview({ previewRole: "NONE", liveAllowed: true }), true);
    assert.equal(gameDayRainoutWriteForPreview({ previewRole: "NONE", liveAllowed: false }), false);
  });

  it("hides game-day controls for a park director preview even when the live viewer may write", () => {
    assert.equal(
      gameDayRainoutWriteForPreview({ previewRole: "PARK_DIRECTOR", liveAllowed: true }),
      false,
    );
    assert.equal(
      gameDayRainoutWriteForPreview({ previewRole: "PARK_DIRECTOR", liveAllowed: true }),
      decideRainoutWrite({ isMaster: false, role: "PARK_DIRECTOR", path: "game-day" }).allowed,
    );
  });

  it("follows decideRainoutWrite on the game-day path for board member and admin previews", () => {
    const roles = ["BOARD_MEMBER", "ADMIN"] as const satisfies readonly DashboardRainoutPreviewRole[];
    for (const previewRole of roles) {
      const allowed = gameDayRainoutWriteForPreview({ previewRole, liveAllowed: false });
      assert.equal(
        allowed,
        decideRainoutWrite({ isMaster: false, role: previewRole, path: "game-day" }).allowed,
      );
      assert.equal(allowed, true);
    }
  });

  it("shows only the read-only status for an all-star limited preview", () => {
    assert.equal(
      gameDayRainoutWriteForPreview({ previewRole: "ALL_STAR_VIEW_ONLY", liveAllowed: true }),
      false,
    );
    assert.equal(
      gameDayRainoutWriteForPreview({ previewRole: "ALL_STAR_VIEW_ONLY", liveAllowed: true }),
      decideRainoutWrite({ isMaster: false, role: null, path: "game-day" }).allowed,
    );
  });

  it("builds the UI-only canWriteRainoutByOrg map from each org's previewed role", () => {
    const liveByOrg = {
      gonzales: true,
      ascension: true,
      fallball: true,
    } satisfies Partial<Record<ContentOrgId, boolean>>;
    const previewed = canWriteRainoutByOrgForPreview({
      liveByOrg,
      previewRoleByOrg: {
        gonzales: "PARK_DIRECTOR",
        ascension: "BOARD_MEMBER",
        fallball: "ADMIN",
      },
    });

    assert.deepEqual(previewed, {
      gonzales: false,
      ascension: true,
      fallball: true,
    });
  });

  it("leaves a missing preview role on the live flag", () => {
    const previewed = canWriteRainoutByOrgForPreview({
      liveByOrg: { gonzales: true, ascension: false },
      previewRoleByOrg: { gonzales: "NONE" },
    });
    assert.equal(previewed.gonzales, true);
    assert.equal(previewed.ascension, false);
  });

  it("still grants a master admin on the live map, which the preview then replaces", () => {
    const live = canWriteRainoutByOrgFromRoles({
      orgs: ORGS,
      isMaster: true,
      roleByOrg: { gonzales: "PARK_DIRECTOR", ascension: null, fallball: "BOARD_MEMBER" },
    });
    assert.equal(live.gonzales, true);
    assert.equal(live.ascension, true);
    assert.equal(live.fallball, true);

    const previewed = canWriteRainoutByOrgForPreview({
      liveByOrg: live,
      previewRoleByOrg: {
        gonzales: "PARK_DIRECTOR",
        ascension: "PARK_DIRECTOR",
        fallball: "PARK_DIRECTOR",
      },
    });
    assert.equal(previewed.gonzales, false);
    assert.equal(previewed.ascension, false);
    assert.equal(previewed.fallball, false);
  });
});
