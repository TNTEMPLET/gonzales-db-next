export const SCHEDULER_WIZARD_STEPS = [
  { id: "scheduler-season", number: 1, shortLabel: "Season", title: "Setup Season" },
  { id: "scheduler-parks", number: 2, shortLabel: "Parks", title: "Parks & Fields" },
  { id: "scheduler-matrix", number: 3, shortLabel: "Limits", title: "Division constraints" },
  { id: "scheduler-generate", number: 4, shortLabel: "Generate", title: "Generate Schedule" },
  { id: "scheduler-review", number: 5, shortLabel: "Review", title: "Review & Fix" },
  { id: "scheduler-export", number: 6, shortLabel: "Export", title: "Export" },
  { id: "scheduler-practice", number: 7, shortLabel: "Practice", title: "Practice Slots" },
  { id: "scheduler-notify", number: 8, shortLabel: "Notify", title: "Notify Coaches" },
] as const;

export type SchedulerWizardStepId = (typeof SCHEDULER_WIZARD_STEPS)[number]["id"];
export type SchedulerStepStatus = "COMPLETE" | "INCOMPLETE";

export type SchedulerWizardSnapshot = {
  seasonSaved: boolean;
  fieldCount: number;
  availableSlotCount: number;
  savedRuleCount: number;
  draftGameCount: number;
  conflictGameCount: number;
  practiceAssignedCount: number;
  practiceTeamCount: number;
  notifySentCount: number;
};

/** Complete steps stay collapsed unless the user reopened them to edit. */
export function wizardStepIsOpen(complete: boolean, reopened: boolean): boolean {
  return !complete || reopened;
}

export function schedulerStepStatus(
  stepId: SchedulerWizardStepId,
  snap: SchedulerWizardSnapshot,
): SchedulerStepStatus {
  switch (stepId) {
    case "scheduler-season":
      return snap.seasonSaved ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-parks":
      return snap.fieldCount > 0 && snap.availableSlotCount > 0 ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-matrix":
      return snap.savedRuleCount > 0 ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-generate":
      return snap.draftGameCount > 0 ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-review":
      return snap.draftGameCount > 0 && snap.conflictGameCount === 0 ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-export":
      return snap.draftGameCount > 0 ? "COMPLETE" : "INCOMPLETE";
    case "scheduler-practice":
      return snap.practiceTeamCount > 0 && snap.practiceAssignedCount >= snap.practiceTeamCount
        ? "COMPLETE"
        : "INCOMPLETE";
    case "scheduler-notify":
      return snap.notifySentCount > 0 ? "COMPLETE" : "INCOMPLETE";
  }
}
