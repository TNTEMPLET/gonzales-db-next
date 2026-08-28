import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  previewSportsConnectFile,
  previewSportsConnectFiles,
} from "../preview";

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

describe("previewSportsConnectFiles", () => {
  it("assigns multi-file uploads to load-order steps", () => {
    const summary = previewSportsConnectFiles([
      {
        fileName: "players.xlsx",
        headers: loadHeaders("player-reg-headers.json"),
        rows: [
          {
            "Division Name": "9U",
            "Team Name": "Yankees",
            "Player Full Name": "Sample Player",
            "User Email": "",
          },
          {
            "Division Name": "9U",
            "Team Name": "Yankees",
            "Player Full Name": "Other Player",
            "User Email": "parent@example.com",
          },
        ],
      },
      {
        fileName: "coaches.csv",
        headers: loadHeaders("coach-volunteer-headers.json"),
      },
      {
        fileName: "teams.csv",
        headers: loadHeaders("team-list-headers.json"),
      },
    ]);

    assert.equal(summary.files.length, 3);
    assert.equal(summary.unassignedFiles.length, 0);

    const playerStep = summary.loadOrder.find((s) => s.kind === "PLAYER_REG");
    const coachStep = summary.loadOrder.find((s) => s.kind === "COACH_VOLUNTEER");
    const teamStep = summary.loadOrder.find((s) => s.kind === "TEAM_LIST");
    assert.deepEqual(playerStep?.assignedFiles, ["players.xlsx"]);
    assert.deepEqual(coachStep?.assignedFiles, ["coaches.csv"]);
    assert.deepEqual(teamStep?.assignedFiles, ["teams.csv"]);

    const playerFile = summary.files.find((f) => f.fileName === "players.xlsx");
    assert.equal(playerFile?.missingGuardianEmailEstimate, 1);
  });

  it("marks unknown headers unassigned", () => {
    const one = previewSportsConnectFile({
      fileName: "noise.csv",
      headers: ["foo", "bar"],
    });
    assert.equal(one.detection.reportKind, null);
    const summary = previewSportsConnectFiles([
      { fileName: "noise.csv", headers: ["foo", "bar"] },
    ]);
    assert.deepEqual(summary.unassignedFiles, ["noise.csv"]);
  });
});
