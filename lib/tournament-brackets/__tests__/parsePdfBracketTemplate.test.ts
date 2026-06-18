import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  extractPdfTextHeuristic,
} from "@/lib/tournament-brackets/ingestion/extractPdfText";
import {
  parsePdfBracketTemplate,
  placeholderTeamsForCount,
} from "@/lib/tournament-brackets/ingestion/parsePdfBracketTemplate";

const DISTRICT2_PDF_TEXT = `Division:
Site(s):
Update Phone:
Tournament Director:
Next Next Level:
E
A
B
F
C
D
Game 3
Loser to D
Game 1
Loser to A
Winners' Bracket
Game 4
Loser to B
Game 2
Losers' Bracket
Game 5
Game 7
Loser to E
Loser to C
Game 6
6 Team Little League Bracket
Game 9
Game 8
Game 10
Loser to F (if 1st Loss)
Champion
Game 11
Revisions Highlighted in Yellow`;

test("placeholderTeamsForCount uses A–F for six teams", () => {
  assert.deepEqual(placeholderTeamsForCount(6), ["A", "B", "C", "D", "E", "F"]);
});

test("parsePdfBracketTemplate detects 6-team Little League double elimination", () => {
  const match = parsePdfBracketTemplate(DISTRICT2_PDF_TEXT);
  assert.ok(match);
  assert.equal(match.templateId, "little_league_6_team_de");
  assert.equal(match.teamCount, 6);
  assert.equal(match.bracketFormat, "modified_double_elimination");
  assert.equal(match.championshipSeriesStyle, "winner_take_all");
  assert.deepEqual(match.placeholderTeams, ["A", "B", "C", "D", "E", "F"]);
});

test("parsePdfBracketTemplate detects DocHub 6-team PDF without title line", () => {
  const docHubText = `6T-G3-T2
Winner of Game #1
6T-G11-Champion
Champion
Top 2 Teams advance/Double Elimination Bracket
Loser From Game #10`;
  const match = parsePdfBracketTemplate(docHubText);
  assert.ok(match);
  assert.equal(match.templateId, "little_league_6_team_de");
  assert.equal(match.bracketFormat, "modified_double_elimination");
});

test("parsePdfBracketTemplate treats unscheduled 5-team reset marker as modified", () => {
  const minor9Text = `Division: Little League Minor 9
Site(s): Butch Gore Park
Top 2 teams advance to State. Modified Bracket
5 Team Little League Bracket
Winners' Bracket
Game 1
Loser to B
Game 2
Loser to A
Game 3
Loser to C
Game 5
Loser to D
Losers' Bracket
Game 4
Game 6
Game 7
Game 8
Loser to E (if 1st Loss)
Game 9
Champion`;
  const match = parsePdfBracketTemplate(minor9Text);
  assert.ok(match);
  assert.equal(match.templateId, "little_league_5_team_de");
  assert.equal(match.bracketFormat, "modified_double_elimination");
  assert.equal(match.championshipSeriesStyle, "winner_take_all");
  assert.deepEqual(match.placeholderTeams, ["A", "B", "C", "D", "E"]);
});

test("parsePdfBracketTemplate returns null for unrelated PDF text", () => {
  assert.equal(parsePdfBracketTemplate("Random tournament flyer"), null);
});

test("extractPdfTextHeuristic reads literal strings from a real bracket PDF when present", () => {
  const pdfPath = process.env.BRACKET_PDF_FIXTURE;
  if (!pdfPath) return;
  const buf = readFileSync(pdfPath);
  const text = extractPdfTextHeuristic(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.match(text, /6T-G\d+/i);
  assert.match(text, /double elimination bracket/i);
  const match = parsePdfBracketTemplate(text);
  assert.ok(match);
  assert.equal(match.templateId, "little_league_6_team_de");
  assert.equal(match.teamCount, 6);
});
