import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import {
  buildLittleLeagueSixTeamModifiedDeRounds,
  buildLittleLeagueSixTeamStandardDeRounds,
} from "@/lib/tournament-brackets/ingestion/buildLittleLeagueSixTeamRounds";
import { buildRoundsFromPdfIngest } from "@/lib/tournament-brackets/ingestion/buildRoundsFromPdfIngest";
import { extractPdfTextHeuristic } from "@/lib/tournament-brackets/ingestion/extractPdfText";
import {
  normalizePdfFeederLabel,
  parsePdfGameFeederSlots,
  parsePdfGameSchedule,
  parseScheduleLine,
  pdfFeedersMatchLittleLeagueSixTeamDe,
  inferSixTeamChampionshipSeriesStyleFromFeeders,
} from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";
import { parsePdfBracketTemplate } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";
import { extractVisualPdfTeams } from "@/lib/tournament-brackets/ingestion/parsePdfVisualBracketInfo";

test("normalizePdfFeederLabel maps DocHub winner/loser labels", () => {
  assert.equal(normalizePdfFeederLabel("Winner of Game #3"), "W3");
  assert.equal(normalizePdfFeederLabel("Loser From Game #7"), "L7");
  assert.equal(normalizePdfFeederLabel("Loser of Game #10"), "L10");
});

test("buildLittleLeagueSixTeamStandardDeRounds produces 11 numbered games with G11 if-necessary", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildLittleLeagueSixTeamStandardDeRounds(teams);
  const matches = rounds.flatMap((r) => r.matches);
  const nums = matches.map((m) => m.officialGameNumber).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(nums, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"]);
  const g10 = matches.find((m) => m.officialGameNumber === "10");
  assert.equal(g10?.home, "W7");
  assert.equal(g10?.away, "W9");
  assert.equal(g10?.championshipRole, "grand_final");
  const g11 = matches.find((m) => m.officialGameNumber === "11");
  assert.equal(g11?.home, "W10");
  assert.equal(g11?.away, "L10");
  assert.equal(g11?.championshipRole, "if_necessary");
});

test("buildLittleLeagueSixTeamModifiedDeRounds uses 8-slot shell: two openers and bye semis", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildLittleLeagueSixTeamModifiedDeRounds(teams);
  const matches = rounds.flatMap((r) => r.matches);
  const g3 = matches.find((m) => m.officialGameNumber === "3");
  const g4 = matches.find((m) => m.officialGameNumber === "4");
  assert.equal(g3?.home, "W1");
  assert.equal(g3?.away, "E");
  assert.equal(g4?.home, "W2");
  assert.equal(g4?.away, "F");
  const winnersR1 = rounds.find((r) => r.label === "Winners Bracket — Round 1");
  assert.equal(winnersR1?.matches.length, 2);
});

test("buildLittleLeagueSixTeamModifiedDeRounds produces 10 numbered games winner-take-all at G10", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildLittleLeagueSixTeamModifiedDeRounds(teams);
  const matches = rounds.flatMap((r) => r.matches);
  const nums = matches.map((m) => m.officialGameNumber).sort((a, b) => Number(a) - Number(b));
  assert.deepEqual(nums, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
  const g1 = matches.find((m) => m.officialGameNumber === "1");
  assert.equal(g1?.home, "A");
  assert.equal(g1?.away, "B");
  const g10 = matches.find((m) => m.officialGameNumber === "10");
  assert.equal(g10?.championshipRole, "grand_final");
});

test("buildLittleLeagueSixTeamModifiedDeRounds applies schedule lines by game number", () => {
  const schedule = new Map([
    [1, { dateLabel: "6/26", time: "7:30pm", field: "F4" }],
    [2, { dateLabel: "6/26", time: "7:30pm", field: "F3" }],
  ]);
  const rounds = buildLittleLeagueSixTeamModifiedDeRounds(["A", "B", "C", "D", "E", "F"], schedule);
  const g1 = rounds.flatMap((r) => r.matches).find((m) => m.officialGameNumber === "1");
  assert.equal(g1?.dateLabel, "6/26");
  assert.equal(g1?.time, "7:30pm");
  assert.equal(g1?.field, "F4");
});

