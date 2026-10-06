/**
 * Adapt a Division Builder table to the combined Spring save.
 *
 * The save itself is unchanged: codes still identify a division, each league
 * keeps its own cutoff, and dropped codes are removals. This file only decides
 * which existing code a builder row continues, and copies that row's birthdays
 * onto the payload so the stored window matches the builder.
 *
 * Little League and Tee-ball rows are Ascension. Diamond / Dixie rows are
 * Gonzales. A Both-leagues row is written once to each. Other is refused.
 * Fall Ball is never a target.
 */

import { builderRowViews, type BuilderCharter, type BuilderTable } from "@/lib/ageDivisions/divisionBuilder";
import { effectiveCutoffDate, effectiveRange } from "@/lib/ageDivisions/compute";
import type { DivisionAgeConfig, LeagueAgeRule } from "@/lib/ageDivisions/types";

import type { SpringLeagueTable } from "./save";
import { springLeagueSuffix, type SpringLeagueOrg } from "./view";

const SHELL_CUTOFF: LeagueAgeRule = { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 };

export type BuilderSaveProposed = {
  cutoff: LeagueAgeRule;
  divisions: DivisionAgeConfig[];
};

export function proposedFromBuilder(
  table: BuilderTable,
  leagues: readonly SpringLeagueTable[],
): { ok: true; proposed: BuilderSaveProposed } | { ok: false; error: string } {
  const byOrg = new Map(leagues.map((league) => [league.organizationId, league]));
  if (!byOrg.has("gonzales") || !byOrg.has("ascension")) {
    return { ok: false, error: "Both Spring leagues are required." };
  }

  const others = table.rows.filter((row) => row.charter === "other");
  if (others.length > 0) {
    const names = others.map((row) => row.name.trim() || "A division");
    const listed = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const verb = names.length === 1 ? "is" : "are";
    return {
      ok: false,
      error: `${listed} ${verb} marked Other. Move ${names.length === 1 ? "it" : "them"} to Little League or Diamond / Dixie before saving.`,
    };
  }

  const used: Record<SpringLeagueOrg, Set<string>> = { gonzales: new Set(), ascension: new Set() };
  const divisions: DivisionAgeConfig[] = [];
  for (const view of builderRowViews(table)) {
    if (!view.window.usable) {
      return { ok: false, error: `${view.title} needs a real birthdate range before it can be saved.` };
    }
    for (const org of orgsForCharter(view.row.charter)) {
      const league = byOrg.get(org)!;
      const cutoffIso = effectiveCutoffDate(league.cutoff, table.seasonYear);
      const window = { oldest: view.window.oldest, youngest: view.window.youngest };
      const existingCode = pickExistingCode(view.row.name, view.row, window, league.divisions, cutoffIso, used[org]);
      const code = existingCode ?? freshCode(bareLabel(view.row.name, org), used[org]);
      used[org].add(code);
      divisions.push({
        code: `${org}:${code}`,
        label: view.row.name.trim() || view.title,
        minAge: view.row.minAge,
        maxAge: view.row.maxAge,
        sortOrder: divisions.length + 1,
        oldestBirthdate: window.oldest,
        youngestBirthdate: window.youngest,
      });
    }
  }

  if (divisions.length === 0) return { ok: false, error: "Add a division before saving." };
  return { ok: true, proposed: { cutoff: SHELL_CUTOFF, divisions } };
}

function orgsForCharter(charter: BuilderCharter): SpringLeagueOrg[] {
  if (charter === "dyb") return ["gonzales"];
  if (charter === "ll" || charter === "teeball") return ["ascension"];
  if (charter === "both") return ["gonzales", "ascension"];
  return [];
}

function tierToken(name: string): "minor" | "major" | null {
  const minor = /\bminors?\b/i.test(name);
  const major = /\bmajors?\b/i.test(name);
  if (minor === major) return null;
  return minor ? "minor" : "major";
}

/**
 * Keep a saved code when one unused division has these birthdays, or these
 * ages and the same Minors/Majors tier. Two candidates is not a match.
 */
function pickExistingCode(
  name: string,
  ages: { minAge: number; maxAge: number },
  window: { oldest: string; youngest: string },
  existing: readonly DivisionAgeConfig[],
  cutoffIso: string,
  used: Set<string>,
): string | null {
  const open = existing.filter((division) => !used.has(division.code));
  const sameWindow = open.filter((division) => {
    const range = effectiveRange(division, cutoffIso);
    return range.oldest === window.oldest && range.youngest === window.youngest;
  });
  const token = tierToken(name);
  const tierAndWindow = sameWindow.filter((division) => tierToken(division.label) === token);
  if (tierAndWindow.length === 1) return tierAndWindow[0]!.code;
  if (sameWindow.length === 1) return sameWindow[0]!.code;
  const sameShape = open.filter(
    (division) =>
      division.minAge === ages.minAge && division.maxAge === ages.maxAge && tierToken(division.label) === token,
  );
  if (sameShape.length === 1) return sameShape[0]!.code;
  return null;
}

function bareLabel(name: string, org: SpringLeagueOrg): string {
  const suffix = springLeagueSuffix(org);
  const trimmed = name.trim().replace(/\s+/g, " ");
  const stripped = trimmed.replace(new RegExp(`\\s+${suffix}$`, "i"), "").trim();
  return (stripped || trimmed || "Division").slice(0, 40);
}

function freshCode(label: string, used: Set<string>): string {
  const base = label.slice(0, 40) || "Division";
  let code = base;
  let n = 2;
  while (used.has(code)) {
    const suffix = ` ${n}`;
    code = `${base.slice(0, Math.max(1, 40 - suffix.length)).trimEnd()}${suffix}`;
    n += 1;
    if (n > 50) break;
  }
  return code;
}
