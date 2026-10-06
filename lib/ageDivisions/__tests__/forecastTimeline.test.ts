import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { effectiveCutoffDate, effectiveRange } from "../compute";
import { leagueDivisionDefaults } from "../defaults";
import {
  agesFromBirthdates,
  applyAgeSpan,
  applyCombinedCutoffPreset,
  applyCutoffPreset,
  combinedPresetApplied,
  birthdateInsideBand,
  birthdatesFromAges,
  buildTimelineModel,
  clampEdgeDate,
  dateAtRatio,
  daysBetween,
  detectCutoffPreset,
  divisionBirthdateSpans,
  dragBoundaryUpdate,
  edgePhrase,
  formatPlayerShift,
  formatTimelineDate,
  nudgeEdge,
  nudgeUnitForKey,
  playerShiftDeltas,
  shiftIsoDate,
  splitCursorDate,
  unionBirthdateAxis,
} from "../forecastTimeline";
import type { DivisionAgeConfig } from "../types";
import type { ProposedConfig } from "../forecastView";

const SEASON = 2027;

function gonzales(): ProposedConfig {
  const config = leagueDivisionDefaults("gonzales");
  return { cutoff: { ...config.rule }, divisions: config.divisions.map((division) => ({ ...division })) };
}

function byCode(divisions: readonly DivisionAgeConfig[]): Map<string, DivisionAgeConfig> {
  return new Map(divisions.map((division) => [division.code, division]));
}

describe("age and date derivation", () => {
  it("turns ages on an Aug 31 cutoff into birthdates and back", () => {
    const cutoff = "2027-08-31";
    const dates = birthdatesFromAges(7, 7, cutoff);
    assert.deepEqual(dates, { oldest: "2019-09-01", youngest: "2020-08-31" });
    assert.deepEqual(agesFromBirthdates(dates.oldest, dates.youngest, cutoff), { minAge: 7, maxAge: 7 });
    assert.equal(edgePhrase("oldestBirthdate", dates.oldest), "born on or after Sep 1, 2019");
    assert.equal(edgePhrase("youngestBirthdate", dates.youngest), "born on or before Aug 31, 2020");
    assert.equal(formatTimelineDate("2019-09-01"), "Sep 1, 2019");
  });

  it("derives a division window from ages without moving the neighbor", () => {
    const config = gonzales();
    const cutoff = effectiveCutoffDate(config.cutoff, SEASON);
    const index = config.divisions.findIndex((division) => division.code === "3-4U TB");
    const linked = applyAgeSpan(config.divisions, index, 3, 3, cutoff, true);
    const linkedByCode = byCode(linked);
    assert.equal(linkedByCode.get("3-4U TB")?.minAge, 3);
    assert.equal(linkedByCode.get("3-4U TB")?.maxAge, 3);
    assert.equal(linkedByCode.get("3-4U TB")?.oldestBirthdate, undefined);
    assert.deepEqual(effectiveRange(linkedByCode.get("3-4U TB")!, cutoff), {
      oldest: "2023-05-01",
      youngest: "2024-04-30",
      oldestOverridden: false,
      youngestOverridden: false,
    });
    assert.equal(linkedByCode.get("5U TB")?.youngestBirthdate, "2023-04-30");

    const alone = applyAgeSpan(config.divisions, index, 3, 3, cutoff, false);
    assert.equal(byCode(alone).get("5U TB")?.youngestBirthdate, undefined);
    assert.equal(effectiveRange(byCode(alone).get("3-4U TB")!, cutoff).oldest, "2023-05-01");
  });
});

