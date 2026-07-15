import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { detectSportsConnectReport } from "../columnProfiles";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../__fixtures__",
);

function loadHeaders(name: string): string[] {
  const raw = JSON.parse(
    readFileSync(join(fixturesDir, name), "utf8"),
  ) as { headers: string[] };
  return raw.headers;
}

describe("detectSportsConnectReport", () => {
  it("detects player registration exports", () => {
    const result = detectSportsConnectReport(
      loadHeaders("player-reg-headers.json"),
    );
    assert.equal(result.reportKind, "PLAYER_REG");
    assert.ok(result.confidence >= 0.55);
    assert.equal(result.missingRequiredGroups.length, 0);
  });

  it("detects coach/volunteer exports", () => {
    const result = detectSportsConnectReport(
      loadHeaders("coach-volunteer-headers.json"),
    );
    assert.equal(result.reportKind, "COACH_VOLUNTEER");
    assert.ok(result.confidence >= 0.55);
  });

  it("detects team list exports", () => {
    const result = detectSportsConnectReport(
      loadHeaders("team-list-headers.json"),
    );
    assert.equal(result.reportKind, "TEAM_LIST");
    assert.ok(result.confidence >= 0.55);
  });

  it("returns low confidence for unrelated headers", () => {
    const result = detectSportsConnectReport(["foo", "bar", "baz"]);
    assert.equal(result.reportKind, null);
    assert.ok(result.confidence < 0.55);
  });
});
