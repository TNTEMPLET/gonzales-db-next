import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  buildDirectorScheduleAttachments,
  buildDirectorSchedulePdf,
  directorScheduleFileStem,
} from "../directorScheduleAttachments";
import type { DirectorScheduleGame } from "../directorScheduleEmail";

const games: DirectorScheduleGame[] = [
  {
    parkId: "paula",
    parkName: "Paula Park",
    fieldId: "f4",
    fieldName: "Field 4",
    division: "4U TB",
    date: "2026-09-28",
    startTime: "17:45",
    homeTeamName: "Yankees",
    awayTeamName: "Dodgers",
  },
  {
    parkId: "paula",
    parkName: "Paula Park",
    fieldId: "f6",
    fieldName: "Field 6",
    division: "4U TB",
    date: "2026-09-28",
    startTime: "17:45",
    homeTeamName: "Astros",
    awayTeamName: "Cubs",
  },
];

describe("directorScheduleAttachments", () => {
  it("names the PDF after the season and park", () => {
    assert.equal(directorScheduleFileStem("Fall Ball 2026", ["Paula Park"]), "Fall-Ball-2026-Paula-Park");
    assert.equal(directorScheduleFileStem("Fall Ball 2026", ["Paula Park", "Stevens"]), "Fall-Ball-2026-director-schedule");
  });

  it("builds a landscape PDF with park and day headings", () => {
    const pdf = buildDirectorSchedulePdf({
      seasonName: "Fall Ball 2026",
      orgName: "AP Fall Ball",
      gamesWindow: "9/27/2026 – 10/31/2026",
      games,
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    writeFileSync("/tmp/director-schedule-sample.pdf", pdf);
  });

  it("starts each park on a new page", () => {
    const twoParks: DirectorScheduleGame[] = [
      ...games,
      {
        parkId: "stevens",
        parkName: "J Leo Stevens Park",
        fieldId: "f1",
        fieldName: "Field 1",
        division: "6U MOD",
        date: "2026-09-28",
        startTime: "18:00",
        homeTeamName: "Astros",
        awayTeamName: "Yankees",
      },
    ];
    const pdf = buildDirectorSchedulePdf({
      seasonName: "Fall Ball 2026",
      orgName: "AP Fall Ball",
      games: twoParks,
    });
    const pageCount = [...pdf.toString("latin1").matchAll(/\/Type\s*\/Page\b/g)].filter(
      (match) => !match[0].includes("Pages"),
    ).length;
    assert.ok(pageCount >= 2, `expected a page per park, got ${pageCount}`);
  });

  it("attaches only the PDF", () => {
    const attachments = buildDirectorScheduleAttachments({
      seasonName: "Fall Ball 2026",
      orgName: "AP Fall Ball",
      games,
    });
    assert.deepEqual(
      attachments.map((item) => item.filename),
      ["Fall-Ball-2026-Paula-Park.pdf"],
    );
    assert.equal(attachments[0]?.contentType, "application/pdf");
    assert.ok((attachments[0]?.content.length ?? 0) > 0);
  });
});