describe("cutoff presets", () => {
  it("re-anchors every division onto Little League and keeps ages and year offset", () => {
    const config = gonzales();
    config.cutoff = { ...config.cutoff, yearOffset: 1 };
    const eight = config.divisions.findIndex((division) => division.code === "8U MINOR");
    config.divisions[eight] = { ...config.divisions[eight]!, oldestBirthdate: "2018-01-01" };
    const next = applyCutoffPreset(config, "little-league");
    assert.equal(detectCutoffPreset(next.cutoff), "little-league");
    assert.equal(detectCutoffPreset(config.cutoff), "dyb");
    assert.deepEqual(
      { month: next.cutoff.cutoffMonth, day: next.cutoff.cutoffDay, yearOffset: next.cutoff.yearOffset },
      { month: 8, day: 31, yearOffset: 1 },
    );
    assert.equal(next.divisions.length, config.divisions.length);
    for (const division of next.divisions) {
      const previous = byCode(config.divisions).get(division.code);
      assert.equal(division.minAge, previous?.minAge);
      assert.equal(division.maxAge, previous?.maxAge);
      assert.equal(division.oldestBirthdate, undefined);
      assert.equal(division.youngestBirthdate, undefined);
    }
    const cutoff = effectiveCutoffDate(next.cutoff, SEASON);
    assert.equal(cutoff, "2028-08-31");
    assert.deepEqual(effectiveRange(byCode(next.divisions).get("7U MINOR")!, cutoff), {
      oldest: "2020-09-01",
      youngest: "2021-08-31",
      oldestOverridden: false,
      youngestOverridden: false,
    });
    const dyb = applyCutoffPreset(next, "dyb");
    assert.equal(detectCutoffPreset(dyb.cutoff), "dyb");
    assert.equal(dyb.cutoff.cutoffMonth, 4);
    assert.equal(dyb.cutoff.cutoffDay, 30);
    assert.equal(detectCutoffPreset({ cutoffMonth: 8, cutoffDay: 15 }), "custom");
  });

  it("moves only that league's normal rows and keeps a joined custom line", () => {
    const season = 2027;
    const config: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        { code: "gonzales:8U MINOR", label: "8U DYB", minAge: 8, maxAge: 8, sortOrder: 1, oldestBirthdate: "2018-05-01", youngestBirthdate: "2019-04-30" },
        { code: "gonzales:7U MINOR", label: "7U DYB", minAge: 7, maxAge: 7, sortOrder: 2, oldestBirthdate: "2019-05-01", youngestBirthdate: "2020-04-30" },
        { code: "ascension:12U", label: "12U LLB", minAge: 12, maxAge: 12, sortOrder: 3, oldestBirthdate: "2014-05-01", youngestBirthdate: "2015-04-30" },
        { code: "ascension:11U", label: "11U LLB", minAge: 11, maxAge: 11, sortOrder: 4, oldestBirthdate: "2015-05-01", youngestBirthdate: "2016-04-30" },
        { code: "ascension:9U", label: "9U LLB", minAge: 9, maxAge: 9, sortOrder: 5, oldestBirthdate: "2017-05-01", youngestBirthdate: "2018-04-30" },
        { code: "ascension:8U MINOR", label: "8U Minors LLB", minAge: 8, maxAge: 8, sortOrder: 6, oldestBirthdate: "2018-05-01", youngestBirthdate: "2019-08-31" },
        { code: "ascension:7U MINOR", label: "7U Minors LLB", minAge: 7, maxAge: 7, sortOrder: 7, oldestBirthdate: "2019-09-01", youngestBirthdate: "2020-04-30" },
      ],
    };
    const ll = applyCombinedCutoffPreset(config, "little-league", season);
    assert.equal(ll.cutoff.cutoffMonth, 4);
    assert.equal(ll.cutoff.cutoffDay, 30);
    const llCodes = byCode(ll.divisions);
    assert.equal(llCodes.get("gonzales:8U MINOR")?.youngestBirthdate, "2019-04-30");
    assert.equal(llCodes.get("gonzales:7U MINOR")?.oldestBirthdate, "2019-05-01");
    assert.equal(effectiveRange(llCodes.get("ascension:12U")!, "2027-04-30").oldest, "2014-09-01");
    assert.equal(effectiveRange(llCodes.get("ascension:12U")!, "2027-04-30").youngest, "2015-08-31");
    assert.equal(effectiveRange(llCodes.get("ascension:11U")!, "2027-04-30").oldest, "2015-09-01");
    assert.equal(effectiveRange(llCodes.get("ascension:11U")!, "2027-04-30").youngest, "2016-08-31");
    assert.equal(llCodes.get("ascension:9U")?.youngestBirthdate, "2018-04-30");
    assert.equal(llCodes.get("ascension:8U MINOR")?.youngestBirthdate, "2019-08-31");
    assert.equal(llCodes.get("ascension:7U MINOR")?.oldestBirthdate, "2019-09-01");
    assert.equal(
      addOne(effectiveRange(llCodes.get("ascension:12U")!, "2027-04-30").youngest),
      effectiveRange(llCodes.get("ascension:11U")!, "2027-04-30").oldest,
    );
    assert.equal(
      addOne(effectiveRange(llCodes.get("ascension:8U MINOR")!, "2027-04-30").youngest),
      effectiveRange(llCodes.get("ascension:7U MINOR")!, "2027-04-30").oldest,
    );
    assert.equal(
      addOne(effectiveRange(llCodes.get("gonzales:8U MINOR")!, "2027-04-30").youngest),
      effectiveRange(llCodes.get("gonzales:7U MINOR")!, "2027-04-30").oldest,
    );

    const held: ProposedConfig = {
      cutoff: config.cutoff,
      divisions: [
        { code: "ascension:9U", label: "9U LLB", minAge: 9, maxAge: 9, sortOrder: 1, oldestBirthdate: "2017-05-01", youngestBirthdate: "2018-04-30" },
        { code: "ascension:8U MINOR", label: "8U Minors LLB", minAge: 8, maxAge: 8, sortOrder: 2, oldestBirthdate: "2018-05-01", youngestBirthdate: "2019-08-31" },
      ],
    };
    const kept = applyCombinedCutoffPreset(held, "little-league", season);
    assert.equal(byCode(kept.divisions).get("ascension:9U")?.youngestBirthdate, "2018-04-30");
    assert.equal(byCode(kept.divisions).get("ascension:8U MINOR")?.oldestBirthdate, "2018-05-01");

    const dyb = applyCombinedCutoffPreset(ll, "dyb", season);
    assert.equal(dyb.cutoff.cutoffDay, 30);
    assert.equal(effectiveRange(byCode(dyb.divisions).get("ascension:9U")!, "2027-04-30").oldest, "2017-05-01");
    assert.equal(effectiveRange(byCode(dyb.divisions).get("ascension:12U")!, "2027-04-30").oldest, "2014-09-01");
    assert.equal(effectiveRange(byCode(dyb.divisions).get("gonzales:7U MINOR")!, "2027-04-30").oldest, "2019-05-01");
    assert.equal(combinedPresetApplied(dyb, "dyb", season), true);
    assert.equal(combinedPresetApplied(dyb, "little-league", season), false);
  });

  it("does not clear baked overrides when a combined preset runs", () => {
    const season = 2027;
    const config: ProposedConfig = {
      cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
      divisions: [
        {
          code: "ascension:8U MINOR",
          label: "8U Minors LLB",
          minAge: 8,
          maxAge: 8,
          sortOrder: 1,
          oldestBirthdate: "2018-05-01",
          youngestBirthdate: "2019-08-31",
        },
        {
          code: "ascension:7U MINOR",
          label: "7U Minors LLB",
          minAge: 7,
          maxAge: 7,
          sortOrder: 2,
          oldestBirthdate: "2019-09-01",
          youngestBirthdate: "2020-04-30",
        },
        {
          code: "ascension:12U",
          label: "12U LLB",
          minAge: 12,
          maxAge: 12,
          sortOrder: 3,
          oldestBirthdate: "2014-09-01",
          youngestBirthdate: "2015-08-31",
        },
      ],
    };
    for (const preset of ["little-league", "dyb"] as const) {
      const next = applyCombinedCutoffPreset(config, preset, season);
      const codes = byCode(next.divisions);
      assert.equal(next.cutoff.cutoffMonth, 4);
      assert.equal(next.cutoff.cutoffDay, 30);
      assert.equal(codes.get("ascension:8U MINOR")?.youngestBirthdate, "2019-08-31");
      assert.equal(codes.get("ascension:7U MINOR")?.oldestBirthdate, "2019-09-01");
      assert.equal(codes.get("ascension:12U")?.oldestBirthdate, "2014-09-01");
      assert.equal(codes.get("ascension:12U")?.youngestBirthdate, "2015-08-31");
    }
  });
});

