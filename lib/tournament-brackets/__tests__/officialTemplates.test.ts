import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { includesIfNecessaryChampionshipGame } from "@/lib/tournament-brackets/bracketFormat";
import {
  buildRoundsFromOfficialTemplate,
  defaultOfficialTemplateForNewProject,
  GOVERNING_BODY_STUBS,
  getOfficialTemplate,
  specDefaultsFromOfficialTemplate,
} from "@/lib/tournament-brackets/officialTemplates";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";

test("defaultBracketSpec uses official 6-team LL template", () => {
  const spec = defaultBracketSpec();
  assert.equal(spec.officialTemplateId, "little_league_6_team_de");
  assert.equal(spec.layoutPreference, "official");
  assert.equal(spec.governingBody, "little_league");
  assert.equal(spec.championshipSeriesStyle, "winner_take_all");
  assert.equal(spec.bracketFormat, "modified_double_elimination");
  assert.equal(spec.teams.length, 6);
});

test("3-team official LL builder follows Tee Ball PDF routing", () => {
  const teams = ["Eastbank", "Ascension LL", "GNO"];
  const standard = buildRoundsFromOfficialTemplate("little_league_3_team_de", teams, {
    championshipSeriesStyle: "always_scheduled_reset",
  });
  const byGame = new Map(
    standard.flatMap((round) => round.matches).map((match) => [match.officialGameNumber, match]),
  );

  assert.equal(byGame.get("1")?.home, "Ascension LL");
  assert.equal(byGame.get("1")?.away, "GNO");
  assert.equal(byGame.get("2")?.home, "Eastbank");
  assert.equal(byGame.get("2")?.away, "W1");
  assert.equal(byGame.get("3")?.home, "L1");
  assert.equal(byGame.get("3")?.away, "L2");
  assert.equal(byGame.get("4")?.home, "W2");
  assert.equal(byGame.get("4")?.away, "W3");
  assert.equal(byGame.get("4")?.championshipRole, "grand_final");
  assert.equal(byGame.get("5")?.home, "W4");
  assert.equal(byGame.get("5")?.away, "L4");
  assert.equal(byGame.get("5")?.championshipRole, "if_necessary");

  const modified = buildRoundsFromOfficialTemplate("little_league_3_team_de", teams, {
    championshipSeriesStyle: "winner_take_all",
  });
  assert.equal(
    modified.flatMap((round) => round.matches).some((match) => match.officialGameNumber === "5"),
    false,
  );
});

test("5-team modified DE omits if-necessary game", () => {
  const teams = ["A", "B", "C", "D", "E"];
  const rounds = buildRoundsFromOfficialTemplate("little_league_5_team_de", teams, {
    championshipSeriesStyle: "winner_take_all",
  });
  const byGame = new Map(
    rounds
      .flatMap((r) => r.matches)
      .filter((m) => m.officialGameNumber)
      .map((m) => [m.officialGameNumber!, m]),
  );
  const champ = rounds.flatMap((r) => r.matches).filter((m) => m.championshipRole);
  assert.equal(champ.some((m) => m.championshipRole === "if_necessary"), false);
  assert.equal(champ.some((m) => m.championshipRole === "grand_final"), true);
  assert.equal(byGame.get("4")?.home, "L2");
  assert.equal(byGame.get("4")?.away, "L1");
  assert.equal(byGame.get("5")?.home, "W2");
  assert.equal(byGame.get("5")?.away, "W3");
  assert.equal(byGame.get("6")?.home, "W4");
  assert.equal(byGame.get("6")?.away, "L3");
  assert.equal(byGame.get("7")?.home, "L5");
  assert.equal(byGame.get("7")?.away, "W6");
  assert.equal(byGame.get("8")?.home, "W5");
  assert.equal(byGame.get("8")?.away, "W7");
});

