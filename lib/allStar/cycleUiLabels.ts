import { formatOrganizationLabel } from "@/lib/allStar/cycleSetupHelpers";
import { getCycleStatusChipLabel, isRunoffCycleTitle } from "@/lib/allStar/cycleType";

export type AllStarCycleListLabelInput = {
  organizationId: "gonzales" | "ascension";
  seasonYear: number;
  ageGroup: string;
  title: string | null;
  allStarAgeGroupLabel?: string | null;
  status: "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";
  publishedAt?: string | null;
  closedAt?: string | null;
};

export function getDisplayedCycleAgeGroup(cycle: {
  organizationId: "gonzales" | "ascension";
  ageGroup: string;
  title: string | null;
}) {
  const normalizedTitle = (cycle.title || "").trim().toUpperCase();
  if (
    cycle.organizationId === "gonzales" &&
    cycle.ageGroup.trim().toUpperCase().startsWith("12U") &&
    normalizedTitle === "11U DYB"
  ) {
    return "11U DYB";
  }
  return cycle.ageGroup;
}

/**
 * All-Star list display: replace the season band prefix (e.g. 10U) with the selected All-Star age (e.g. 11U)
 * while keeping the league suffix (e.g. " LLB"). Avoids bracketed forms like `10U LLB [11U]`.
 */
export function getDisplayedCycleAgeGroupWithAllStarAge(cycle: {
  organizationId: "gonzales" | "ascension";
  ageGroup: string;
  title: string | null;
  allStarAgeGroupLabel?: string | null;
}) {
  const base = getDisplayedCycleAgeGroup(cycle);
  const allStar = cycle.allStarAgeGroupLabel?.trim();
  if (!allStar) return base;
  const m = base.trim().match(/^(\d{1,2}U)(.*)$/i);
  if (!m) return base;
  const primaryU = m[1];
  const suffix = m[2] ?? "";
  if (primaryU.toUpperCase() === allStar.toUpperCase()) return base;
  return `${allStar}${suffix}`.trim();
}

export function getCycleTierLabel(title: string | null) {
  return (title || "").toLowerCase().includes("second team")
    ? "SECOND_TEAM"
    : "FIRST_TEAM";
}

export function getCycleTierDisplayLabel(
  organizationId: "gonzales" | "ascension",
  title: string | null,
) {
  const normalizedTitle = (title || "").trim().toUpperCase();
  if (organizationId === "gonzales" && normalizedTitle === "11U DYB") {
    return "GOLD";
  }
  const tier = getCycleTierLabel(title);
  if (organizationId === "ascension") {
    return tier === "SECOND_TEAM" ? "RED" : "NAVY";
  }
  return tier === "SECOND_TEAM" ? "GOLD" : "PURPLE";
}

/** Title-case team color word for cycle list lines (e.g. Navy, Red). */
export function formatTeamColorSentenceCase(upperLabel: string) {
  const t = upperLabel.trim();
  if (!t) return "";
  if (t === "NAVY") return "Navy";
  if (t === "RED") return "Red";
  if (t === "GOLD") return "Gold";
  if (t === "PURPLE") return "Purple";
  return t.charAt(0) + t.slice(1).toLowerCase();
}

/**
 * Canonical list line: League | Year | All-Star age group | Status | Team color [| Runoff].
 * Use `omitStatus` when a status chip is shown beside this string (e.g. snapshot cards).
 */
export function formatAllStarCyclePipeListLabel(
  cycle: AllStarCycleListLabelInput,
  options?: { omitStatus?: boolean; teamColorWord?: string },
) {
  const league = formatOrganizationLabel(cycle.organizationId);
  const age = getDisplayedCycleAgeGroupWithAllStarAge(cycle);
  const status = getCycleStatusChipLabel(cycle);
  const tierUpper = getCycleTierDisplayLabel(cycle.organizationId, cycle.title);
  const colorWord = options?.teamColorWord?.trim() || formatTeamColorSentenceCase(tierUpper);
  const parts: string[] = [league, String(cycle.seasonYear), age];
  if (!options?.omitStatus) {
    parts.push(status);
  }
  parts.push(colorWord);
  if (isRunoffCycleTitle(cycle.title)) {
    parts.push("Runoff");
  }
  return parts.join(" | ");
}

