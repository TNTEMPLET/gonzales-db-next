/**
 * Division-age reads and writes against an injected database.
 * `store.ts` binds this to Prisma. Tests use a fake. No Prisma import here.
 */

import {
  buildCombinedSaveRecords,
  buildUndoRecords,
  splitCombinedTable,
  type SpringLeagueTable,
} from "@/lib/admin/springCombined/save";
import { SPRING_LEAGUE_ORGS, type SpringLeagueOrg } from "@/lib/admin/springCombined/view";
import type { ContentOrgId } from "@/lib/siteConfig";

import { shiftIsoDateByYears } from "./compute";
import { leagueDivisionDefaults } from "./defaults";
import {
  DEFAULT_FEEDER_SHARE_PERCENT,
  DEFAULT_RETURN_RATE_PERCENT,
  packLeagueDivisionsJson,
  unpackLeagueDivisionsJson,
  validateLeagueDefaults,
  validateSeasonRecord,
  withoutRedundantOverrides,
  type LeagueDefaultsInput,
  type LeagueDefaultsView,
  type SeasonDivisionAgesRecord,
  type SeasonDivisionAgesView,
} from "./schema";

export const DIVISION_AGES_STORAGE_NOTE =
  "Settings storage not ready. Showing built-in defaults until the division ages migration is applied.";

export const DIVISION_AGES_SAVE_NOT_READY =
  "Settings storage not ready. Apply the division ages migration, then save again.";

const UNREADABLE_SEASON_NOTE =
  "The saved division ages for this season could not be read. Showing the next available defaults.";

const UNREADABLE_LEAGUE_NOTE =
  "The saved league defaults could not be read. Showing built-in defaults.";

export function isDivisionAgeStorageMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = String((error as { code?: unknown }).code);
  return code === "P2021" || code === "P2022";
}

export type LeagueDefaultsRow = {
  organizationId: string;
  cutoffMonth: number;
  cutoffDay: number;
  yearOffset: number;
  divisionsJson: unknown;
  updatedAt: Date;
  updatedByAdminId: string | null;
};

export type DivisionAgeDb = {
  findLeagueDefaults(organizationId: string): Promise<LeagueDefaultsRow | null>;
  saveLeagueDefaults(input: {
    organizationId: string;
    cutoffMonth: number;
    cutoffDay: number;
    yearOffset: number;
    divisionsJson: unknown;
    updatedByAdminId: string;
  }): Promise<LeagueDefaultsRow>;
  findSeasonDivisionAges(organizationId: string, seasonYear: number): Promise<unknown | null>;
  saveSeasonDivisionAges(
    organizationId: string,
    seasonYear: number,
    divisionAgesJson: unknown | null,
  ): Promise<void>;
};

export type SaveFailure = { ok: false; error: string; issues?: string[]; status: number };
export type SaveSuccess<T> = { ok: true; value: T };

type ConfirmationMode = "preserve" | "set" | "clear";

function logSave(kind: string, organizationId: string, adminId: string, seasonYear?: number) {
  console.info(
    JSON.stringify({
      event: "division_ages.save",
      kind,
      organizationId,
      seasonYear: seasonYear ?? null,
      adminId,
      at: new Date().toISOString(),
    }),
  );
}

function builtinLeague(org: ContentOrgId): LeagueDefaultsInput {
  const config = leagueDivisionDefaults(org);
  return {
    cutoffMonth: config.rule.cutoffMonth,
    cutoffDay: config.rule.cutoffDay,
    yearOffset: config.rule.yearOffset,
    divisions: config.divisions.map((division) => ({ ...division })),
    returnRatePercent: DEFAULT_RETURN_RATE_PERCENT,
    feederSharePercent: DEFAULT_FEEDER_SHARE_PERCENT,
  };
}

