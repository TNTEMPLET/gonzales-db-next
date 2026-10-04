/**
 * Read-only forecast loader. Birth dates are read only to build in-memory
 * counts. The returned object is per-division aggregates: no names, player
 * birth dates, contact fields, or row ids. Coverage warnings and LL/DYB
 * eligibility include division window dates only.
 */

import "server-only";

import { z } from "zod";

import { normalizeLooseName, shouldSkipDivisionImport } from "@/lib/admin/teamsImportHelpers";
import type { EnsureAdminResult } from "@/lib/auth/ensureAdminModule";
import type { ContentOrgId } from "@/lib/siteConfig";

import { leagueDivisionDefaults } from "./defaults";
import {
  DEFAULT_FEEDER_SHARE,
  DEFAULT_RETURN_RATE,
  DEFAULT_ROSTER,
  carryoverRate,
  compareConfigs,
  eligibilityForConfigs,
  type BirthBucket,
  type EligibilityContrast,
  type ForecastConfig,
  type RosterSize,
} from "./forecast";
import { DIVISION_AGES_STORAGE_NOTE, isDivisionAgeStorageMissing } from "./persistence";
import {
  DEFAULT_FEEDER_SHARE_PERCENT,
  DEFAULT_RETURN_RATE_PERCENT,
  unpackLeagueDivisionsJson,
  validateSeasonWrite,
  type DivisionAgesSource,
  type SeasonDivisionAgesView,
} from "./schema";

const SOURCE_SEASON_DEFAULT = 2026;

const OWN_ENROLLMENT_MISSING =
  "Enrollment storage is not available, so this forecast used roster birth dates.";
const OWN_ENROLLMENT_EMPTY =
  "No enrollment rows for this season, so this forecast used roster birth dates.";
const OWN_ROSTER_MISSING = "Roster storage is not available, so player counts are empty.";
const FEEDER_ENROLLMENT_MISSING =
  "Feeder enrollment storage is not available, so feeder counts used roster birth dates.";
const FEEDER_ENROLLMENT_EMPTY =
  "The feeder league has no enrollment rows for this season, so feeder counts used roster birth dates.";
const FEEDER_ROSTER_MISSING = "Feeder roster storage is not available.";
const FALL_STORAGE_MISSING =
  "Fall Ball enrollment storage is not available, so no carryover rate was computed.";
const NO_SPRING_PLAYERS = "No spring players, so no carryover rate was computed.";
const CARRYOVER_REFERENCE =
  "Spring→Fall carryover is reference only and is not used in the forecast.";

export type PoolKind = "enrollment" | "roster" | "none";

export type PoolSource = {
  source: PoolKind;
  players: number;
  /** Distinct players with a usable birth date. The date itself is not returned. */
  datedPlayers: number;
  coveragePct: number | null;
};

export type ForecastCarryover = {
  springDistinct: number;
  carried: number;
  rate: number | null;
  note: string | null;
};

export type RetentionSource = "override" | "league" | "default";

export type LeagueForecastSettings = {
  roster: Map<string, RosterSize>;
  returnRate: number;
  feederShare: number;
  returnRateSource: "league" | "default";
  feederShareSource: "league" | "default";
};

export type ForecastPayload = {
  organizationId: ContentOrgId;
  seasonYear: number;
  targetSeasonYear: number;
  includeFeeder: boolean;
  /** Feeder share actually applied, fraction in 0–1. */
  feederShare: number;
  notes: string[];
  source: "enrollment" | "roster";
  coveragePct: number | null;
  sources: {
    own: PoolSource;
    feeder: PoolSource;
  };
  carryover: ForecastCarryover;
  retention: {
    applied: number;
    source: RetentionSource;
  };
  currentSource: DivisionAgesSource;
  proposedSource: "request" | "current";
  rows: ReturnType<typeof compareConfigs>["rows"];
  sharedPools: ReturnType<typeof compareConfigs>["sharedPools"];
  league: ReturnType<typeof compareConfigs>["league"];
  movers: number;
  flows: ReturnType<typeof compareConfigs>["flows"];
  currentWarnings: ReturnType<typeof compareConfigs>["currentWarnings"];
  proposedWarnings: ReturnType<typeof compareConfigs>["proposedWarnings"];
  eligibility: EligibilityContrast[];
  current: ReturnType<typeof compareConfigs>["current"];
  proposed: ReturnType<typeof compareConfigs>["proposed"];
};

