import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultBracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { includesIfNecessaryChampionshipGame } from "@/lib/tournament-brackets/bracketFormat";
import {
  buildRoundsFromOfficialTemplate,
  defaultOfficialTemplateForNewProject,
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
  assert.equal(byGame.get("4")?.home, "L1");
  assert.equal(byGame.get("4")?.away, "L2");
  assert.equal(byGame.get("5")?.home, "W3");
  assert.equal(byGame.get("5")?.away, "W2");
  assert.equal(byGame.get("6")?.home, "W4");
  assert.equal(byGame.get("6")?.away, "L3");
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
