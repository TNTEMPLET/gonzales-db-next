import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(relativePath: string): string {
  return readFileSync(new URL(`../../../../${relativePath}`, import.meta.url), "utf8");
}

describe("game day rainout controls", () => {
  it("keeps the Game Day banner read-only", () => {
    const view = source("components/admin/gameDay/GameDayView.tsx");
    assert.match(view, /data-game-day-rainout="readonly"/);
    assert.match(view, /data\.rainoutLines/);
    assert.doesNotMatch(view, /setGameDayRainout|clearGameDayRainout/);
    assert.doesNotMatch(view, /Rain out/);
  });

  it("hides set and clear on the dashboard panel when the viewer cannot write", () => {
    const panel = source("components/admin/dashboard/GameDayPanel.tsx");
    assert.match(panel, /data-game-day-rainout=\{canWrite \? "editor" : "readonly"\}/);
    assert.match(panel, /\{canWrite \? \(/);
    assert.match(panel, /Rain out/);
    assert.match(panel, /Clear/);
  });

  it("applies the dashboard role preview in the UI and leaves action auth on the signed-in role", () => {
    const panel = source("components/admin/dashboard/GameDayPanel.tsx");
    assert.match(panel, /usePreviewedRainoutWrite/);
    assert.match(panel, /allowRolePreview/);
    const board = source("components/admin/dashboard/InSeasonBoard.tsx");
    assert.match(board, /allowRolePreview=\{allowRolePreview\}/);
    const hook = source("components/admin/dashboard/usePreviewedRainoutWrite.ts");
    assert.match(hook, /readAdminViewPreviewRole/);
    assert.match(hook, /gameDayRainoutWriteForPreview/);
    const actions = source("app/admin/game-day/actions.ts");
    assert.match(actions, /decideRainoutWrite\(\{ \.\.\.auth\.actor, path: "game-day" \}\)/);
    assert.doesNotMatch(actions, /readAdminViewPreviewRole|dashboardPreview/);
  });
});
