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

test("parseRosterCsv finds roster headers after spreadsheet preamble rows", () => {
  const result = parseRosterCsv(`GNO Little League,,,
2026 All-Star Teams,,,
Coaches/Mgr,,,

#,Player Name,League,Division
7,"Templet, Trent",GNO Nord,10U
12,Alex Smith,GNO Nord,10U`);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.players, [
    { firstName: "Trent", lastName: "Templet", jerseyNumber: "7" },
    { firstName: "Alex", lastName: "Smith", jerseyNumber: "12" },
  ]);
});

test("parseRosterCsv accepts tab-delimited sheets with jersey aliases", () => {
  const result = parseRosterCsv("Team roster\nNo\tFirst\tLast\tNotes\n3\tSam\tJones\tPitcher\n8\tLee\tBrown\t");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.players, [
    { firstName: "Sam", lastName: "Jones", jerseyNumber: "3" },
    { firstName: "Lee", lastName: "Brown", jerseyNumber: "8" },
  ]);
});

test("parseRosterCsv can infer simple rows without a header", () => {
  const result = parseRosterCsv("Trent,Templet,7\nAlex Smith,12");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.players, [
    { firstName: "Trent", lastName: "Templet", jerseyNumber: "7" },
    { firstName: "Alex", lastName: "Smith", jerseyNumber: "12" },
  ]);
});

test("parseRosterCsv reports helpful message for non-roster summary sheets", () => {
  const result = parseRosterCsv("League,Division,Players,Tab\nGNO Nord,10U,12,Nord 10U");
  assert.equal(result.players.length, 0);
  assert.ok(result.errors.some((error) => error.includes("Could not find roster columns")));
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