function leagueViewFromInput(
  input: LeagueDefaultsInput,
  source: LeagueDefaultsView["source"],
  extra?: { updatedAt: string | null; updatedByAdminId: string | null; storageNote?: string | null; storageReady?: boolean },
): LeagueDefaultsView {
  return {
    source,
    storageReady: extra?.storageReady ?? true,
    storageNote: extra?.storageNote ?? null,
    cutoffMonth: input.cutoffMonth,
    cutoffDay: input.cutoffDay,
    yearOffset: input.yearOffset,
    divisions: input.divisions.map((division) => ({ ...division })),
    returnRatePercent: input.returnRatePercent,
    feederSharePercent: input.feederSharePercent,
    updatedAt: extra?.updatedAt ?? null,
    updatedByAdminId: extra?.updatedByAdminId ?? null,
  };
}

function seasonViewFromRecord(
  record: SeasonDivisionAgesRecord,
  source: SeasonDivisionAgesView["source"],
): SeasonDivisionAgesView {
  return {
    source,
    storageReady: true,
    storageNote: null,
    cutoff: { ...record.cutoff },
    divisions: record.divisions.map((division) => ({ ...division })),
    confirmedAt: record.confirmedAt ?? null,
    confirmedByAdminId: record.confirmedByAdminId ?? null,
    updatedAt: record.updatedAt ?? null,
    updatedByAdminId: record.updatedByAdminId ?? null,
    undoAvailable: record.previous != null,
  };
}

function builtinSeason(org: ContentOrgId, note: string | null, storageReady: boolean): SeasonDivisionAgesView {
  const defaults = builtinLeague(org);
  return {
    source: "builtin",
    storageReady,
    storageNote: note,
    cutoff: {
      cutoffMonth: defaults.cutoffMonth,
      cutoffDay: defaults.cutoffDay,
      yearOffset: defaults.yearOffset,
    },
    divisions: defaults.divisions,
    confirmedAt: null,
    confirmedByAdminId: null,
    updatedAt: null,
    updatedByAdminId: null,
  };
}

function leagueSeasonView(view: LeagueDefaultsView, note: string | null): SeasonDivisionAgesView {
  return {
    source: view.source === "league" ? "league" : "builtin",
    storageReady: view.storageReady,
    storageNote: note ?? view.storageNote,
    cutoff: {
      cutoffMonth: view.cutoffMonth,
      cutoffDay: view.cutoffDay,
      yearOffset: view.yearOffset,
    },
    divisions: view.divisions.map((division) => ({ ...division })),
    confirmedAt: null,
    confirmedByAdminId: null,
    updatedAt: null,
    updatedByAdminId: null,
  };
}

async function readLeague(
  db: DivisionAgeDb,
  org: ContentOrgId,
): Promise<{ view: LeagueDefaultsView; missing: boolean }> {
  let row: LeagueDefaultsRow | null;
  try {
    row = await db.findLeagueDefaults(org);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    console.warn(
      JSON.stringify({ event: "division_ages.storage_missing", organizationId: org, op: "read_league" }),
    );
    return {
      missing: true,
      view: leagueViewFromInput(builtinLeague(org), "builtin", {
        storageReady: false,
        storageNote: DIVISION_AGES_STORAGE_NOTE,
        updatedAt: null,
        updatedByAdminId: null,
      }),
    };
  }
  if (!row) {
    return { missing: false, view: leagueViewFromInput(builtinLeague(org), "builtin") };
  }
  const unpacked = unpackLeagueDivisionsJson(row.divisionsJson);
  const parsed = validateLeagueDefaults({
    cutoffMonth: row.cutoffMonth,
    cutoffDay: row.cutoffDay,
    yearOffset: row.yearOffset,
    divisions: unpacked.divisions,
    ...(unpacked.returnRatePercent != null ? { returnRatePercent: unpacked.returnRatePercent } : {}),
    ...(unpacked.feederSharePercent != null ? { feederSharePercent: unpacked.feederSharePercent } : {}),
  });
  if (!parsed.ok) {
    console.warn(
      JSON.stringify({
        event: "division_ages.unreadable_league_defaults",
        organizationId: org,
        error: parsed.error,
      }),
    );
    return {
      missing: false,
      view: leagueViewFromInput(builtinLeague(org), "builtin", {
        storageNote: UNREADABLE_LEAGUE_NOTE,
        updatedAt: null,
        updatedByAdminId: null,
      }),
    };
  }
  return {
    missing: false,
    view: leagueViewFromInput(parsed.data, "league", {
      updatedAt: row.updatedAt.toISOString(),
      updatedByAdminId: row.updatedByAdminId,
    }),
  };
}