test("parsePdfGameFeederSlots reads District 2 PDF routing", () => {
  const pdfPath = process.env.BRACKET_PDF_FIXTURE;
  if (!pdfPath) return;
  const buf = readFileSync(pdfPath);
  const text = extractPdfTextHeuristic(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const slots = parsePdfGameFeederSlots(text);
  assert.equal(pdfFeedersMatchLittleLeagueSixTeamDe(slots), true);
  assert.equal(inferSixTeamChampionshipSeriesStyleFromFeeders(slots), "always_scheduled_reset");
  const g5 = slots.find((s) => s.gameNumber === 5);
  assert.deepEqual(g5, { gameNumber: 5, home: "L1", away: "L4" });
});

test("parsePdfGameSchedule reads game info blocks from District 2 PDF", () => {
  const pdfPath = process.env.BRACKET_PDF_FIXTURE;
  if (!pdfPath) return;
  const buf = readFileSync(pdfPath);
  const text = extractPdfTextHeuristic(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const schedule = parsePdfGameSchedule(text);
  assert.ok(schedule.size >= 4);
  assert.deepEqual(schedule.get(1), { dateLabel: "6/26", time: "7:30pm", field: "F4" });
});

test("parsePdfGameSchedule reads visual game labels followed by schedule lines", () => {
  const text = `5 Team Little League Bracket
Game 1
Loser to B
6/27 12:00am F1
Game 2
Loser to A
6/27 2:30pm F1
Game 9
Champion`;
  const schedule = parsePdfGameSchedule(text);
  assert.deepEqual(schedule.get(1), { dateLabel: "6/27", time: "12:00am", field: "F1" });
  assert.deepEqual(schedule.get(2), { dateLabel: "6/27", time: "2:30pm", field: "F1" });
  assert.equal(schedule.has(9), false);
});

test("parsePdfGameSchedule reads compact OCR schedule lines", () => {
  assert.deepEqual(parseScheduleLine("6/274:00pmF2"), {
    dateLabel: "6/27",
    time: "4:00pm",
    field: "F2",
  });
  assert.deepEqual(parseScheduleLine("6/307:30pmF2（Ship)"), {
    dateLabel: "6/30",
    time: "7:30pm",
    field: "F2",
  });
});

test("extractVisualPdfTeams reads teams from 5-team LL visual layout", () => {
  const text = `Division: Little League Minor 9
5 Team Little League Bracket
Winners' Bracket
St. Charles
Game 2
Loser to A
6/27 2:30pm F1
Eastbank
Westbank
Game 1
Loser to B
6/27 12:00am F1
NORD
Game 3
Loser to C
6/28 10:00am F1
Ascension
Game 5
Loser to D
6/29 5:00pm F1`;
  const template = parsePdfBracketTemplate(text);
  assert.ok(template);
  assert.deepEqual(extractVisualPdfTeams(text, template), [
    "Westbank",
    "NORD",
    "St. Charles",
    "Eastbank",
    "Ascension",
  ]);
});

test("extractVisualPdfTeams reads teams from 6-team LL visual OCR order", () => {
  const text = `NOTICE!
Thisscheduleis subjectto
Division:LitleLeagueCoachPitch
Change!
TheNumberof teamsdetermine
Sit(s）:ButchGoreBallpark
thnfinal echedule
14550HarrySavoyRoadSt.Amant.LA70774
6Team Little LeagueBracket
Winners'Bracket
Update Phone:(225）223-9470Wayne Grenfell
APNavy
Toumament Director:WayneGrenfel/FrankRenaudir
Next Level:LouisianaLitle LeagueStateTourney
Loser to D
Westbank
701St.NazaireRd Broussard,LA70518
6/274:00pmF2
Game 1
Top2Teamsadvance/ModifiedBracket
Loser to A
Revisions Highlighted in Yellow
6/2711:30amF2
Game 7
APRed
Loser to E
6/285:00pmF2
Bogalusa
Game2
Loser to C
6/272:30pmF2
Game4
Loser to B
EastbankNavy
6/275:30pmF2
Game10
EastbankVegas
Loser to F (if 1st Loss)
6/307:30pmF2（Ship)
Losers'Bracket
Game 11
Champion`;
  const template = parsePdfBracketTemplate(
    "6 Team Little League Bracket\nWinners' Bracket\nLosers' Bracket",
  );
  assert.ok(template);
  assert.deepEqual(extractVisualPdfTeams(text, template), [
    "Westbank",
    "AP Red",
    "Bogalusa",
    "Eastbank Navy",
    "AP Navy",
    "Eastbank Vegas",
  ]);
});

test("5-team PDF ingest omits unscheduled if-necessary game", () => {
  const text = `Division: Little League Minor 9
5 Team Little League Bracket
Winners' Bracket
Game 1
Loser to B
6/27 12:00am F1
Game 2
Loser to A
6/27 2:30pm F1
Game 3
Loser to C
6/28 10:00am F1
Game 5
Loser to D
6/29 5:00pm F1
Losers' Bracket
Game 4
6/28 12:30pm F1
Game 6
6/29 7:30pm F1
Game 7
6/30 6:00pm F1
Game 8
Loser to E (if 1st Loss)
Game 9
Champion`;
  const template = parsePdfBracketTemplate(text);
  assert.ok(template);
  const result = buildRoundsFromPdfIngest(template, text);
  const matches = result.rounds.flatMap((round) => round.matches);
  assert.equal(result.championshipSeriesStyle, "winner_take_all");
  assert.equal(result.gamesBuilt, 8);
  assert.equal(result.scheduleLinesApplied, 7);
  assert.equal(matches.some((match) => match.championshipRole === "if_necessary"), false);
  assert.equal(matches.find((match) => match.officialGameNumber === "8")?.championshipRole, "grand_final");
});

test("5-team PDF ingest includes if-necessary game when G9 has schedule", () => {
  const text = `Division: Little League Minor 9
5 Team Little League Bracket
Winners' Bracket
Game 1
Loser to B
6/27 12:00am F1
Game 2
Loser to A
6/27 2:30pm F1
Losers' Bracket
Game 8
6/30 7:30pm F1
Game 9
7/1 6:00pm F1
Champion`;
  const template = parsePdfBracketTemplate(text);
  assert.ok(template);
  const result = buildRoundsFromPdfIngest(template, text);
  const matches = result.rounds.flatMap((round) => round.matches);
  assert.equal(result.championshipSeriesStyle, "always_scheduled_reset");
  assert.equal(matches.find((match) => match.officialGameNumber === "9")?.championshipRole, "if_necessary");
});

test("buildRoundsFromPdfIngest builds layout-ready rounds from District 2 PDF text", () => {
  const pdfPath = process.env.BRACKET_PDF_FIXTURE;
  if (!pdfPath) return;
  const buf = readFileSync(pdfPath);
  const text = extractPdfTextHeuristic(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const template = parsePdfBracketTemplate(text);
  assert.ok(template);
  const result = buildRoundsFromPdfIngest(template, text);
  assert.equal(result.gamesBuilt, 11);
  assert.equal(result.routingVerified, true);
  assert.equal(result.championshipSeriesStyle, "always_scheduled_reset");
  assert.ok(result.scheduleLinesApplied >= 4);
  const layout = buildBracketLayout(
    parseBracketSpec({
      bracketFormat: "double_elimination",
      championshipSeriesStyle: "always_scheduled_reset",
      teams: template.placeholderTeams,
      rounds: result.rounds,
    }),
  );
  assert.equal(layout.mode, "double_elimination");
  if (layout.mode !== "double_elimination") return;
  assert.equal(layout.diagramStyle, "classic_unified");
  assert.equal(layout.classicVariant, "six_team_modified_de");
  assert.equal(layout.classicChampionshipPodium?.showIfNecessaryDropLine, true);
  assert.equal(layout.classicChampionshipPodium?.ifNecessaryMatch?.officialGameNumber, "11");
});

test("6-team PDF rounds use classic unified diagram, not connected columns", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildLittleLeagueSixTeamModifiedDeRounds(teams);
  const layout = buildBracketLayout(
    parseBracketSpec({
      bracketFormat: "modified_double_elimination",
      teams,
      rounds,
    }),
  );
  assert.equal(layout.mode, "double_elimination");
  if (layout.mode !== "double_elimination") return;
  assert.equal(layout.diagramStyle, "classic_unified");
  assert.equal(layout.classicVariant, "six_team_modified_de");
  assert.equal(layout.championship?.matches[0]?.officialGameNumber, "10");
  assert.equal(layout.classicChampionshipPodium?.showIfNecessaryDropLine, false);
});