test("6-team standard builds classic unified diagram with if-necessary drop", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildRoundsFromOfficialTemplate("little_league_6_team_de", teams, {
    championshipSeriesStyle: "always_scheduled_reset",
  });
  const spec = {
    ...specDefaultsFromOfficialTemplate("little_league_6_team_de", "always_scheduled_reset"),
    teams,
    rounds,
    setupWizardCompleted: true,
  };
  const layout = buildBracketLayout(spec);
  assert.equal(layout.mode, "double_elimination");
  if (layout.mode !== "double_elimination") return;
  assert.equal(layout.diagramStyle, "classic_unified");
  assert.equal(layout.classicVariant, "six_team_modified_de");
  assert.equal(includesIfNecessaryChampionshipGame(spec), true);
  assert.equal(layout.classicChampionshipPodium?.showIfNecessaryDropLine, true);
});

test("6-team modified builds classic unified diagram without if-necessary", () => {
  const teams = ["A", "B", "C", "D", "E", "F"];
  const rounds = buildRoundsFromOfficialTemplate("little_league_6_team_de", teams, {
    championshipSeriesStyle: "winner_take_all",
  });
  const spec = {
    ...specDefaultsFromOfficialTemplate("little_league_6_team_de", "winner_take_all"),
    teams,
    rounds,
    setupWizardCompleted: true,
  };
  const layout = buildBracketLayout(spec);
  assert.equal(layout.mode, "double_elimination");
  if (layout.mode !== "double_elimination") return;
  assert.equal(layout.diagramStyle, "classic_unified");
  assert.equal(layout.classicVariant, "six_team_modified_de");
  assert.equal(includesIfNecessaryChampionshipGame(spec), false);
});

test("championshipSeriesStyle overrides format for if-necessary", () => {
  assert.equal(
    includesIfNecessaryChampionshipGame({
      bracketFormat: "modified_double_elimination",
      championshipSeriesStyle: "always_scheduled_reset",
    }),
    true,
  );
});

test("defaultOfficialTemplateForNewProject is 6-team", () => {
  assert.equal(defaultOfficialTemplateForNewProject().id, "little_league_6_team_de");
  assert.equal(getOfficialTemplate("little_league_6_team_de")?.teamCount, 6);
});

test("registry exposes future governing-body stubs", () => {
  assert.equal(GOVERNING_BODY_STUBS.some((body) => body.id === "babe_ruth" && !body.implemented), true);
  assert.equal(GOVERNING_BODY_STUBS.some((body) => body.id === "cal_ripken" && !body.implemented), true);
});

test("7-team official LL builder uses fixed game numbers and style-specific reset", () => {
  const teams = ["A", "B", "C", "D", "E", "F", "G"];
  const standard = buildRoundsFromOfficialTemplate("little_league_7_team_de", teams, {
    championshipSeriesStyle: "always_scheduled_reset",
  });
  const modified = buildRoundsFromOfficialTemplate("little_league_7_team_de", teams, {
    championshipSeriesStyle: "winner_take_all",
  });
  const standardGames = new Map(
    standard.flatMap((round) => round.matches).map((match) => [match.officialGameNumber, match]),
  );
  assert.equal(standardGames.get("4")?.home, "W1");
  assert.equal(standardGames.get("4")?.away, "G");
  assert.equal(standardGames.get("12")?.championshipRole, "grand_final");
  assert.equal(standardGames.get("13")?.championshipRole, "if_necessary");
  assert.equal(
    modified.flatMap((round) => round.matches).some((match) => match.championshipRole === "if_necessary"),
    false,
  );
});

test("layoutPreference connected_columns opts out of classic unified layout", () => {
  const teams = ["A", "B", "C", "D", "E"];
  const rounds = buildRoundsFromOfficialTemplate("little_league_5_team_de", teams, {
    championshipSeriesStyle: "always_scheduled_reset",
  });
  const layout = buildBracketLayout({
    ...specDefaultsFromOfficialTemplate("little_league_5_team_de", "always_scheduled_reset"),
    layoutPreference: "connected_columns",
    teams,
    rounds,
  });
  assert.equal(layout.mode, "double_elimination");
  if (layout.mode !== "double_elimination") return;
  assert.equal(layout.diagramStyle, "connected_columns");
});