/** All-caps headings for runoff vote panel / CSV tiers (NAVY / RED, etc.). */
export function getRunoffVotePanelPrimaryTeamHeading(
  organizationId: "gonzales" | "ascension",
  title: string | null,
) {
  return getCycleTierDisplayLabel(organizationId, title);
}

export function getRunoffVotePanelSecondaryTeamHeading(organizationId: "gonzales" | "ascension") {
  return organizationId === "ascension" ? "RED" : "GOLD";
}

function pluralizePlayer(count: number | null | undefined) {
  return count === 1 ? "player" : "players";
}

export function getRunoffVotePanelSplitLabels(cycle: {
  organizationId: "gonzales" | "ascension";
  title: string | null;
  runoffIsFinalVote?: boolean | null;
  runoffTeamTarget?: "FIRST_TEAM" | "SECOND_TEAM" | null;
  runoffPlayersNeeded?: number | null;
}) {
  if (cycle.runoffIsFinalVote) {
    const targetHeading =
      cycle.runoffTeamTarget === "SECOND_TEAM"
        ? getRunoffVotePanelSecondaryTeamHeading(cycle.organizationId)
        : getRunoffVotePanelPrimaryTeamHeading(cycle.organizationId, cycle.title);
    const neededText =
      typeof cycle.runoffPlayersNeeded === "number" && cycle.runoffPlayersNeeded > 0
        ? ` (${cycle.runoffPlayersNeeded} ${pluralizePlayer(cycle.runoffPlayersNeeded)} needed)`
        : "";
    return {
      primaryHeading: `${targetHeading} selections${neededText}`,
      secondaryHeading: "Remaining candidates",
      descriptor:
        typeof cycle.runoffPlayersNeeded === "number" && cycle.runoffPlayersNeeded > 0
          ? `Final vote: top ${cycle.runoffPlayersNeeded} fill ${targetHeading}.`
          : `Final vote: top ranked candidates fill ${targetHeading}.`,
    };
  }
  return {
    primaryHeading: getRunoffVotePanelPrimaryTeamHeading(cycle.organizationId, cycle.title),
    secondaryHeading: getRunoffVotePanelSecondaryTeamHeading(cycle.organizationId),
    descriptor: "",
  };
}

/** Pipe list label from vote-summary / export cycle meta (organizationId from DB). */
export function getRunoffExportTeamColorWord(
  organizationId: "gonzales" | "ascension",
  team: "primary" | "secondary",
  title: string | null,
) {
  const upper =
    team === "primary"
      ? getRunoffVotePanelPrimaryTeamHeading(organizationId, title)
      : getRunoffVotePanelSecondaryTeamHeading(organizationId);
  return formatTeamColorSentenceCase(upper);
}

export function formatAllStarCyclePipeListLabelFromOrgMeta(
  cycle: {
    organizationId: string;
    seasonYear: number;
    ageGroup: string;
    title: string | null;
    allStarAgeGroupLabel?: string | null;
    status: AllStarCycleListLabelInput["status"];
    publishedAt?: string | null;
    closedAt?: string | null;
  },
  options?: { omitStatus?: boolean; teamColorWord?: string },
) {
  const orgId = cycle.organizationId === "ascension" ? "ascension" : "gonzales";
  return formatAllStarCyclePipeListLabel(
    {
      organizationId: orgId,
      seasonYear: cycle.seasonYear,
      ageGroup: cycle.ageGroup,
      title: cycle.title,
      allStarAgeGroupLabel: cycle.allStarAgeGroupLabel,
      status: cycle.status,
      publishedAt: cycle.publishedAt,
      closedAt: cycle.closedAt,
    },
    options,
  );
}