export type ForecastFailure = {
  status: 400 | 500;
  body: { error: string; issues?: string[] };
};

export type ForecastSuccess = { status: 200; body: ForecastPayload };

export type ForecastResult = ForecastSuccess | ForecastFailure;

export type EnrollmentLine = {
  fullName: string;
  birthDate: Date | string | null;
  orderPaymentStatus: string | null;
  divisionName: string | null;
  ageGroup: string | null;
};

export type RosterLine = {
  fullName: string;
  birthDate: Date | string | null;
  ageGroup: string | null;
};

export type ForecastReader = {
  listEnrollment(org: ContentOrgId, seasonYear: number): Promise<EnrollmentLine[]>;
  listRoster(org: ContentOrgId, seasonYear: number): Promise<RosterLine[]>;
};

export type ForecastDeps = {
  reader: ForecastReader;
  loadSeasonConfig: (org: ContentOrgId, seasonYear: number) => Promise<SeasonDivisionAgesView>;
  loadRosterMap?: (org: ContentOrgId) => Promise<ReadonlyMap<string, RosterSize>>;
  loadForecastSettings?: (org: ContentOrgId) => Promise<LeagueForecastSettings>;
};

type CountedPlayer = {
  matchKey: string | null;
  birthDate: string | null;
};

type LoadedPool = {
  source: Exclude<PoolKind, "none">;
  players: CountedPlayer[];
  notes: string[];
};

const forecastBodySchema = z.object({
  seasonYear: z.number().int().min(1990).max(2200).optional(),
  targetSeasonYear: z.number().int().min(1990).max(2200).optional(),
  includeFeeder: z.boolean().optional(),
  retentionRate: z.number().min(0).max(1).optional(),
  feederShare: z.number().min(0).max(1).optional(),
  proposed: z.unknown().optional(),
});

function zodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

function birthIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return birthIso(`${year}-${month}-${day}`);
  }
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maxDay) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function matchKey(fullName: string, birthDate: string | null): string | null {
  const name = normalizeLooseName(fullName);
  if (!name || !birthDate) return null;
  return `${name}|${birthDate}`;
}

function collapseKey(fullName: string, birthDate: string | null): string {
  return matchKey(fullName, birthDate) ?? `incomplete:${normalizeLooseName(fullName)}|${birthDate ?? ""}`;
}

function isCompleted(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase() === "completed";
}

function isUmpireDivision(divisionName: string | null | undefined, ageGroup: string | null | undefined): boolean {
  return shouldSkipDivisionImport(divisionName ?? "") || shouldSkipDivisionImport(ageGroup ?? "");
}

function collapsePlayers(lines: Array<{ fullName: string; birthDate: Date | string | null }>): CountedPlayer[] {
  const seen = new Set<string>();
  const players: CountedPlayer[] = [];
  for (const line of lines) {
    const birthDate = birthIso(line.birthDate);
    const key = collapseKey(line.fullName ?? "", birthDate);
    if (seen.has(key)) continue;
    seen.add(key);
    players.push({ matchKey: matchKey(line.fullName ?? "", birthDate), birthDate });
  }
  return players;
}

function coverageOf(players: CountedPlayer[]): { datedPlayers: number; coveragePct: number | null } {
  if (players.length === 0) return { datedPlayers: 0, coveragePct: null };
  const datedPlayers = players.filter((player) => player.birthDate != null).length;
  return {
    datedPlayers,
    coveragePct: Math.round((datedPlayers / players.length) * 1000) / 10,
  };
}

function poolSource(pool: LoadedPool | { source: "none"; players: CountedPlayer[] }): PoolSource {
  const coverage = coverageOf(pool.players);
  return {
    source: pool.source,
    players: pool.players.length,
    datedPlayers: coverage.datedPlayers,
    coveragePct: coverage.coveragePct,
  };
}

function bucketsFor(players: CountedPlayer[], pool: BirthBucket["pool"]): BirthBucket[] {
  const counts = new Map<string, number>();
  for (const player of players) {
    if (!player.birthDate) continue;
    counts.set(player.birthDate, (counts.get(player.birthDate) ?? 0) + 1);
  }
  return [...counts.entries()].map(([birthDate, count]) => ({ birthDate, count, pool }));
}

