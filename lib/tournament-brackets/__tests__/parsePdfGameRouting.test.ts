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
  pdfFeedersMatchLittleLeagueSixTeamDe,
  inferSixTeamChampionshipSeriesStyleFromFeeders,
} from "@/lib/tournament-brackets/ingestion/parsePdfGameRouting";
import { parsePdfBracketTemplate } from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";

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
