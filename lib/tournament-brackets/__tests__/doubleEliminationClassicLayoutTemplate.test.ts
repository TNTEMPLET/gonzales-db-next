import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appliesDoubleElimClassicLayoutTemplate,
  classicDoubleElimLayoutLockPatch,
  classicFiveTeamParticipantSlots,
  DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE,
  hasClassicDoubleElimGameStructure,
  isClassicDoubleElimLayoutLocked,
  isClassicFiveTeamParticipantShell,
  resolveDoubleElimClassicLayoutGenerationOptions,
} from "@/lib/tournament-brackets/doubleEliminationClassicLayoutTemplate";
import {
  district6TenUParticipantSlots,
  generateDoubleEliminationRoundsForFormat,
} from "@/lib/tournament-brackets/generateDoubleElimFromTeams";
import { buildBracketLayout } from "@/lib/tournament-brackets/bracketLayout";
import { parseBracketSpec } from "@/lib/tournament-brackets/bracketSpec";

describe("doubleEliminationClassicLayoutTemplate", () => {
  it("defines standard double elimination with if-necessary championship", () => {
    assert.equal(DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE.bracketFormat, "double_elimination");
    assert.equal(
      DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE.championshipSeriesStyle,
      "always_scheduled_reset",
    );
  });

  it("maps five teams into the classic shell (G1/G2 openers + bye semi)", () => {
    const slots = classicFiveTeamParticipantSlots(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);
    assert.deepEqual(slots, [
      "Alpha",
      "BYE",
      "Epsilon",
      "Gamma",
      "Delta",
      "BYE",
      "BYE",
      "Beta",
    ]);
    assert.equal(isClassicFiveTeamParticipantShell(slots), true);
    assert.equal(isClassicFiveTeamParticipantShell(district6TenUParticipantSlots()), true);
  });

  it("applies generation options for five-team standard double elimination", () => {
    const teams = ["A", "B", "C", "D", "E"];
    assert.equal(appliesDoubleElimClassicLayoutTemplate(teams, "double_elimination"), true);
    assert.equal(appliesDoubleElimClassicLayoutTemplate(teams, "modified_double_elimination"), true);
    assert.equal(
      appliesDoubleElimClassicLayoutTemplate(["A", "B", "C", "D"], "double_elimination"),
      false,
    );

    const options = resolveDoubleElimClassicLayoutGenerationOptions(teams, "double_elimination");
    assert.ok(options?.participantSlots);
    const rounds = generateDoubleEliminationRoundsForFormat(teams, "double_elimination", options);
    const layout = buildBracketLayout(
      parseBracketSpec({
        bracketFormat: "double_elimination",
        teams,
        rounds,
        championshipSeriesStyle: "always_scheduled_reset",
      }),
    );
    assert.equal(layout.mode, "double_elimination");
    if (layout.mode !== "double_elimination") return;
    assert.equal(layout.diagramStyle, "classic_unified");
    assert.ok(layout.classicChampionshipPodium?.ifNecessaryMatch);
    assert.equal(layout.classicChampionshipPodium?.showIfNecessaryDropLine, true);
  });

  it("locks layout after classic template build", () => {
    const teams = ["A", "B", "C", "D", "E"];
    const options = resolveDoubleElimClassicLayoutGenerationOptions(teams, "double_elimination");
    const rounds = generateDoubleEliminationRoundsForFormat(teams, "double_elimination", options);
    const spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
      championshipSeriesStyle: "always_scheduled_reset",
      ...classicDoubleElimLayoutLockPatch(teams, "double_elimination"),
    });
    assert.equal(spec.classicDoubleElimLayoutLocked, true);
    assert.equal(hasClassicDoubleElimGameStructure(spec), true);
    assert.equal(isClassicDoubleElimLayoutLocked(spec), true);
  });

  it("detects locked classic layout without explicit flag when structure matches", () => {
    const teams = ["A", "B", "C", "D", "E"];
    const options = resolveDoubleElimClassicLayoutGenerationOptions(teams, "double_elimination");
    const rounds = generateDoubleEliminationRoundsForFormat(teams, "double_elimination", options);
    const spec = parseBracketSpec({
      bracketFormat: "double_elimination",
      teams,
      rounds,
      setupWizardCompleted: true,
    });
    assert.equal(spec.classicDoubleElimLayoutLocked, undefined);
    assert.equal(isClassicDoubleElimLayoutLocked(spec), true);
  });
});
