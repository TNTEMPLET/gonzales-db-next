/**
 * Editor helpers. Pure data, safe for the client bundle.
 */

import type { ContentOrgId } from "@/lib/siteConfig";

import { calculatedRange, effectiveCutoffDate } from "./compute";
import { leagueDivisionDefaults } from "./defaults";
import type { DivisionAgesSource, SeasonDivisionAgesView } from "./schema";
import type { DivisionAgeConfig } from "./types";

export function divisionAgesSourceLabel(source: DivisionAgesSource, seasonYear: number): string {
  if (source === "season") return `Saved for ${seasonYear}`;
  if (source === "league") return "League defaults";
  return "Built-in defaults";
}

export function builtinSeasonView(org: ContentOrgId): SeasonDivisionAgesView {
  const config = leagueDivisionDefaults(org);
  return {
    source: "builtin",
    storageReady: true,
    storageNote: null,
    cutoff: { ...config.rule },
    divisions: config.divisions.map((division) => ({ ...division })),
    confirmedAt: null,
    confirmedByAdminId: null,
    updatedAt: null,
    updatedByAdminId: null,
  };
}

export function setDivisionBirthdate(
  division: DivisionAgeConfig,
  field: "oldestBirthdate" | "youngestBirthdate",
  value: string,
  cutoffIso: string,
): DivisionAgeConfig {
  const calculated = calculatedRange(division, cutoffIso);
  const calculatedValue = field === "oldestBirthdate" ? calculated.oldest : calculated.youngest;
  const next: DivisionAgeConfig = { ...division };
  if (!value || value === calculatedValue) delete next[field];
  else next[field] = value;
  return next;
}

export function clearDivisionBirthdates(division: DivisionAgeConfig): DivisionAgeConfig {
  const next: DivisionAgeConfig = { ...division };
  delete next.oldestBirthdate;
  delete next.youngestBirthdate;
  return next;
}

export function stripBirthdatesMatchingCutoff(
  division: DivisionAgeConfig,
  cutoffIso: string,
): DivisionAgeConfig {
  const calculated = calculatedRange(division, cutoffIso);
  const next: DivisionAgeConfig = { ...division };
  if (next.oldestBirthdate === calculated.oldest) delete next.oldestBirthdate;
  if (next.youngestBirthdate === calculated.youngest) delete next.youngestBirthdate;
  return next;
}

export function moveDivision(divisions: DivisionAgeConfig[], index: number, direction: -1 | 1): DivisionAgeConfig[] {
  const target = index + direction;
  if (target < 0 || target >= divisions.length) return divisions;
  const next = divisions.map((division) => ({ ...division }));
  const [item] = next.splice(index, 1);
  if (!item) return divisions;
  next.splice(target, 0, item);
  return next.map((division, order) => ({ ...division, sortOrder: order + 1 }));
}

/** Empty text clears the bound. Anything else must be a 1–2 digit integer. */
export function parseRosterBound(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (!/^\d{1,2}$/.test(trimmed)) return Number.NaN;
  return Number(trimmed);
}

export function setDivisionRoster(
  division: DivisionAgeConfig,
  field: "rosterMin" | "rosterMax",
  raw: string,
): DivisionAgeConfig {
  const next: DivisionAgeConfig = { ...division };
  const value = parseRosterBound(raw);
  if (value == null) {
    delete next[field];
    return next;
  }
  next[field] = value;
  return next;
}

export function setAllDivisionRosters(
  divisions: DivisionAgeConfig[],
  minRaw: string,
  maxRaw: string,
): DivisionAgeConfig[] {
  return divisions.map((division) =>
    setDivisionRoster(setDivisionRoster(division, "rosterMin", minRaw), "rosterMax", maxRaw),
  );
}

export function blankDivision(sortOrder: number): DivisionAgeConfig {
  return {
    code: `NEW ${sortOrder}`,
    label: "New division",
    minAge: 8,
    maxAge: 8,
    sortOrder,
  };
}

export function seasonCutoffIso(
  cutoff: { cutoffMonth: number; cutoffDay: number; yearOffset: number },
  seasonYear: number,
): string {
  return effectiveCutoffDate(cutoff, seasonYear);
}
