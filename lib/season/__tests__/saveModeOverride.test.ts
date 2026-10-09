import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const OTHER_SEASON_FIELDS = /umpirePayJson|parishRegistrationFeeCents|divisionAgesJson/;

describe("season mode override writes", () => {
  it("updates only the three override columns", () => {
    const source = readFileSync(new URL("../saveModeOverride.ts", import.meta.url), "utf8");
    assert.match(source, /update:\s*\{[^}]*seasonModeOverride:/);
    assert.match(source, /seasonModeOverrideAt/);
    assert.match(source, /seasonModeOverrideByAdminId/);
    assert.doesNotMatch(source, OTHER_SEASON_FIELDS);
  });

  it("reads only the override column and falls back when that read throws", () => {
    const source = readFileSync(new URL("../loadMode.ts", import.meta.url), "utf8");
    assert.match(source, /settleSeasonModeOverride/);
    assert.match(source, /select:\s*\{\s*seasonModeOverride:\s*true\s*\}/);
    assert.doesNotMatch(source, OTHER_SEASON_FIELDS);
  });

  it("shows the control only when the signed-in admin is a master", () => {
    const source = readFileSync(
      new URL("../../../app/admin/season-setup/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(source, /adminUser\.isMaster \? await loadSeasonMode\(currentOrg\)/);
    assert.match(source, /<SeasonModeOverrideControl/);
  });

  it("keeps the save route master-only", () => {
    const source = readFileSync(
      new URL("../../../app/api/admin/season-mode/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(source, /isMaster/);
    assert.match(source, /saveSeasonModeOverride/);
    assert.doesNotMatch(source, OTHER_SEASON_FIELDS);
  });
});
