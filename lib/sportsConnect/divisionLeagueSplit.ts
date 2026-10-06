/**
 * Spring registration split: one SportsConnect program, two leagues.
 *
 * A division name places a row in Gonzales DYB or Ascension LL.
 * `spring` is never an organization id. Fall programs cannot be split.
 * Unplaceable divisions stay unplaceable until an admin picks a league.
 */

export const SPRING_SPLIT_ORGS = ["gonzales", "ascension"] as const;
export type SpringSplitOrg = (typeof SPRING_SPLIT_ORGS)[number];

export type UnplaceableReason = "untagged" | "both_tags" | "conflict";

export type DivisionPlacement =
  | {
      status: "placed";
      organizationId: SpringSplitOrg;
      via: "tag" | "fixed" | "override";
    }
  | {
      status: "unplaceable";
      reason: UnplaceableReason;
    };

export function isSpringSplitOrg(value: string | null | undefined): value is SpringSplitOrg {
  return value === "gonzales" || value === "ascension";
}

export function isFallProgramName(programName: string): boolean {
  return programName.toLowerCase().includes("fall");
}

/** Spring programs only. A name that contains "fall" stays locked. */
export function isSpringProgramName(programName: string): boolean {
  if (isFallProgramName(programName)) return false;
  return /\bspring\b/i.test(programName);
}

export function canSplitSpringProgram(programName: string): boolean {
  return isSpringProgramName(programName);
}

export function splitImportDenial(
  isMaster: boolean,
  mapping: readonly { action?: string }[],
): string | null {
  const wantsSplit = mapping.some((entry) => entry?.action === "split");
  if (wantsSplit && !isMaster) {
    return "Only a master admin can split a Spring program by division.";
  }
  return null;
}

export function springLeagueLabel(org: SpringSplitOrg): string {
  return org === "gonzales" ? "Gonzales DYB" : "Ascension LL";
}

export function unplaceableReasonText(reason: UnplaceableReason): string {
  switch (reason) {
    case "both_tags":
      return "The name has both DYB and LLB.";
    case "conflict":
      return "The league tag disagrees with the age rule.";
    case "untagged":
      return "No league tag and no age rule.";
  }
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rem = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rem}`;
}

function tagPattern(): RegExp {
  return /(^|[^A-Za-z0-9])(DYB|LLB)(?![A-Za-z0-9])/gi;
}

/** Whole-token DYB / LLB matches. "12ULLB" and "softball" do not match. */
export function leagueTagsInName(divisionName: string): Array<"DYB" | "LLB"> {
  const tags: Array<"DYB" | "LLB"> = [];
  const pattern = tagPattern();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(divisionName)) !== null) {
    const tag = match[2]?.toUpperCase();
    if (tag !== "DYB" && tag !== "LLB") continue;
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function stripLeagueTags(divisionName: string): string {
  return divisionName.replace(tagPattern(), "$1 ");
}

/** Lowercase label with league tags removed and punctuation folded to spaces. */
export function normalizeDivisionLabel(divisionName: string): string {
  return stripLeagueTags(divisionName)
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTeeBallDivision(divisionName: string): boolean {
  const tokens = normalizeDivisionLabel(divisionName)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (tokens.includes("tball") || tokens.includes("teeball")) return true;
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const pair = `${tokens[index]} ${tokens[index + 1]}`;
    if (pair === "tee ball" || pair === "t ball") return true;
  }
  return false;
}

/**
 * Ages that belong to one league even when the division name has no tag.
 * Tee-ball is any tee-ball / t-ball name. The 7/8 and older labels are exact
 * after the league tag is removed, so "14U Majors" is not treated as "14U".
 */
export function fixedLeagueForDivision(divisionName: string): SpringSplitOrg | null {
  if (isTeeBallDivision(divisionName)) return "ascension";
  const label = normalizeDivisionLabel(divisionName);
  if (label === "7u minors" || label === "8u minors" || label === "7/8 majors") return "ascension";
  if (label === "14u" || label === "17u") return "gonzales";
  return null;
}

/**
 * Place one division. An override is used only when the name cannot be placed.
 * A confident tag or age rule is never replaced.
 */
export function placeDivision(
  divisionName: string,
  override?: string | null,
): DivisionPlacement {
  const appliedOverride = isSpringSplitOrg(override) ? override : null;
  const tags = leagueTagsInName(divisionName);
  if (tags.length > 1) {
    return appliedOverride
      ? { status: "placed", organizationId: appliedOverride, via: "override" }
      : { status: "unplaceable", reason: "both_tags" };
  }
  const tagged: SpringSplitOrg | null =
    tags[0] === "DYB" ? "gonzales" : tags[0] === "LLB" ? "ascension" : null;
  const fixed = fixedLeagueForDivision(divisionName);
  if (fixed && tagged && fixed !== tagged) {
    return appliedOverride
      ? { status: "placed", organizationId: appliedOverride, via: "override" }
      : { status: "unplaceable", reason: "conflict" };
  }
  if (tagged) return { status: "placed", organizationId: tagged, via: "tag" };
  if (fixed) return { status: "placed", organizationId: fixed, via: "fixed" };
  return appliedOverride
    ? { status: "placed", organizationId: appliedOverride, via: "override" }
    : { status: "unplaceable", reason: "untagged" };
}
