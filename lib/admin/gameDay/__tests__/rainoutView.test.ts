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
});