function addOne(iso: string): string {
  return shiftIsoDate(iso, 1, "day");
}

describe("nudge math", () => {
  it("shifts by a day, a week, and a month, clamping short months", () => {
    assert.equal(shiftIsoDate("2027-04-30", 1, "day"), "2027-05-01");
    assert.equal(shiftIsoDate("2027-04-30", -1, "day"), "2027-04-29");
    assert.equal(shiftIsoDate("2027-04-30", 1, "week"), "2027-05-07");
    assert.equal(shiftIsoDate("2027-04-30", -2, "week"), "2027-04-16");
    assert.equal(shiftIsoDate("2027-01-31", 1, "month"), "2027-02-28");
    assert.equal(shiftIsoDate("2024-01-31", 1, "month"), "2024-02-29");
    assert.equal(shiftIsoDate("2024-01-31", 2, "month"), "2024-03-31");
    assert.equal(shiftIsoDate("2027-03-31", -1, "month"), "2027-02-28");
    assert.equal(nudgeUnitForKey({ altKey: true, shiftKey: true }), "month");
    assert.equal(nudgeUnitForKey({ altKey: false, shiftKey: true }), "week");
    assert.equal(nudgeUnitForKey({ altKey: false, shiftKey: false }), "day");
  });

  it("moves a linked edge, including both sides of a shared 6U window", () => {
    const config = gonzales();
    const cutoff = effectiveCutoffDate(config.cutoff, SEASON);
    const minor = config.divisions.findIndex((division) => division.code === "6U MINOR");
    const nudged = nudgeEdge(config.divisions, minor, "youngestBirthdate", 1, "day", cutoff, true);
    const codes = byCode(nudged);
    assert.equal(codes.get("6U MINOR")?.youngestBirthdate, "2021-05-01");
    assert.equal(codes.get("6U MAJOR")?.youngestBirthdate, "2021-05-01");
    assert.equal(codes.get("5U TB")?.oldestBirthdate, "2021-05-02");
    assert.equal(codes.get("7U MINOR")?.youngestBirthdate, undefined);

    const week = nudgeEdge(config.divisions, minor, "youngestBirthdate", 1, "week", cutoff, true);
    assert.equal(byCode(week).get("6U MINOR")?.youngestBirthdate, "2021-05-07");
    assert.equal(byCode(week).get("5U TB")?.oldestBirthdate, "2021-05-08");

    const month = nudgeEdge(config.divisions, minor, "youngestBirthdate", -1, "month", cutoff, true);
    assert.equal(byCode(month).get("6U MAJOR")?.youngestBirthdate, "2021-03-30");
    assert.equal(byCode(month).get("5U TB")?.oldestBirthdate, "2021-03-31");
  });
});

