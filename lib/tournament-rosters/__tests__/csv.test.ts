import assert from "node:assert/strict";
import test from "node:test";

import { parseRosterCsv, rosterPlayersToGameChangerCsv, validateRosterPlayers } from "@/lib/tournament-rosters/csv";

test("parseRosterCsv accepts GameChanger roster columns", () => {
  const result = parseRosterCsv("First Name,Last Name,Jersey Number\nTrent,Templet,7\nAlex,Smith,12");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.players, [
    { firstName: "Trent", lastName: "Templet", jerseyNumber: "7" },
    { firstName: "Alex", lastName: "Smith", jerseyNumber: "12" },
  ]);
});

test("validateRosterPlayers reports missing required fields", () => {
  const result = validateRosterPlayers([{ firstName: "", lastName: "Templet", jerseyNumber: "" }]);
  assert.equal(result.players.length, 0);
  assert.ok(result.errors.some((error) => error.includes("first name")));
  assert.ok(result.errors.some((error) => error.includes("jersey number")));
});

test("rosterPlayersToGameChangerCsv exports strict import columns", () => {
  const csv = rosterPlayersToGameChangerCsv([{ firstName: "Trent", lastName: "Templet", jerseyNumber: "7" }]);
  assert.equal(csv, "First Name,Last Name,Jersey Number\nTrent,Templet,7");
});