function excludeOverlap(feeder: CountedPlayer[], own: CountedPlayer[]): CountedPlayer[] {
  const ownKeys = new Set(own.map((player) => player.matchKey).filter((key): key is string => key != null));
  return feeder.filter((player) => player.matchKey == null || !ownKeys.has(player.matchKey));
}

function defaultForecastSettings(roster: ReadonlyMap<string, RosterSize> = new Map()): LeagueForecastSettings {
  return {
    roster: new Map(roster),
    returnRate: DEFAULT_RETURN_RATE,
    feederShare: DEFAULT_FEEDER_SHARE,
    returnRateSource: "default",
    feederShareSource: "default",
  };
}

/** Roster bounds plus forecast percents stored inside `divisionsJson`. */
export function leagueForecastSettingsFromJson(raw: unknown): LeagueForecastSettings {
  const unpacked = unpackLeagueDivisionsJson(raw);
  const returnRatePercent = unpacked.returnRatePercent ?? DEFAULT_RETURN_RATE_PERCENT;
  const feederSharePercent = unpacked.feederSharePercent ?? DEFAULT_FEEDER_SHARE_PERCENT;
  return {
    roster: rosterMapFromLeagueDivisions(raw),
    returnRate: returnRatePercent / 100,
    feederShare: feederSharePercent / 100,
    returnRateSource: unpacked.returnRateSource,
    feederShareSource: unpacked.feederShareSource,
  };
}

/** Optional per-division roster bounds stored on league defaults by the settings cog. */
export function rosterMapFromLeagueDivisions(divisions: unknown): Map<string, RosterSize> {
  const map = new Map<string, RosterSize>();
  const list = unpackLeagueDivisionsJson(divisions).divisions;
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    const min = record.rosterMin;
    const max = record.rosterMax;
    if (!code || typeof min !== "number" || typeof max !== "number") continue;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || min > max || max > 30) continue;
    map.set(code, { min, max });
  }
  return map;
}

function builtinSeason(org: ContentOrgId): SeasonDivisionAgesView {
  const defaults = leagueDivisionDefaults(org);
  return {
    source: "builtin",
    storageReady: false,
    storageNote: DIVISION_AGES_STORAGE_NOTE,
    cutoff: { ...defaults.rule },
    divisions: defaults.divisions.map((division) => ({ ...division })),
    confirmedAt: null,
    confirmedByAdminId: null,
    updatedAt: null,
    updatedByAdminId: null,
  };
}

function toForecastConfig(view: Pick<SeasonDivisionAgesView, "cutoff" | "divisions">): ForecastConfig {
  return {
    cutoff: { ...view.cutoff },
    divisions: view.divisions.map((division) => ({ ...division })),
  };
}

type EnrollmentRow = {
  fullName: string;
  birthDate: Date | string | null;
  orderPaymentStatus: string | null;
  divisionNameRaw: string | null;
  ageGroup: string | null;
};

type RosterQueryRow = {
  fullName: string;
  birthDate: Date | string | null;
  team: { ageGroup: string } | null;
};

export type ForecastPrisma = {
  enrollment: {
    findMany: (args: Record<string, unknown>) => Promise<EnrollmentRow[]>;
  };
  teamPlayer: {
    findMany: (args: Record<string, unknown>) => Promise<RosterQueryRow[]>;
  };
  leagueAgeDivisionDefaults: {
    findUnique: (args: Record<string, unknown>) => Promise<{ divisionsJson: unknown } | null>;
  };
};

const ENROLLMENT_SELECT = {
  fullName: true,
  birthDate: true,
  orderPaymentStatus: true,
  divisionNameRaw: true,
  ageGroup: true,
} as const;

const ROSTER_SELECT = {
  fullName: true,
  birthDate: true,
  team: { select: { ageGroup: true } },
} as const;

