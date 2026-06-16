import type { BracketSpec } from "@/lib/tournament-brackets/bracketSpec";
import { isDoubleEliminationFormat } from "@/lib/tournament-brackets/bracketFormat";
import { getOfficialTemplate } from "@/lib/tournament-brackets/officialTemplates";
import { BYE_SLOT_LABEL } from "@/lib/tournament-brackets/generateSingleElimFromTeams";

/**
 * LOCKED — Classic unified double-elimination diagram (approved 2026-06).
 *
 * Frozen surface: grid geometry, G8/G9/champion column placement, connector paths,
 * game numbering shell (G1–G9), and badge labels. Do not change diagram components
 * without a visual bracket review.
 *
 * Allowed live updates: match scores, feeder slot resolution, champion name, team
 * name labels (via team mapping), and schedule lines on game cards.
 */
export const DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE = {
  id: "classic_unified_double_elimination",
  label: "Classic double elimination",
  description:
    "Unified winners/losers diagram with G8 championship, G9 (if necessary), and champion column.",
  /** Standard DE with always-scheduled if-necessary game. */
  bracketFormat: "double_elimination" as const,
  championshipSeriesStyle: "always_scheduled_reset" as const,
  /** Team counts that render on the classic unified diagram (5-team uses fixed shell). */
  classicUnifiedTeamCounts: [5, 6, 7] as const,
} as const;

export const CLASSIC_DOUBLE_ELIM_LAYOUT_LOCKED_ADMIN_MESSAGE =
  "Classic double-elimination layout is locked. Update scores in the preview, rename teams in Team name mapping, or edit schedule lines on game cards. Do not rebuild rounds or change bracket format.";

/** Five-team shell: two openers (G1/G2), one bye into semi (G3), hidden bye pair. */
export function classicFiveTeamParticipantSlots(teams: string[]): string[] {
  const t = teams.map((s) => s.trim()).filter(Boolean);
  if (t.length !== 5) {
    throw new Error(
      `Classic 5-team double elimination layout requires exactly 5 teams (got ${t.length}).`,
    );
  }
  return [
    t[0]!,
    BYE_SLOT_LABEL,
    t[4]!,
    t[2]!,
    t[3]!,
    BYE_SLOT_LABEL,
    BYE_SLOT_LABEL,
    t[1]!,
  ];
}

/** True when slots match the classic 5-team shell (including District 6 10U). */
export function isClassicFiveTeamParticipantShell(slots: string[]): boolean {
  if (slots.length !== 8) return false;
  return (
    slots[1] === BYE_SLOT_LABEL &&
    slots[5] === BYE_SLOT_LABEL &&
    slots[6] === BYE_SLOT_LABEL &&
    slots[0] !== BYE_SLOT_LABEL &&
    slots[2] !== BYE_SLOT_LABEL &&
    slots[3] !== BYE_SLOT_LABEL &&
    slots[4] !== BYE_SLOT_LABEL &&
    slots[7] !== BYE_SLOT_LABEL
  );
}

export function appliesDoubleElimClassicLayoutTemplate(
  teams: string[],
  bracketFormat: BracketSpec["bracketFormat"],
): boolean {
  const count = teams.map((s) => s.trim()).filter(Boolean).length;
  if (count === 5 && isDoubleEliminationFormat(bracketFormat)) return true;
  if (count === 6 && isDoubleEliminationFormat(bracketFormat)) return true;
  return false;
}

/** True when the spec has a complete classic game tree (5-team G1–G8 or 6-team G1–G10). */
export function hasClassicDoubleElimGameStructure(spec: BracketSpec): boolean {
  if (!isDoubleEliminationFormat(spec.bracketFormat)) return false;
  const gameNumbers = new Set<string>();
  for (const round of spec.rounds) {
    for (const match of round.matches) {
      const key = match.officialGameNumber?.trim();
      if (key) gameNumbers.add(key);
    }
  }
  const fiveTeam = ["1", "2", "3", "4", "5", "6", "7", "8"].every((g) => gameNumbers.has(g));
  const sixTeam = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].every((g) => gameNumbers.has(g));
  return fiveTeam || sixTeam;
}

/** Layout is frozen — only scores and labels should change the live bracket. */
export function isClassicDoubleElimLayoutLocked(spec: BracketSpec): boolean {
  if (spec.classicDoubleElimLayoutLocked === true) return true;
  if (!spec.setupWizardCompleted) return false;
  if (!appliesDoubleElimClassicLayoutTemplate(spec.teams, spec.bracketFormat)) return false;
  return hasClassicDoubleElimGameStructure(spec);
}

/** Patch fields applied when building a new classic template bracket. */
export function classicDoubleElimLayoutLockPatch(
  teams: string[],
  bracketFormat: BracketSpec["bracketFormat"],
): Pick<BracketSpec, "classicDoubleElimLayoutLocked"> | Record<string, never> {
  if (!appliesDoubleElimClassicLayoutTemplate(teams, bracketFormat)) return {};
  return { classicDoubleElimLayoutLocked: true };
}

/** Generation options for the classic unified 5-team layout; undefined when not applicable. */
export function resolveDoubleElimClassicLayoutGenerationOptions(
  teams: string[],
  bracketFormat: BracketSpec["bracketFormat"],
): { participantSlots: string[] } | undefined {
  if (!appliesDoubleElimClassicLayoutTemplate(teams, bracketFormat)) return undefined;
  return { participantSlots: classicFiveTeamParticipantSlots(teams) };
}

export function doubleEliminationClassicLayoutSpecDefaults(): Pick<
  BracketSpec,
  "bracketFormat" | "championshipSeriesStyle"
> {
  return {
    bracketFormat: DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE.bracketFormat,
    championshipSeriesStyle: DOUBLE_ELIMINATION_CLASSIC_LAYOUT_TEMPLATE.championshipSeriesStyle,
  };
}


/** Lock layout when an official template with lockLayout is built. */
export function officialTemplateLayoutLockPatch(
  officialTemplateId: string | undefined,
): Pick<BracketSpec, "classicDoubleElimLayoutLocked"> | Record<string, never> {
  if (!officialTemplateId) return {};
  const template = getOfficialTemplate(officialTemplateId);
  if (!template?.lockLayout) return {};
  return { classicDoubleElimLayoutLocked: true };
}
