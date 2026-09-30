import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assignmentColumnPair,
  dayUsesTwoAssignmentColumns,
} from "../umpirePayAssignments";
import { formatReportFieldName } from "../umpirePayFieldLabel";
import { buildPayByParkPdf } from "../umpirePayPdf";

function dollars(pay: number) {
  return `$${pay}`;
}

describe("formatReportFieldName", () => {
  it("drops a trailing Field and leaves numbered Field 1 alone", () => {
    assert.equal(formatReportFieldName("1 - Impact Sports Field"), "1 - Impact Sports");
    assert.equal(formatReportFieldName("3 - Gauthier and Amedee Field"), "3 - Gauthier and Amedee");
    assert.equal(formatReportFieldName("4 - Velo Sports Field"), "4 - Velo Sports");
    assert.equal(formatReportFieldName("Aldridge Field"), "Aldridge");
    assert.equal(formatReportFieldName("Berthelot Field"), "Berthelot");
    assert.equal(formatReportFieldName("Patterson Field"), "Patterson");
    assert.equal(formatReportFieldName("Field 1"), "Field 1");
    assert.equal(formatReportFieldName("Field 2"), "Field 2");
    assert.equal(formatReportFieldName("6"), "6");
    assert.equal(formatReportFieldName(""), "—");
  });
});

describe("assignment columns", () => {
  it("splits two umpires and leaves the second cell empty for one", () => {
    assert.deepEqual(
      assignmentColumnPair(
        [
          { name: "Lathan Bourgeois", pay: 40 },
          { name: "Mackey Dunbar", pay: 40 },
        ],
        dollars,
      ),
      ["Lathan Bourgeois — $40", "Mackey Dunbar — $40"],
    );
    assert.deepEqual(assignmentColumnPair([{ name: "Graham Morgan", pay: 40 }], dollars), [
      "Graham Morgan — $40",
      "",
    ]);
    assert.equal(
      dayUsesTwoAssignmentColumns([
        { umpires: [{ name: "A", pay: 40 }] },
        { umpires: [{ name: "B", pay: 40 }, { name: "C", pay: 40 }] },
      ]),
      true,
    );
    assert.equal(dayUsesTwoAssignmentColumns([{ umpires: [{ name: "A", pay: 80 }] }]), false);
  });
});

describe("buildPayByParkPdf assignment columns", () => {
  it("uses two assignment columns when a day has a two-umpire game", () => {
    const pdf = buildPayByParkPdf({
      orgName: "AP Fall Ball",
      startDate: "2026-09-29",
      endDate: "2026-09-29",
      rows: [
        {
          date: "Sep 29, 2026",
          time: "6:00 PM",
          homeTeam: "Padres",
          awayTeam: "Pirates",
          venue: "J Leo Stevens Park",
          subvenue: "Field 1",
          ageGroup: "7U CP",
          umpires: [
            { name: "Lathan Bourgeois", pay: 40 },
            { name: "Mackey Dunbar", pay: 40 },
          ],
          gamePayTotal: 80,
        },
        {
          date: "Sep 29, 2026",
          time: "6:00 PM",
          homeTeam: "Cubs",
          awayTeam: "Red Sox",
          venue: "J Leo Stevens Park",
          subvenue: "6",
          ageGroup: "7U CP",
          umpires: [{ name: "Graham Morgan", pay: 40 }],
          gamePayTotal: 40,
        },
      ],
    });
    const text = pdf.toString("latin1");
    assert.match(text, /Assignment 1/);
    assert.match(text, /Assignment 2/);
    assert.equal(text.includes("Lathan Bourgeois — $40.00;"), false);
    assert.ok(text.includes("Lathan Bourgeois"));
    assert.ok(text.includes("Mackey Dunbar"));
    assert.ok(text.includes("Graham Morgan"));
  });

  it("keeps a single Assignments column when every game has one umpire", () => {
    const pdf = buildPayByParkPdf({
      orgName: "AP Fall Ball",
      startDate: "2026-09-28",
      endDate: "2026-09-28",
      rows: [
        {
          date: "Sep 28, 2026",
          time: "5:45 PM",
          homeTeam: "Astros",
          awayTeam: "Yankees",
          venue: "Tee-Joe Gonzales Park",
          subvenue: "Aldridge Field",
          ageGroup: "12U",
          umpires: [{ name: "Jerome Duet", pay: 80 }],
          gamePayTotal: 80,
        },
      ],
    });
    const text = pdf.toString("latin1");
    assert.match(text, /Assignments/);
    assert.equal(text.includes("Assignment 1"), false);
  });
});
