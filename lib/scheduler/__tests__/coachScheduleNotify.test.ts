import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCoachScheduleEmail,
  coachDisplayName,
  coachNotifyAudience,
  coachNotifyStatus,
  formatNotifyClock,
  formatNotifyDate,
  formatNotifyGameLine,
  formatNotifyPracticeLine,
  uniqueNotifyAgeGroups,
} from "../coachScheduleEmail";

describe("coachScheduleNotify formatters", () => {
  it("formats clocks and dates the way the rest of the wizard does", () => {
    assert.equal(formatNotifyClock("17:45"), "5:45 PM");
    assert.equal(formatNotifyDate("2026-09-28"), "9/28/2026");
  });

  it("uses first + last name before the combined name field", () => {
    assert.equal(coachDisplayName({ firstName: "Trent", lastName: "Smith", name: "Other" }), "Trent Smith");
    assert.equal(coachDisplayName({ firstName: null, lastName: null, name: "Coach Bo" }), "Coach Bo");
    assert.equal(coachDisplayName(null), null);
  });

  it("builds a home/away game line", () => {
    const line = formatNotifyGameLine({
      gameDate: "2026-09-28",
      startTime: "17:45",
      opponent: "Yankees",
      parkName: "Tee-Joe Gonzales Park",
      fieldName: "Bourque",
      home: true,
    });
    assert.equal(line.text, "9/28/2026 · 5:45 PM · vs Yankees · Tee-Joe Gonzales Park · Bourque · Home");
  });

  it("marks missing coaches before missing email", () => {
    assert.equal(coachNotifyStatus({ coachEmail: null, registeredUserId: null }), "no_head_coach");
    assert.equal(coachNotifyStatus({ coachEmail: null, registeredUserId: "u1" }), "no_email");
    assert.equal(coachNotifyStatus({ coachEmail: "a@b.com", registeredUserId: "u1", suppressed: true }), "suppressed");
    assert.equal(coachNotifyStatus({ coachEmail: "a@b.com", registeredUserId: "u1" }), "ready");
  });

  it("puts the 12U rotation week on the day, not buried in notes", () => {
    const line = formatNotifyPracticeLine({
      dayOfWeek: 1,
      startTime: "17:45",
      parkName: "Tee-Joe Gonzales Park",
      fieldName: "Bourque Field",
      pairedTeamName: "Yankees - Mumphrey",
      notes: "Week 2 of 3",
    });
    assert.equal(line.day, "Week 2 · Monday");
    assert.equal(line.notes, "");
    assert.match(line.text, /^Week 2 · Mondays 5:45 PM/);
  });

  it("includes practice, games, and Coach Corner in the email body", () => {
    const email = buildCoachScheduleEmail({
      coachName: "Trent Smith",
      orgName: "AP Fall Ball",
      seasonName: "Fall Ball 2026",
      ageGroup: "6U MOD",
      teamName: "Astros",
      practicePlan: "Tuesdays 5:45 PM — Bourque, Tee-Joe Gonzales Park",
      practices: [
        formatNotifyPracticeLine({
          dayOfWeek: 2,
          startTime: "17:45",
          parkName: "Tee-Joe Gonzales Park",
          fieldName: "Bourque",
          pairedTeamName: "Yankees",
          notes: null,
        }),
      ],
      games: [
        formatNotifyGameLine({
          gameDate: "2026-09-28",
          startTime: "17:45",
          opponent: "Yankees",
          parkName: "Tee-Joe Gonzales Park",
          fieldName: "Bourque",
          home: true,
        }),
      ],
      practiceWindow: "9/6/2026 – 9/26/2026",
      gamesWindow: "9/27/2026 – 10/31/2026",
      coachCornerUrl: "https://fallball.apbaseball.com/coach-corner",
    });
    assert.match(email.subject, /6U MOD Astros/);
    assert.match(email.text, /Hi Trent/);
    assert.match(email.text, /Tuesdays 5:45 PM/);
    assert.match(email.text, /vs Yankees/);
    assert.match(email.text, /A PDF of this schedule is attached/);
    assert.match(email.text, /Coach Corner: https:\/\/fallball.apbaseball.com\/coach-corner/);
    assert.doesNotMatch(email.text, /Assignr|SportsConnect|GameChanger/);
    assert.match(email.html, /Open Coach Corner/);
    assert.match(email.html, /<table/);
    assert.match(email.html, /<th[^>]*>Day</);
    assert.match(email.html, /<th[^>]*>Opponent</);
    assert.match(email.html, /Bourque/);
    assert.doesNotMatch(email.html, /Assignr|SportsConnect|GameChanger/);
  });

  it("orders notify divisions by age and builds a send audience from checkboxes", () => {
    const rows = [
      { teamId: "t-12", ageGroup: "12U", status: "ready" },
      { teamId: "t-7", ageGroup: "7U CP", status: "ready" },
      { teamId: "t-7b", ageGroup: "7U CP", status: "no_head_coach" },
      { teamId: "t-6", ageGroup: "6U MOD", status: "ready" },
    ];
    assert.deepEqual(uniqueNotifyAgeGroups(rows), ["6U MOD", "7U CP", "12U"]);

    const selected = coachNotifyAudience(rows, ["7U CP", "12U"]);
    assert.deepEqual(selected.labels, ["7U CP", "12U"]);
    assert.equal(selected.teamCount, 3);
    assert.equal(selected.readyCount, 2);
    assert.deepEqual(selected.teamIds, ["t-12", "t-7"]);

    const none = coachNotifyAudience(rows, []);
    assert.equal(none.readyCount, 0);
    assert.deepEqual(none.teamIds, []);
  });
});