describe("drag boundary updates", () => {
  it("moves a touching neighbor with the dragged edge", () => {
    const config = gonzales();
    const cutoff = effectiveCutoffDate(config.cutoff, SEASON);
    const eight = config.divisions.findIndex((division) => division.code === "8U MINOR");
    const linked = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2018-06-01", cutoff, true);
    assert.equal(byCode(linked).get("8U MINOR")?.oldestBirthdate, "2018-06-01");
    assert.equal(byCode(linked).get("9U KP")?.youngestBirthdate, "2018-05-31");

    const alone = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2018-06-01", cutoff, false);
    assert.equal(byCode(alone).get("8U MINOR")?.oldestBirthdate, "2018-06-01");
    assert.equal(byCode(alone).get("9U KP")?.youngestBirthdate, undefined);

    const opened = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2018-06-01", cutoff, true, {
      unlinkTouching: true,
    });
    assert.equal(byCode(opened).get("9U KP")?.youngestBirthdate, undefined);
  });

  it("keeps a division ordered and keeps the touching neighbor joined", () => {
    const config = gonzales();
    const cutoff = effectiveCutoffDate(config.cutoff, SEASON);
    const eight = config.divisions.findIndex((division) => division.code === "8U MINOR");
    const clamped = clampEdgeDate(config.divisions, eight, "oldestBirthdate", "2019-06-01", cutoff, true);
    assert.equal(clamped, "2019-04-30");
    const updated = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2019-06-01", cutoff, true);
    const range = effectiveRange(byCode(updated).get("8U MINOR")!, cutoff);
    assert.equal(range.oldest <= range.youngest, true);
    assert.equal(range.oldest, "2019-04-30");
    assert.equal(byCode(updated).get("9U KP")?.youngestBirthdate, "2019-04-29");

    const nineBefore = effectiveRange(byCode(config.divisions).get("9U KP")!, cutoff);
    const joined = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2017-01-01", cutoff, true);
    const eightRange = effectiveRange(byCode(joined).get("8U MINOR")!, cutoff);
    const nine = effectiveRange(byCode(joined).get("9U KP")!, cutoff);
    assert.equal(eightRange.oldest <= eightRange.youngest, true);
    assert.equal(eightRange.oldest, "2017-05-02");
    assert.equal(nine.oldest, nineBefore.oldest);
    assert.equal(nine.youngest, "2017-05-01");
    assert.equal(eightRange.oldest > nine.youngest, true);
  });

  it("maps a pointer ratio to a birthdate inside a band", () => {
    assert.equal(daysBetween("2020-01-01", "2020-01-11"), 10);
    assert.equal(dateAtRatio("2020-01-01", "2020-01-11", 0.5), "2020-01-06");
    assert.equal(dateAtRatio("2020-01-01", "2020-01-11", 2), "2020-01-11");
    assert.equal(birthdateInsideBand("2018-05-01", "2019-04-30", "2018-12-31"), "2018-12-31");
    assert.equal(birthdateInsideBand("2018-05-01", "2019-04-30", "2019-04-30"), null);
    assert.equal(birthdateInsideBand("2018-05-01", "2019-04-30", "2018-04-30"), null);
    const cursor = splitCursorDate("2018-05-01", "2019-04-30");
    assert.equal(cursor != null && cursor >= "2018-05-01" && cursor < "2019-04-30", true);
  });
});

