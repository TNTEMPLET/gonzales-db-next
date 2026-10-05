/**
 * Division-age reads and writes against an injected database.
 * `store.ts` binds this to Prisma. Tests use a fake. No Prisma import here.
 */

import { createHash } from "node:crypto";

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

export const STALE_SAVE_ERROR = "Someone else saved changes. Reload this page to see them.";

/** Stable signed 64-bit key so combined and single-league writes of one season share a lock. */
export function springDivisionAgesLockKey(seasonYear: number): bigint {
  const digest = createHash("sha256").update(`spring-division-ages:${Math.trunc(seasonYear)}`).digest();
  return BigInt.asIntN(64, digest.readBigUInt64BE(0));
}

export function divisionAgesBaselineToken(raw: unknown | null): string {
  if (raw == null) return "absent";
  return createHash("sha256").update(canonicalJson(raw)).digest("hex");
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
}

function withBaseline(view: SeasonDivisionAgesView, raw: unknown | null): SeasonDivisionAgesView {
  return { ...view, baselineToken: divisionAgesBaselineToken(raw) };
}

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
    return withBaseline(builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false), null);
  }

  if (raw != null) {
    const parsed = validateSeasonRecord(raw, seasonYear);
    if (parsed.ok) return withBaseline(seasonViewFromRecord(parsed.data, "season"), raw);
    console.warn(
      JSON.stringify({
        event: "division_ages.unreadable_season",
        organizationId: org,
        seasonYear,
        error: parsed.error,
      }),
    );
    const league = await readLeague(db, org);
    if (league.missing) return withBaseline(builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false), raw);
    const note = league.view.storageNote ?? UNREADABLE_SEASON_NOTE;
    return withBaseline(leagueSeasonView(league.view, note), raw);
  }

  const league = await readLeague(db, org);
  if (league.missing) return withBaseline(builtinSeason(org, DIVISION_AGES_STORAGE_NOTE, false), null);
  return withBaseline(leagueSeasonView(league.view, league.view.storageNote), null);
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
  return { ok: true, value: withBaseline(seasonViewFromRecord(checked.data, "season"), checked.data) };
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
  /** Transaction-scoped lock. Must run before either league row is read. Covers absent rows. */
  lockSpringDivisionAges(seasonYear: number): Promise<void>;
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

export type SpringCombinedWriteOptions = {
  baselines?: Partial<Record<SpringLeagueOrg, string>>;
  removedCodes?: Partial<Record<SpringLeagueOrg, readonly string[]>>;
  now?: Date;
};

function assertFreshBaselines(
  stored: Record<SpringLeagueOrg, unknown | null>,
  baselines: Partial<Record<SpringLeagueOrg, string>> | undefined,
) {
  for (const org of SPRING_LEAGUE_ORGS) {
    const sent = baselines?.[org];
    if (!sent || sent !== divisionAgesBaselineToken(stored[org])) {
      throw new SpringSaveRejected(STALE_SAVE_ERROR, 409);
    }
  }
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
  options?: SpringCombinedWriteOptions,
): Promise<SaveSuccess<{ undoAvailable: true }> | SaveFailure> {
  const now = options?.now ?? new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.lockSpringDivisionAges(seasonYear);
      const stored = {} as Record<SpringLeagueOrg, unknown | null>;
      for (const org of SPRING_LEAGUE_ORGS) {
        stored[org] = await tx.findSeasonDivisionAges(org, seasonYear);
      }
      assertFreshBaselines(stored, options?.baselines);
      const tables = tablesForSave(leagues, stored, seasonYear);
      const split = splitCombinedTable(
        { cutoff: proposed.cutoff, divisions: [...proposed.divisions] },
        tables,
        seasonYear,
        options?.removedCodes,
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
  options?: SpringCombinedWriteOptions,
): Promise<SaveSuccess<{ undoAvailable: false }> | SaveFailure> {
  const now = options?.now ?? new Date();
  try {
    await db.transaction(async (tx) => {
      await tx.lockSpringDivisionAges(seasonYear);
      const stored = {} as Record<SpringLeagueOrg, unknown | null>;
      for (const org of SPRING_LEAGUE_ORGS) {
        stored[org] = await tx.findSeasonDivisionAges(org, seasonYear);
      }
      assertFreshBaselines(stored, options?.baselines);
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
