import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SCHEDULER_WIZARD_STEPS,
  schedulerStepStatus,
  wizardStepIsOpen,
  type SchedulerWizardSnapshot,
} from "../schedulerWizard";

const empty: SchedulerWizardSnapshot = {
  seasonSaved: false,
  fieldCount: 0,
  availableSlotCount: 0,
  savedRuleCount: 0,
  draftGameCount: 0,
  conflictGameCount: 0,
  practiceAssignedCount: 0,
  practiceTeamCount: 0,
  notifySentCount: 0,
};

describe("schedulerStepStatus", () => {
  it("keeps every step incomplete on an empty snapshot", () => {
    for (const step of SCHEDULER_WIZARD_STEPS) {
      assert.equal(schedulerStepStatus(step.id, empty), "INCOMPLETE");
    }
  });

  it("marks parks complete only when fields and available slots exist", () => {
    assert.equal(
      schedulerStepStatus("scheduler-parks", { ...empty, fieldCount: 3, availableSlotCount: 0 }),
      "INCOMPLETE",
    );
    assert.equal(
      schedulerStepStatus("scheduler-parks", { ...empty, fieldCount: 3, availableSlotCount: 1 }),
      "COMPLETE",
    );
  });

  it("marks review complete only when drafts exist and none are conflicts", () => {
    assert.equal(
      schedulerStepStatus("scheduler-review", { ...empty, draftGameCount: 12, conflictGameCount: 2 }),
      "INCOMPLETE",
    );
    assert.equal(
      schedulerStepStatus("scheduler-review", { ...empty, draftGameCount: 12, conflictGameCount: 0 }),
      "COMPLETE",
    );
  });

  it("marks practice complete when every real team has a slot", () => {
    assert.equal(
      schedulerStepStatus("scheduler-practice", {
        ...empty,
        practiceAssignedCount: 4,
        practiceTeamCount: 10,
      }),
      "INCOMPLETE",
    );
    assert.equal(
      schedulerStepStatus("scheduler-practice", {
        ...empty,
        practiceAssignedCount: 10,
        practiceTeamCount: 10,
      }),
      "COMPLETE",
    );
  });

  it("marks notify complete after at least one coach email is sent", () => {
    assert.equal(schedulerStepStatus("scheduler-notify", empty), "INCOMPLETE");
    assert.equal(
      schedulerStepStatus("scheduler-notify", { ...empty, notifySentCount: 12 }),
      "COMPLETE",
    );
  });
});

describe("wizardStepIsOpen", () => {
  it("keeps incomplete steps expanded", () => {
    assert.equal(wizardStepIsOpen(false, false), true);
    assert.equal(wizardStepIsOpen(false, true), true);
  });

  it("collapses complete steps until they are reopened", () => {
    assert.equal(wizardStepIsOpen(true, false), false);
    assert.equal(wizardStepIsOpen(true, true), true);
  });
});
