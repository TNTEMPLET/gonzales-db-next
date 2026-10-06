import { newBuilderRow, type BuilderRow, type BuilderTable } from "../divisionBuilder";

export const TRENT_SEASON = 2027;

function row(id: string, patch: Partial<Omit<BuilderRow, "id">>): BuilderRow {
  return newBuilderRow(id, patch);
}

/** Spring 2027 combined table from the stuck review screen. */
export function trentBuilderTable(): BuilderTable {
  return {
    version: 1,
    organizationId: "spring",
    seasonYear: TRENT_SEASON,
    rows: [
      row("tee", { name: "3-4 Tee Ball", minAge: 3, maxAge: 4, charter: "ll", cutoff: "dyb" }),
      row("five", { name: "5U Mod CP LLB", minAge: 5, maxAge: 5, charter: "ll", cutoff: "dyb" }),
      row("six-min", { name: "6U Minors CP DYB", minAge: 6, maxAge: 6, charter: "dyb", cutoff: "dyb" }),
      row("six-maj", { name: "6U Majors CP DYB", minAge: 6, maxAge: 6, charter: "dyb", cutoff: "dyb" }),
      row("eight-min", {
        name: "8U Minors LLB",
        minAge: 7,
        maxAge: 8,
        charter: "ll",
        cutoff: "custom",
        oldestOverride: "2018-09-01",
        youngestOverride: "2020-04-30",
      }),
      row("eight-maj", {
        name: "8U Majors LLB",
        minAge: 7,
        maxAge: 8,
        charter: "ll",
        cutoff: "little-league",
        oldestOverride: "2018-09-01",
        youngestOverride: "2020-04-30",
      }),
      row("ten-ll", { name: "10U LLB", minAge: 9, maxAge: 10, charter: "ll", cutoff: "little-league" }),
      row("ten-dyb", { name: "10U DYB", minAge: 9, maxAge: 10, charter: "dyb", cutoff: "dyb" }),
      row("twelve-ll", { name: "12U LLB", minAge: 11, maxAge: 12, charter: "ll", cutoff: "little-league" }),
      row("twelve-dyb", { name: "12U DYB", minAge: 11, maxAge: 12, charter: "dyb", cutoff: "dyb" }),
      row("1314", { name: "13/14U DYB", minAge: 13, maxAge: 14, charter: "dyb", cutoff: "dyb" }),
      row("1517", { name: "15-17U DYB", minAge: 15, maxAge: 17, charter: "dyb", cutoff: "dyb" }),
    ],
  };
}
