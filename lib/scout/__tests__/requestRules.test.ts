import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SCOUT_CALENDAR_SUBJECT_PREFIXES, evaluateScoutCalendar } from "@/lib/scout/calendarRule";
import { evaluateScoutRequestText } from "@/lib/scout/requestRules";

describe("evaluateScoutRequestText", () => {
  it("keeps change requests from the subject or the snippet", () => {
    const samples = [
      ["Can you update the synthetic roster?", ""],
      ["", "Could you move the synthetic game time"],
      ["Would you add a synthetic coach", ""],
      ["Please fix the synthetic field assignment", ""],
      ["Need you to remove a synthetic player", ""],
      ["", "Please correct the synthetic score"],
      ["Adjust the synthetic division list", ""],
      ["The synthetic banner needs to be updated", ""],
      ["Fwd: Can you fix the synthetic schedule", "Sharing the note below."],
    ];
    for (const [subject, snippet] of samples) {
      const decision = evaluateScoutRequestText(subject, snippet);
      assert.equal(decision.keep, true, subject || snippet);
      assert.equal(decision.kind, "change_request", subject || snippet);
    }
  });

  it("keeps report requests", () => {
    const samples = [
      ["Can you send me the synthetic registration report", ""],
      ["How many synthetic teams are registered", ""],
      ["", "Need a breakdown of synthetic ages"],
      ["Please pull the list of synthetic coaches", ""],
      ["Export the synthetic numbers", ""],
      ["", "Send me the synthetic roster numbers"],
    ];
    for (const [subject, snippet] of samples) {
      const decision = evaluateScoutRequestText(subject, snippet);
      assert.equal(decision.keep, true, subject || snippet);
      assert.equal(decision.kind, "report_request", subject || snippet);
    }
  });

  it("drops FYI, chatter, news wording, and courtesy", () => {
    const samples = [
      ["FYI the synthetic snack schedule is posted", ""],
      ["", "Just sharing synthetic notes from Saturday"],
      ["Thanks for coming", "See you at the synthetic park"],
      ["Synthetic weekly news report", ""],
      ["Please see the attached synthetic photos", ""],
      ["Thanks for the update", ""],
      ["No change to the synthetic schedule", ""],
      ["Fwd: Synthetic meeting notes", "For your files."],
    ];
    for (const [subject, snippet] of samples) {
      const decision = evaluateScoutRequestText(subject, snippet);
      assert.equal(decision.keep, false, `${subject} ${snippet}`);
      assert.equal(decision.kind, "other");
    }
  });

  it("keeps an FYI that also asks for a change", () => {
    const decision = evaluateScoutRequestText("FYI synthetic notes", "Can you update the synthetic roster");
    assert.equal(decision.keep, true);
    assert.equal(decision.kind, "change_request");
  });

  it("decodes snippet entities before matching", () => {
    const decision = evaluateScoutRequestText("Hello", "Can you update the synthetic&nbsp;roster");
    assert.equal(decision.keep, true);
    assert.equal(decision.kind, "change_request");
  });

  it("does not match add inside address, added, or other words", () => {
    const skipped = [
      ["The synthetic address is on the form", ""],
      ["", "I added the synthetic coach"],
      ["Additional synthetic notes", ""],
      ["The schedule changed", ""],
      ["Thanks for the update about the address", ""],
    ];
    for (const [subject, snippet] of skipped) {
      const decision = evaluateScoutRequestText(subject, snippet);
      assert.equal(decision.keep, false, `${subject} ${snippet}`);
      assert.equal(decision.detail.includes("add"), false, decision.detail);
    }

    const added = evaluateScoutRequestText("The synthetic coach needs to be added", "");
    assert.equal(added.keep, true);
    assert.equal(added.kind, "change_request");
    assert.match(added.detail, /added/);

    const add = evaluateScoutRequestText("Please add a synthetic coach", "");
    assert.equal(add.keep, true);
    assert.equal(add.detail, "change:add");
  });
});

describe("evaluateScoutCalendar", () => {
  it("skips invite subjects, updates, cancellations, RSVPs, and replies", () => {
    for (const prefix of SCOUT_CALENDAR_SUBJECT_PREFIXES) {
      const decision = evaluateScoutCalendar({
        subject: `${prefix} Synthetic meetup`,
        headers: [],
      });
      assert.equal(decision.skip, true, prefix);
    }
    for (const subject of [
      "Re: Updated invitation: Synthetic meetup",
      "Re: Updated invitation with note: Synthetic meetup",
      "RE: Accepted: Synthetic meetup",
      "Fwd: Invitation: Synthetic board meeting",
      "FW: Canceled event: Synthetic practice",
      "Re: Re: Declined: Synthetic practice",
      "Fw: Tentatively accepted: Synthetic practice",
      "Re: Cancelled event: Synthetic practice",
      "Re: Invitation from Google Calendar: Synthetic meetup",
      "Fwd: Re: Invitation: Synthetic meetup",
      "Re: Fwd: Updated invitation: Synthetic meetup",
      "Fw:Re: Invitation: Synthetic meetup",
    ]) {
      const decision = evaluateScoutCalendar({ subject, headers: [] });
      assert.equal(decision.skip, true, subject);
      if (decision.skip) assert.equal(decision.detail, "subject");
    }
  });

  it("does not treat a normal subject that mentions an invitation as calendar mail", () => {
    assert.equal(evaluateScoutCalendar({ subject: "The synthetic invitation is attached", headers: [] }).skip, false);
    assert.equal(evaluateScoutCalendar({ subject: "Accepted the synthetic offer", headers: [] }).skip, false);
    assert.equal(
      evaluateScoutCalendar({ subject: "Fwd: Can you update the synthetic roster", headers: [] }).skip,
      false,
    );
    assert.equal(
      evaluateScoutCalendar({ subject: "Invitation to the synthetic picnic", headers: [] }).skip,
      false,
    );
    assert.equal(
      evaluateScoutCalendar({ subject: "Fwd: The synthetic invitation is attached", headers: [] }).skip,
      false,
    );
    assert.equal(
      evaluateScoutCalendar({
        subject: "Please update the synthetic roster",
        headers: [{ name: "Content-Type", value: 'multipart/mixed; boundary="text/calendar"' }],
      }).skip,
      false,
    );
  });

  it("skips calendar headers and ics parts even when the subject is a request", () => {
    const subject = "Please update the synthetic roster";
    assert.equal(
      evaluateScoutCalendar({
        subject,
        headers: [{ name: "Content-Type", value: "text/calendar; method=REQUEST; charset=UTF-8" }],
      }).skip,
      true,
    );
    assert.equal(
      evaluateScoutCalendar({
        subject,
        headers: [{ name: "Content-Class", value: "urn:content-classes:calendarmessage" }],
      }).skip,
      true,
    );
    assert.equal(
      evaluateScoutCalendar({
        subject,
        headers: [{ name: "Sender", value: "Google Calendar <calendar-notification@google.com>" }],
      }).skip,
      true,
    );
    const part = evaluateScoutCalendar({ subject, headers: [], hasCalendarPart: true });
    assert.deepEqual(part, { skip: true, detail: "calendar part" });
  });
});