export function createPrismaForecastReader(client: ForecastPrisma): ForecastReader {
  return {
    async listEnrollment(org, seasonYear) {
      if (typeof client.enrollment?.findMany !== "function") {
        throw missingStorage("Enrollment storage is not available");
      }
      const rows = await client.enrollment.findMany({
        where: { organizationId: org, seasonYear },
        select: ENROLLMENT_SELECT,
      });
      return rows.map((row) => ({
        fullName: row.fullName,
        birthDate: row.birthDate,
        orderPaymentStatus: row.orderPaymentStatus,
        divisionName: row.divisionNameRaw,
        ageGroup: row.ageGroup,
      }));
    },
    async listRoster(org, seasonYear) {
      if (typeof client.teamPlayer?.findMany !== "function") {
        throw missingStorage("Roster storage is not available");
      }
      const rows = await client.teamPlayer.findMany({
        where: { team: { organizationId: org, seasonYear } },
        select: ROSTER_SELECT,
      });
      return rows.map((row) => ({
        fullName: row.fullName,
        birthDate: row.birthDate,
        ageGroup: row.team?.ageGroup ?? "",
      }));
    },
  };
}

export async function readLeagueRosterMap(client: ForecastPrisma, org: ContentOrgId): Promise<Map<string, RosterSize>> {
  try {
    if (typeof client.leagueAgeDivisionDefaults?.findUnique !== "function") return new Map();
    const row = await client.leagueAgeDivisionDefaults.findUnique({
      where: { organizationId: org },
      select: { divisionsJson: true },
    });
    return rosterMapFromLeagueDivisions(row?.divisionsJson);
  } catch (error) {
    if (isDivisionAgeStorageMissing(error)) return new Map();
    throw error;
  }
}

export async function readLeagueForecastSettings(
  client: ForecastPrisma,
  org: ContentOrgId,
): Promise<LeagueForecastSettings> {
  try {
    if (typeof client.leagueAgeDivisionDefaults?.findUnique !== "function") return defaultForecastSettings();
    const row = await client.leagueAgeDivisionDefaults.findUnique({
      where: { organizationId: org },
      select: { divisionsJson: true },
    });
    if (!row) return defaultForecastSettings();
    return leagueForecastSettingsFromJson(row.divisionsJson);
  } catch (error) {
    if (isDivisionAgeStorageMissing(error)) return defaultForecastSettings();
    throw error;
  }
}

async function loadPool(
  org: ContentOrgId,
  seasonYear: number,
  reader: ForecastReader,
  kind: "own" | "feeder",
): Promise<LoadedPool> {
  const missingNote = kind === "own" ? OWN_ENROLLMENT_MISSING : FEEDER_ENROLLMENT_MISSING;
  const emptyNote = kind === "own" ? OWN_ENROLLMENT_EMPTY : FEEDER_ENROLLMENT_EMPTY;
  const rosterMissingNote = kind === "own" ? OWN_ROSTER_MISSING : FEEDER_ROSTER_MISSING;
  let enrollment: EnrollmentLine[];
  try {
    enrollment = await reader.listEnrollment(org, seasonYear);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return finishFromRoster(org, seasonYear, reader, [missingNote], rosterMissingNote);
  }
  if (enrollment.length === 0) {
    return finishFromRoster(org, seasonYear, reader, [emptyNote], rosterMissingNote);
  }
  const eligible = enrollment.filter(
    (row) => isCompleted(row.orderPaymentStatus) && !isUmpireDivision(row.divisionName, row.ageGroup),
  );
  return { source: "enrollment", players: collapsePlayers(eligible), notes: [] };
}

async function finishFromRoster(
  org: ContentOrgId,
  seasonYear: number,
  reader: ForecastReader,
  notes: string[],
  rosterMissingNote: string,
): Promise<LoadedPool> {
  try {
    const roster = await reader.listRoster(org, seasonYear);
    const eligible = roster.filter((row) => !isUmpireDivision(null, row.ageGroup));
    return { source: "roster", players: collapsePlayers(eligible), notes };
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { source: "roster", players: [], notes: [...notes, rosterMissingNote] };
  }
}

async function loadFallLines(
  reader: ForecastReader,
  seasonYear: number,
): Promise<{ lines: EnrollmentLine[]; note: string | null }> {
  try {
    const lines = await reader.listEnrollment("fallball", seasonYear);
    return { lines, note: null };
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return { lines: [], note: FALL_STORAGE_MISSING };
  }
}

