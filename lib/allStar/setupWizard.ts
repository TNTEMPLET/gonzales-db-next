import {
  DEFAULT_REQUIRED_RATINGS_PER_COACH,
  parseRequiredRatingsPerCoachInput,
} from "@/lib/allStar/ballotVoteRules";
import {
  buildAllStarAgeOptionsForAgeGroup,
  requiresDyb12uAgeBandFilter,
  resolveAllStarAgeGroupMetadata,
  type ContentOrgId,
} from "@/lib/allStar/cycleSetupHelpers";

export type SetupWizardStepId =
  | "context"
  | "ageGroup"
  | "poolFilters"
  | "ballotDetails"
  | "voterAccess"
  | "roster"
  | "coachAccess"
  | "schedule"
  | "review";

export type SetupAccessMode = "INVITE_LIST" | "AGE_GROUP_COACHES";
export type SetupAgeBandFilter = "11U" | "12U" | "BOTH";
export type SetupRosterSource = "teams" | "spreadsheet" | "empty";
export type SetupVotingPreset = "1h" | "4h" | "24h" | "custom";

export type SetupWizardAnswers = {
  organizationId: ContentOrgId;
  seasonYear: number;
  ageGroup: string;
  allStarAgeGroupId: string;
  allStarAgeGroupLabel: string;
  ageBandFilter: SetupAgeBandFilter;
  title: string;
  hasShowcase: boolean;
  requiredRatingsPerCoach: number;
  accessMode: SetupAccessMode;
  rosterSource: SetupRosterSource;
  selectedCoachIds: string[];
  extraInviteEmails: string;
  votingPreset: SetupVotingPreset;
  publishedAtLocal: string;
  closedAtLocal: string;
};

export const SETUP_WIZARD_STEP_LABELS: Record<SetupWizardStepId, string> = {
  context: "Organization and season",
  ageGroup: "Age group",
  poolFilters: "Player pool",
  ballotDetails: "Ballot details",
  voterAccess: "Who can vote",
  roster: "Candidate roster",
  coachAccess: "Invite roster",
  schedule: "Voting window",
  review: "Review and publish",
};

export function createDefaultSetupAnswers(
  organizationId: ContentOrgId,
  seasonYear: number,
): SetupWizardAnswers {
  return {
    organizationId,
    seasonYear,
    ageGroup: "",
    allStarAgeGroupId: "",
    allStarAgeGroupLabel: "",
    ageBandFilter: "BOTH",
    title: "",
    hasShowcase: true,
    requiredRatingsPerCoach: DEFAULT_REQUIRED_RATINGS_PER_COACH,
    accessMode: "AGE_GROUP_COACHES",
    rosterSource: "teams",
    selectedCoachIds: [],
    extraInviteEmails: "",
    votingPreset: "24h",
    publishedAtLocal: "",
    closedAtLocal: "",
  };
}

export function shouldShowPoolFiltersStep(answers: Pick<SetupWizardAnswers, "organizationId" | "ageGroup" | "allStarAgeGroupId">) {
  if (!answers.ageGroup.trim()) return false;
  const allStarOptions = buildAllStarAgeOptionsForAgeGroup(answers.ageGroup);
  const needsDybBand =
    requiresDyb12uAgeBandFilter(answers.organizationId, answers.ageGroup) && !answers.allStarAgeGroupId;
  return allStarOptions.length > 0 || needsDybBand;
}

export function buildVisibleSetupSteps(answers: Pick<SetupWizardAnswers, "organizationId" | "ageGroup" | "allStarAgeGroupId">): SetupWizardStepId[] {
  const steps: SetupWizardStepId[] = ["context", "ageGroup"];
  if (shouldShowPoolFiltersStep(answers)) {
    steps.push("poolFilters");
  }
  steps.push("ballotDetails", "voterAccess", "roster", "coachAccess", "schedule", "review");
  return steps;
}

export function getSetupStepLabel(stepId: SetupWizardStepId) {
  return SETUP_WIZARD_STEP_LABELS[stepId];
}

export function getSetupStepIndex(stepId: SetupWizardStepId, answers: Pick<SetupWizardAnswers, "organizationId" | "ageGroup" | "allStarAgeGroupId">) {
  const steps = buildVisibleSetupSteps(answers);
  return Math.max(0, steps.indexOf(stepId));
}

export function getNextSetupStep(
  current: SetupWizardStepId,
  answers: Pick<SetupWizardAnswers, "organizationId" | "ageGroup" | "allStarAgeGroupId">,
): SetupWizardStepId | null {
  const steps = buildVisibleSetupSteps(answers);
  const index = steps.indexOf(current);
  if (index < 0 || index >= steps.length - 1) return null;
  return steps[index + 1] ?? null;
}

export function getPreviousSetupStep(
  current: SetupWizardStepId,
  answers: Pick<SetupWizardAnswers, "organizationId" | "ageGroup" | "allStarAgeGroupId">,
): SetupWizardStepId | null {
  const steps = buildVisibleSetupSteps(answers);
  const index = steps.indexOf(current);
  if (index <= 0) return null;
  return steps[index - 1] ?? null;
}

export function resolveAutoCycleTitle(
  organizationId: ContentOrgId,
  ageGroup: string,
  ageBandFilter: SetupAgeBandFilter,
) {
  if (
    organizationId === "gonzales" &&
    ageGroup.trim().toUpperCase().startsWith("12U") &&
    ageBandFilter === "11U"
  ) {
    return "11U DYB";
  }
  return "";
}

