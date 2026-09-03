import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { describe, it } from "node:test";

import { formatNotifyGameLine, formatNotifyPracticeLine } from "../coachScheduleEmail";
import {
  buildCoachScheduleAttachments,
  buildCoachSchedulePdf,
  coachScheduleFileStem,
} from "../coachScheduleAttachments";

const games = [
  formatNotifyGameLine({
    gameDate: "2026-09-28",
    startTime: "17:45",
    opponent: "Yankees",
    parkName: "Tee-Joe Gonzales Park",
    fieldName: "Bourque",
    home: true,
  }),
];
const practices = [
  formatNotifyPracticeLine({
    dayOfWeek: 2,
    startTime: "17:45",
    parkName: "Tee-Joe Gonzales Park",
    fieldName: "Bourque",
    pairedTeamName: "Yankees",
    notes: null,
  }),
];

describe("coachScheduleAttachments", () => {
  it("builds a safe filename stem", () => {
    assert.equal(coachScheduleFileStem("6U MOD", "Astros"), "6U-MOD-Astros");
  });

  it("builds a PDF with practice and game rows", () => {
    const pdf = buildCoachSchedulePdf({
      ageGroup: "6U MOD",
      teamName: "Astros",
      seasonName: "Fall Ball 2026",
      orgName: "AP Fall Ball",
      practiceWindow: "9/6/2026 – 9/26/2026",
      gamesWindow: "9/27/2026 – 10/31/2026",
      games,
      practices,
    });
    assert.ok(pdf.subarray(0, 5).toString() === "%PDF-");
    writeFileSync("/tmp/coach-schedule-sample.pdf", pdf);
  });

  it("attaches only the PDF", () => {
    const attachments = buildCoachScheduleAttachments({
      ageGroup: "6U MOD",
      teamName: "Astros",
      seasonName: "Fall Ball 2026",
      games,
      practices,
    });
    assert.deepEqual(
      attachments.map((item) => item.filename),
      ["6U-MOD-Astros.pdf"],
    );
    assert.equal(attachments[0]?.contentType, "application/pdf");
    assert.ok((attachments[0]?.content.length ?? 0) > 0);
  });
});