function carryoverFor(
  spring: CountedPlayer[],
  fallLines: EnrollmentLine[],
  storageNote: string | null,
): ForecastCarryover {
  const springDistinct = spring.length;
  if (storageNote) {
    return { springDistinct, carried: 0, rate: null, note: storageNote };
  }
  if (springDistinct === 0) {
    return { springDistinct: 0, carried: 0, rate: null, note: NO_SPRING_PLAYERS };
  }
  const fallKeys = new Set<string>();
  for (const line of fallLines) {
    if (!isCompleted(line.orderPaymentStatus) || isUmpireDivision(line.divisionName, line.ageGroup)) continue;
    const key = matchKey(line.fullName ?? "", birthIso(line.birthDate));
    if (key) fallKeys.add(key);
  }
  let carried = 0;
  for (const player of spring) {
    if (player.matchKey && fallKeys.has(player.matchKey)) carried += 1;
  }
  if (carried === 0) {
    return { springDistinct, carried: 0, rate: null, note: null };
  }
  return { springDistinct, carried, rate: carryoverRate(springDistinct, carried), note: null };
}

function retentionFor(
  saved: { rate: number; source: "league" | "default" },
  override: number | undefined,
): { applied: number; source: RetentionSource } {
  if (override != null) return { applied: override, source: "override" };
  return { applied: saved.rate, source: saved.source };
}

function missingStorage(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: "P2021" });
}

function failure(status: 400 | 500, error: string, issues?: string[]): ForecastFailure {
  return issues ? { status, body: { error, issues } } : { status, body: { error } };
}

export function forecastAuthFailure(
  auth: EnsureAdminResult,
): { status: number; body: { error: string } } | null {
  if (auth.ok) return null;
  return { status: auth.status, body: { error: auth.message } };
}