export function resolveSetupWizardCycleTitle(answers: SetupWizardAnswers) {
  const explicitTitle = answers.title.trim();
  if (explicitTitle) return explicitTitle;
  return resolveAutoCycleTitle(answers.organizationId, answers.ageGroup, answers.ageBandFilter);
}

export function buildCreateCyclePayload(
  answers: SetupWizardAnswers,
  options?: { resumeExistingDraft?: boolean },
) {
  const shouldUseAgeBandFilter = requiresDyb12uAgeBandFilter(answers.organizationId, answers.ageGroup);
  const resolvedAllStarAgeGroup = resolveAllStarAgeGroupMetadata({
    organizationId: answers.organizationId,
    ageGroup: answers.ageGroup,
    allStarAgeGroupId: answers.allStarAgeGroupId,
    allStarAgeGroupLabel: answers.allStarAgeGroupLabel,
    ageBandFilter: answers.ageBandFilter,
  });
  const normalizedTitle = resolveSetupWizardCycleTitle(answers);

  return {
    intent: "setup_wizard" as const,
    resumeExistingDraft: options?.resumeExistingDraft === true,
    organizationId: answers.organizationId,
    seasonYear: answers.seasonYear,
    ageGroup: answers.ageGroup,
    title: normalizedTitle || undefined,
    allStarAgeGroupId: resolvedAllStarAgeGroup.id,
    allStarAgeGroupLabel: resolvedAllStarAgeGroup.label,
    accessMode: answers.accessMode,
    hasShowcase: answers.hasShowcase,
    requiredRatingsPerCoach: answers.requiredRatingsPerCoach,
    autoImportAgeBandFilter: shouldUseAgeBandFilter ? answers.ageBandFilter : "BOTH",
  };
}

export function parseExtraInviteEmails(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function buildInviteEmails(
  selectedCoachEmails: string[],
  extraInviteEmails: string,
) {
  const manualEmails = parseExtraInviteEmails(extraInviteEmails);
  const selected = Array.from(new Set(selectedCoachEmails.map((email) => email.trim().toLowerCase()).filter(Boolean)));
  return Array.from(new Set([...selected, ...manualEmails]));
}

export function resolveVotingWindowFromPreset(
  preset: SetupVotingPreset,
  publishedAtLocal: string,
  closedAtLocal: string,
) {
  if (preset === "custom") {
    const publishedAt = publishedAtLocal ? new Date(publishedAtLocal).toISOString() : null;
    const closedAt = closedAtLocal ? new Date(closedAtLocal).toISOString() : null;
    return { publishedAt, closedAt };
  }

  const now = new Date();
  const hours = preset === "1h" ? 1 : preset === "4h" ? 4 : 24;
  const close = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return {
    publishedAt: now.toISOString(),
    closedAt: close.toISOString(),
  };
}

export function validateSetupStep(
  stepId: SetupWizardStepId,
  answers: SetupWizardAnswers,
  context: {
    candidateCount: number;
    cycleId: string;
    selectedCoachEmails: string[];
  },
): string | null {
  switch (stepId) {
    case "context":
      if (!Number.isInteger(answers.seasonYear) || answers.seasonYear < 2020 || answers.seasonYear > 2100) {
        return "Choose a valid season year.";
      }
      return null;
    case "ageGroup":
      if (!answers.ageGroup.trim()) return "Choose an age group.";
      return null;
    case "poolFilters":
      if (
        requiresDyb12uAgeBandFilter(answers.organizationId, answers.ageGroup) &&
        !answers.allStarAgeGroupId &&
        !answers.ageBandFilter
      ) {
        return "Choose an All-Star player pool for 12U DYB.";
      }
      return null;
    case "ballotDetails": {
      if (!parseRequiredRatingsPerCoachInput(answers.requiredRatingsPerCoach)) {
        return "Enter how many candidates each coach must rate (1–50).";
      }
      return null;
    }
    case "voterAccess":
      return null;
    case "roster":
      if (!context.cycleId) return "Create the ballot cycle before continuing.";
      if (answers.rosterSource === "spreadsheet" && context.candidateCount <= 0) {
        return "Upload a spreadsheet before continuing, or choose another roster option.";
      }
      if (answers.rosterSource === "teams" && context.candidateCount <= 0) {
        return "No candidates were imported from teams. Re-run setup with a spreadsheet or choose an empty roster.";
      }
      return null;
    case "coachAccess": {
      if (answers.accessMode === "INVITE_LIST") {
        const emails = buildInviteEmails(context.selectedCoachEmails, answers.extraInviteEmails);
        if (emails.length === 0) {
          return "Select at least one coach or enter at least one email for invite-only voting.";
        }
      }
      return null;
    }
    case "schedule": {
      const { publishedAt, closedAt } = resolveVotingWindowFromPreset(
        answers.votingPreset,
        answers.publishedAtLocal,
        answers.closedAtLocal,
      );
      if (!publishedAt || !closedAt) return "Set both open and close times.";
      if (new Date(closedAt) <= new Date(publishedAt)) return "Close time must be later than open time.";
      return null;
    }
    case "review":
      if (!context.cycleId) return "Ballot cycle is missing.";
      if (context.candidateCount <= 0) return "Add candidates before publishing.";
      if (answers.requiredRatingsPerCoach > context.candidateCount) {
        return "Ratings per coach cannot exceed the number of candidates on the ballot.";
      }
      return null;
    default:
      return null;
  }
}