export async function getLeagueDefaults(db: DivisionAgeDb, org: ContentOrgId): Promise<LeagueDefaultsView> {
  const read = await readLeague(db, org);
  return read.view;
}

export async function saveLeagueDefaults(
  db: DivisionAgeDb,
  org: ContentOrgId,
  input: unknown,
  adminId: string,
): Promise<SaveSuccess<LeagueDefaultsView> | SaveFailure> {
  const parsed = validateLeagueDefaults(input);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error, issues: parsed.issues };
  try {
    const row = await db.saveLeagueDefaults({
      organizationId: org,
      cutoffMonth: parsed.data.cutoffMonth,
      cutoffDay: parsed.data.cutoffDay,
      yearOffset: parsed.data.yearOffset,
      divisionsJson: packLeagueDivisionsJson(parsed.data),
      updatedByAdminId: adminId,
    });
    logSave("league_defaults", org, adminId);
    return {
      ok: true,
      value: leagueViewFromInput(parsed.data, "league", {
        updatedAt: row.updatedAt.toISOString(),
        updatedByAdminId: row.updatedByAdminId ?? adminId,
      }),
    };
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
  }
}

export async function getSeasonDivisionAges(
  db: DivisionAgeDb,
  org: ContentOrgId,
  seasonYear: number,
): Promise<SeasonDivisionAgesView> {
  let raw: unknown | null;
  try {
    raw = await db.findSeasonDivisionAges(org, seasonYear);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    console.warn(
      JSON.stringify({
        event: "division_ages.storage_missing",
        organizationId: org,
        seasonYear,
        op: "read_season",
      }),
    );
    return builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false);
  }

  if (raw != null) {
    const parsed = validateSeasonRecord(raw, seasonYear);
    if (parsed.ok) return seasonViewFromRecord(parsed.data, "season");
    console.warn(
      JSON.stringify({
        event: "division_ages.unreadable_season",
        organizationId: org,
        seasonYear,
        error: parsed.error,
      }),
    );
    const league = await readLeague(db, org);
    if (league.missing) return builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false);
    const note = league.view.storageNote ?? UNREADABLE_SEASON_NOTE;
    return leagueSeasonView(league.view, note);
  }

  const league = await readLeague(db, org);
  if (league.missing) return builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false);
  return leagueSeasonView(league.view, league.view.storageNote);
}

async function readSeasonRecord(
  db: DivisionAgeDb,
  org: ContentOrgId,
  seasonYear: number,
): Promise<SeasonDivisionAgesRecord | null> {
  const raw = await db.findSeasonDivisionAges(org, seasonYear);
  if (raw == null) return null;
  const parsed = validateSeasonRecord(raw, seasonYear);
  return parsed.ok ? parsed.data : null;
}

export async function saveSeasonDivisionAges(
  db: DivisionAgeDb,
  org: ContentOrgId,
  seasonYear: number,
  input: { cutoff: SeasonDivisionAgesRecord["cutoff"]; divisions: SeasonDivisionAgesRecord["divisions"]; confirm: boolean },
  adminId: string,
  options?: { confirmation?: ConfirmationMode; now?: Date },
): Promise<SaveSuccess<SeasonDivisionAgesView> | SaveFailure> {
  const now = options?.now ?? new Date();
  const confirmation = options?.confirmation ?? (input.confirm ? "set" : "preserve");
  const divisions = withoutRedundantOverrides(input.divisions, input.cutoff, seasonYear);
  const stored: SeasonDivisionAgesRecord = {
    cutoff: input.cutoff,
    divisions,
    updatedAt: now.toISOString(),
    updatedByAdminId: adminId,
  };
  if (confirmation === "set") {
    stored.confirmedAt = now.toISOString();
    stored.confirmedByAdminId = adminId;
  } else if (confirmation === "preserve") {
    try {
      const existing = await readSeasonRecord(db, org, seasonYear);
      if (existing?.confirmedAt) {
        stored.confirmedAt = existing.confirmedAt;
        if (existing.confirmedByAdminId) stored.confirmedByAdminId = existing.confirmedByAdminId;
      }
    } catch (error) {
      if (!isDivisionAgeStorageMissing(error)) throw error;
      return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
    }
  }
  const checked = validateSeasonRecord(stored, seasonYear);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error, issues: checked.issues };
  try {
    await db.saveSeasonDivisionAges(org, seasonYear, checked.data);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
  }
  logSave(confirmation === "set" ? "season_confirm" : "season", org, adminId, seasonYear);
  return { ok: true, value: seasonViewFromRecord(checked.data, "season") };
}

