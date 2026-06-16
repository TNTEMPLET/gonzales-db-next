import assert from "node:assert/strict";
import test from "node:test";

import {
  littleLeagueSixTeamParticipantSlots,
  resolveLittleLeagueParticipantSlots,
} from "@/lib/tournament-brackets/littleLeagueParticipantShells";
import {
  officialTemplateByeCount,
  officialTemplateShellSize,
} from "@/lib/tournament-brackets/officialTemplatePowerOfTwo";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

test("officialTemplateShellSize uses smallest power-of-two shell", () => {
  assert.equal(officialTemplateShellSize(5), 8);
  assert.equal(officialTemplateShellSize(6), 8);
  assert.equal(officialTemplateShellSize(7), 8);
  assert.equal(officialTemplateShellSize(8), 8);
  assert.equal(officialTemplateShellSize(9), 16);
  assert.equal(officialTemplateShellSize(10), 16);
  assert.equal(officialTemplateByeCount(6), 2);
});

test("littleLeagueSixTeamParticipantSlots maps A–F into 8-slot LL PDF shell", () => {
  const slots = littleLeagueSixTeamParticipantSlots(["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(slots, ["A", "E", "F", "C", "D", BYE_SLOT_LABEL, BYE_SLOT_LABEL, "B"]);
});

test("resolveLittleLeagueParticipantSlots returns shells for 5 and 6 teams", () => {
  const five = resolveLittleLeagueParticipantSlots(5, ["A", "B", "C", "D", "E"]);
  assert.ok(five);
  assert.equal(five!.length, 8);
  const six = resolveLittleLeagueParticipantSlots(6, ["A", "B", "C", "D", "E", "F"]);
  assert.deepEqual(six, littleLeagueSixTeamParticipantSlots(["A", "B", "C", "D", "E", "F"]));
});
