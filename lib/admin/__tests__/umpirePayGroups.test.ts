import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { groupPayByPark, weekdayName } from "../umpirePayGroups";
import { buildPayByParkPdf } from "../umpirePayPdf";

describe("groupPayByPark", () => {
  it("groups Park → weekday in calendar order", () => {
    const groups = groupPayByPark([
      game({ date: "Sep 8, 2026", time: "19:30", venue: "J Leo Stevens Park", gamePayTotal: 80 }),
      game({ date: "Sep 7, 2026", time: "18:00", venue: "Clouatre Park", gamePayTotal: 40 }),
      game({ date: "Sep 8, 2026", time: "18:00", venue: "J Leo Stevens Park", gamePayTotal: 60 }),
      game({ date: "Sep 7, 2026", time: "19:30", venue: "Clouatre Park", gamePayTotal: 40 }),
    ]);
    assert.deepEqual(
      groups.map((park) => park.park),
      ["Clouatre Park", "J Leo Stevens Park"],
    );
    assert.deepEqual(
      groups[0]?.days.map((day) => `${day.dayName} ${day.date}`),
      ["Monday Sep 7, 2026"],
    );
    assert.deepEqual(
      groups[1]?.days.map((day) => `${day.dayName} ${day.date}`),
      ["Tuesday Sep 8, 2026"],
    );
    assert.deepEqual(
      groups[1]?.days[0]?.games.map((row) => row.time),
      ["18:00", "19:30"],
    );
    assert.equal(groups[0]?.totalPay, 80);
    assert.equal(groups[1]?.totalPay, 140);
  });

  it("names weekdays Monday through Sunday", () => {
    assert.equal(weekdayName("Sep 7, 2026"), "Monday");
    assert.equal(weekdayName("Sep 8, 2026"), "Tuesday");
    assert.equal(weekdayName("Sep 9, 2026"), "Wednesday");
    assert.equal(weekdayName("Sep 10, 2026"), "Thursday");
    assert.equal(weekdayName("Sep 11, 2026"), "Friday");
    assert.equal(weekdayName("Sep 12, 2026"), "Saturday");
    assert.equal(weekdayName("Sep 13, 2026"), "Sunday");
  });
});

describe("buildPayByParkPdf", () => {
  it("writes park then weekday headers in calendar order", () => {
    const pdf = buildPayByParkPdf({
      orgName: "AP Fall Ball",
      startDate: "2026-09-07",
      endDate: "2026-09-10",
      rows: [
        {
          date: "Sep 10, 2026",
          time: "6:00 PM",
          homeTeam: "Cubs",
          awayTeam: "Mets",
          venue: "J Leo Stevens Park",
          subvenue: "Field 1",
          ageGroup: "12U",
          umpires: [{ name: "Sam Ump", pay: 80 }],
          gamePayTotal: 80,
        },
        {
          date: "Sep 7, 2026",
          time: "7:30 PM",
          homeTeam: "Astros",
          awayTeam: "Yankees",
          venue: "Clouatre Park",
          subvenue: "Field 2",
          ageGroup: "8U CP",
          umpires: [{ name: "Pat Ump", pay: 40 }],
          gamePayTotal: 40,
        },
        {
          date: "Sep 8, 2026",
          time: "6:00 PM",
          homeTeam: "Red Sox",
          awayTeam: "Orioles",
          venue: "Clouatre Park",
          subvenue: "Field 1",
          ageGroup: "10U",
          umpires: [{ name: "Pat Ump", pay: 60 }],
          gamePayTotal: 60,
        },
      ],
    });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const text = pdf.toString("latin1");
    const clouatre = text.indexOf("Clouatre Park");
    const jleo = text.indexOf("J Leo Stevens Park");
    const monday = text.indexOf("Monday");
    const tuesday = text.indexOf("Tuesday");
    const thursday = text.indexOf("Thursday");
    assert.ok(clouatre >= 0, "Clouatre Park header");
    assert.ok(jleo >= 0, "J Leo Stevens Park header");
    assert.ok(clouatre < jleo, "parks stay alphabetical");
    assert.ok(monday >= 0 && tuesday >= 0 && thursday >= 0, "weekday labels");
    assert.ok(monday < tuesday, "Monday before Tuesday at Clouatre");
    assert.ok(tuesday < jleo, "Clouatre days finish before the next park");
    assert.ok(jleo < thursday, "Thursday sits under J Leo Stevens");
  });
});

function game(input: { date: string; time: string; venue: string; gamePayTotal: number }) {
  return input;
}