export async function clearSeasonDivisionAges(
  db: DivisionAgeDb,
  org: ContentOrgId,
  seasonYear: number,
  adminId: string,
): Promise<SaveSuccess<SeasonDivisionAgesView> | SaveFailure> {
  try {
    await db.saveSeasonDivisionAges(org, seasonYear, null);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
  }
  logSave("season_reset", org, adminId, seasonYear);
  const value = await getSeasonDivisionAges(db, org, seasonYear);
  return { ok: true, value };
}

export async function copyFromSeason(
  db: DivisionAgeDb,
  org: ContentOrgId,
  fromYear: number,
  toYear: number,
  adminId: string,
  now?: Date,
): Promise<SaveSuccess<SeasonDivisionAgesView> | SaveFailure> {
  if (!Number.isInteger(fromYear) || !Number.isInteger(toYear)) {
    return { ok: false, status: 400, error: "Season year must be a whole number." };
  }
  if (fromYear === toYear) {
    return { ok: false, status: 400, error: "Choose a different season to copy from." };
  }
  let raw: unknown | null;
  try {
    raw = await db.findSeasonDivisionAges(org, fromYear);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
  }
  if (raw == null) {
    return { ok: false, status: 404, error: `No saved division ages for ${fromYear}.` };
  }
  const parsed = validateSeasonRecord(raw, fromYear);
  if (!parsed.ok) {
    return { ok: false, status: 404, error: `No saved division ages for ${fromYear}.` };
  }
  const delta = toYear - fromYear;
  const divisions = parsed.data.divisions.map((division) => {
    const next = { ...division };
    if (division.oldestBirthdate) next.oldestBirthdate = shiftIsoDateByYears(division.oldestBirthdate, delta);
    if (division.youngestBirthdate) next.youngestBirthdate = shiftIsoDateByYears(division.youngestBirthdate, delta);
    return next;
  });
  return saveSeasonDivisionAges(
    db,
    org,
    toYear,
    { cutoff: parsed.data.cutoff, divisions, confirm: false },
    adminId,
    { confirmation: "clear", now },
  );
}

export class SpringSaveRejected extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SpringSaveRejected";
    this.status = status;
  }
}

export type SpringSeasonTx = {
  findSeasonDivisionAges(organizationId: string, seasonYear: number): Promise<unknown | null>;
  saveSeasonDivisionAges(
    organizationId: string,
    seasonYear: number,
    divisionAgesJson: unknown | null,
  ): Promise<void>;
};

/**
 * Either every save inside `run` is kept, or a throw restores the season rows
 * to the state at the start of `run`. The Prisma store uses `$transaction`.
 */
export type SpringCombinedDb = {
  transaction<T>(run: (tx: SpringSeasonTx) => Promise<T>): Promise<T>;
};

function leagueTitle(org: SpringLeagueOrg): string {
  return org === "gonzales" ? "Gonzales DYB" : "Ascension LL";
}

function logCombined(kind: "spring_combined" | "spring_combined_undo", seasonYear: number, adminId: string, at: Date) {
  console.info(
    JSON.stringify({
      event: "division_ages.save",
      kind,
      organizationIds: ["gonzales", "ascension"],
      seasonYear,
      adminId,
      at: at.toISOString(),
    }),
  );
}