describe("timeline model", () => {
  it("lays out every division, stacks shared windows, and marks gaps and overlaps", () => {
    const config = gonzales();
    const cutoff = effectiveCutoffDate(config.cutoff, SEASON);
    const axis = unionBirthdateAxis(divisionBirthdateSpans(config.divisions, cutoff), 0);
    assert.ok(axis);
    const model = buildTimelineModel(config.divisions, cutoff, axis);
    assert.ok(model);
    const codes = model.bands.flatMap((band) => band.members.map((member) => member.code));
    assert.deepEqual(codes.slice().sort(), config.divisions.map((division) => division.code).slice().sort());
    const six = model.bands.find((band) => band.members.some((member) => member.code === "6U MINOR"));
    assert.deepEqual(
      six?.members.map((member) => member.code).sort(),
      ["6U MAJOR", "6U MINOR"],
    );
    assert.equal(model.bands.length, config.divisions.length - 1);
    assert.equal(model.gaps.length, 0);
    assert.equal(model.overlaps.length, 0);
    const boundary = model.edges.find(
      (edge) => edge.kind === "between" && edge.olderCodes.includes("8U MINOR") && edge.youngerCodes.includes("7U MINOR"),
    );
    assert.ok(boundary);
    assert.equal(boundary.field, "oldestBirthdate");
    assert.equal(boundary.code, "7U MINOR");
    assert.equal(boundary.canCombine, true);
    assert.equal(
      model.edges.some((edge) => edge.code === "8U MINOR" && edge.field === "youngestBirthdate"),
      false,
    );

    const littleLeague = applyCutoffPreset(config, "little-league");
    const llCutoff = effectiveCutoffDate(littleLeague.cutoff, SEASON);
    const llAxis = unionBirthdateAxis(divisionBirthdateSpans(littleLeague.divisions, llCutoff), 0);
    const llModel = buildTimelineModel(littleLeague.divisions, llCutoff, llAxis);
    const seven = llModel?.edges.find((edge) => edge.code === "7U MINOR" && edge.field === "oldestBirthdate");
    assert.equal(seven?.hint, "born on or after Sep 1, 2019");

    const eight = config.divisions.findIndex((division) => division.code === "8U MINOR");
    const gapped = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2018-06-01", cutoff, false);
    const gapModel = buildTimelineModel(gapped, cutoff, axis);
    assert.equal(gapModel?.gaps.length, 1);
    assert.equal(gapModel?.gaps[0]?.from, "2018-05-01");
    assert.equal(gapModel?.gaps[0]?.to, "2018-05-31");

    const overlapped = dragBoundaryUpdate(config.divisions, eight, "oldestBirthdate", "2018-04-01", cutoff, false);
    const overlapModel = buildTimelineModel(overlapped, cutoff, axis);
    assert.equal(overlapModel?.overlaps.length, 1);
    assert.equal(overlapModel?.overlaps[0]?.from, "2018-04-01");
    assert.equal(overlapModel?.overlaps[0]?.to, "2018-04-30");
    assert.equal(overlapModel?.bands.some((band) => band.members.length === 2), true);
  });
});

describe("player shift readout", () => {
  it("describes players moving between divisions", () => {
    const deltas = playerShiftDeltas(
      [
        { code: "8U", label: "8U", pool: 20 },
        { code: "7U", label: "7U", pool: 30 },
      ],
      [
        { code: "8U", label: "8U", pool: 32 },
        { code: "7U", label: "7U", pool: 18 },
      ],
    );
    assert.equal(formatPlayerShift(deltas), "+12 players into 8U, −12 from 7U");
    assert.equal(formatPlayerShift([]), "No players change divisions.");
    assert.equal(
      formatPlayerShift([
        { label: "9U", delta: 4 },
        { label: "8U", delta: 12 },
        { label: "7U", delta: -16 },
      ]),
      "+12 players into 8U, +4 players into 9U, −16 from 7U",
    );
  });
});