export async function runDivisionForecast(
  input: { org: ContentOrgId; readJson: () => Promise<unknown> },
  deps: ForecastDeps,
): Promise<ForecastResult> {
  let raw: unknown;
  try {
    raw = await input.readJson();
  } catch {
    return failure(400, "Request body must be JSON.", ["(root): Request body must be JSON."]);
  }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return failure(400, "Request body must be a JSON object.", ["(root): Request body must be a JSON object."]);
  }
  const parsedBody = forecastBodySchema.safeParse(raw);
  if (!parsedBody.success) {
    const issues = zodIssues(parsedBody.error);
    return failure(400, issues[0] ?? "Invalid forecast request.", issues);
  }

  const seasonYear = parsedBody.data.seasonYear ?? SOURCE_SEASON_DEFAULT;
  const targetSeasonYear = parsedBody.data.targetSeasonYear ?? seasonYear + 1;
  const includeFeeder = input.org === "gonzales" ? parsedBody.data.includeFeeder !== false : false;

  let proposedConfig: ForecastConfig | null = null;
  if (parsedBody.data.proposed != null) {
    const proposed = validateSeasonWrite(parsedBody.data.proposed, targetSeasonYear);
    if (!proposed.ok) return failure(400, proposed.error, proposed.issues);
    if (proposed.data.reset) {
      return failure(400, "proposed: Send a cutoff and divisions.", [
        "proposed: Send a cutoff and divisions.",
      ]);
    }
    proposedConfig = { cutoff: proposed.data.cutoff, divisions: proposed.data.divisions };
  }

  try {
    const [own, feederLoaded, fall, currentView, settings] = await Promise.all([
      loadPool(input.org, seasonYear, deps.reader, "own"),
      includeFeeder
        ? loadPool("ascension", seasonYear, deps.reader, "feeder")
        : Promise.resolve(null),
      loadFallLines(deps.reader, seasonYear),
      loadCurrent(input.org, targetSeasonYear, deps),
      loadSettings(input.org, deps),
    ]);

    const feederPlayers = feederLoaded ? excludeOverlap(feederLoaded.players, own.players) : [];
    const carryover = carryoverFor(own.players, fall.lines, fall.note);
    const retention = retentionFor(
      { rate: settings.returnRate, source: settings.returnRateSource },
      parsedBody.data.retentionRate,
    );
    if (carryover.note == null && carryover.springDistinct > 0 && carryover.carried === 0) {
      carryover.note = CARRYOVER_REFERENCE;
    }
    const feederShare = parsedBody.data.feederShare ?? settings.feederShare;

    const current = toForecastConfig(currentView);
    const proposed = proposedConfig ?? current;
    const buckets = [...bucketsFor(own.players, "own"), ...bucketsFor(feederPlayers, "feeder")];
    const compared = compareConfigs(
      buckets,
      current,
      proposed,
      targetSeasonYear,
      {
        retentionRate: retention.applied,
        includeFeeder,
        feederShare,
        rosterFor: (code) => settings.roster.get(code) ?? DEFAULT_ROSTER,
      },
    );

    const notes = [...own.notes];
    if (feederLoaded) notes.push(...feederLoaded.notes);
    if (currentView.storageNote) notes.push(currentView.storageNote);
    if (carryover.note) notes.push(carryover.note);

    const ownSource = poolSource(own);
    const feederCoverage = coverageOf(feederPlayers);
    const feederSource: PoolSource = feederLoaded
      ? {
          source: feederLoaded.source,
          players: feederPlayers.length,
          datedPlayers: feederCoverage.datedPlayers,
          coveragePct: feederCoverage.coveragePct,
        }
      : { source: "none", players: 0, datedPlayers: 0, coveragePct: null };

    const body: ForecastPayload = {
      organizationId: input.org,
      seasonYear,
      targetSeasonYear,
      includeFeeder,
      feederShare,
      notes,
      source: own.source,
      coveragePct: ownSource.coveragePct,
      sources: { own: ownSource, feeder: feederSource },
      carryover: {
        springDistinct: carryover.springDistinct,
        carried: carryover.carried,
        rate: carryover.rate,
        note: carryover.note,
      },
      retention: { applied: retention.applied, source: retention.source },
      currentSource: currentView.source,
      proposedSource: proposedConfig ? "request" : "current",
      rows: compared.rows,
      sharedPools: compared.sharedPools,
      league: compared.league,
      movers: compared.movers,
      flows: compared.flows,
      currentWarnings: compared.currentWarnings,
      proposedWarnings: compared.proposedWarnings,
      eligibility: eligibilityForConfigs(buckets, current.divisions, proposed.divisions, targetSeasonYear),
      current: compared.current,
      proposed: compared.proposed,
    };
    return { status: 200, body };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : error instanceof Error
          ? error.name
          : "error";
    console.error("[division-ages] forecast failed", code);
    return failure(500, "Could not load the forecast.");
  }
}

async function loadSettings(org: ContentOrgId, deps: ForecastDeps): Promise<LeagueForecastSettings> {
  if (deps.loadForecastSettings) {
    try {
      return await deps.loadForecastSettings(org);
    } catch (error) {
      if (isDivisionAgeStorageMissing(error)) return defaultForecastSettings();
      throw error;
    }
  }
  const roster = await loadRosters(org, deps);
  return defaultForecastSettings(roster);
}

async function loadRosters(org: ContentOrgId, deps: ForecastDeps): Promise<ReadonlyMap<string, RosterSize>> {
  if (!deps.loadRosterMap) return new Map();
  try {
    return await deps.loadRosterMap(org);
  } catch (error) {
    if (isDivisionAgeStorageMissing(error)) return new Map();
    throw error;
  }
}

async function loadCurrent(
  org: ContentOrgId,
  seasonYear: number,
  deps: ForecastDeps,
): Promise<SeasonDivisionAgesView> {
  try {
    return await deps.loadSeasonConfig(org, seasonYear);
  } catch (error) {
    if (!isDivisionAgeStorageMissing(error)) throw error;
    return builtinSeason(org);
  }
}

export async function forecastReaders(): Promise<ForecastDeps> {
  const [{ default: prisma }, { getSeasonDivisionAges }] = await Promise.all([
    import("@/lib/prisma"),
    import("./store"),
  ]);
  const client = prisma as unknown as ForecastPrisma;
  return {
    reader: createPrismaForecastReader(client),
    loadSeasonConfig: (org, seasonYear) => getSeasonDivisionAges(org, seasonYear),
    loadRosterMap: (org) => readLeagueRosterMap(client, org),
    loadForecastSettings: (org) => readLeagueForecastSettings(client, org),
  };
}