function tablesForSave(
  leagues: readonly SpringLeagueTable[],
  stored: Record<SpringLeagueOrg, unknown | null>,
  seasonYear: number,
): SpringLeagueTable[] {
  return SPRING_LEAGUE_ORGS.map((org) => {
    const league = leagues.find((row) => row.organizationId === org);
    if (!league) throw new SpringSaveRejected("Both Spring leagues are required.");
    const raw = stored[org];
    if (raw == null) return { organizationId: org, cutoff: { ...league.cutoff }, divisions: league.divisions.map((division) => ({ ...division })) };
    const parsed = validateSeasonRecord(raw, seasonYear);
    if (!parsed.ok) {
      throw new SpringSaveRejected(`The saved table for ${leagueTitle(org)} could not be read. Nothing was written.`);
    }
    return {
      organizationId: org,
      cutoff: { ...parsed.data.cutoff },
      divisions: parsed.data.divisions.map((division) => ({ ...division })),
    };
  });
}

/**
 * Upsert Gonzales and Ascension season division ages in one transaction.
 * The write list is only those two orgs.
 */
export async function saveSpringCombinedSeasons(
  db: SpringCombinedDb,
  seasonYear: number,
  proposed: { cutoff: SpringLeagueTable["cutoff"]; divisions: SpringLeagueTable["divisions"] },
  leagues: readonly SpringLeagueTable[],
  adminId: string,
  now = new Date(),
): Promise<SaveSuccess<{ undoAvailable: true }> | SaveFailure> {
  try {
    await db.transaction(async (tx) => {
      const stored = {} as Record<SpringLeagueOrg, unknown | null>;
      for (const org of SPRING_LEAGUE_ORGS) {
        stored[org] = await tx.findSeasonDivisionAges(org, seasonYear);
      }
      const tables = tablesForSave(leagues, stored, seasonYear);
      const split = splitCombinedTable(
        { cutoff: proposed.cutoff, divisions: [...proposed.divisions] },
        tables,
        seasonYear,
      );
      if (!split.ok) throw new SpringSaveRejected(split.error);
      const built = buildCombinedSaveRecords(split.leagues, stored, seasonYear, adminId, now);
      if (!built.ok) throw new SpringSaveRejected(built.error);
      for (const org of SPRING_LEAGUE_ORGS) {
        await tx.saveSeasonDivisionAges(org, seasonYear, built.records[org]);
      }
    });
  } catch (error) {
    if (error instanceof SpringSaveRejected) return { ok: false, status: error.status, error: error.message };
    if (isDivisionAgeStorageMissing(error)) return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
    throw error;
  }
  logCombined("spring_combined", seasonYear, adminId, now);
  return { ok: true, value: { undoAvailable: true } };
}

/** Put both leagues back to the snapshot from the last combined save. */
export async function undoSpringCombinedSeasons(
  db: SpringCombinedDb,
  seasonYear: number,
  adminId: string,
  now = new Date(),
): Promise<SaveSuccess<{ undoAvailable: false }> | SaveFailure> {
  try {
    await db.transaction(async (tx) => {
      const stored = {} as Record<SpringLeagueOrg, unknown | null>;
      for (const org of SPRING_LEAGUE_ORGS) {
        stored[org] = await tx.findSeasonDivisionAges(org, seasonYear);
      }
      const built = buildUndoRecords(stored, seasonYear);
      if (!built.ok) throw new SpringSaveRejected(built.error, 409);
      for (const org of SPRING_LEAGUE_ORGS) {
        await tx.saveSeasonDivisionAges(org, seasonYear, built.records[org]);
      }
    });
  } catch (error) {
    if (error instanceof SpringSaveRejected) return { ok: false, status: error.status, error: error.message };
    if (isDivisionAgeStorageMissing(error)) return { ok: false, status: 503, error: DIVISION_AGES_SAVE_NOT_READY };
    throw error;
  }
  logCombined("spring_combined_undo", seasonYear, adminId, now);
  return { ok: true, value: { undoAvailable: false } };
}
