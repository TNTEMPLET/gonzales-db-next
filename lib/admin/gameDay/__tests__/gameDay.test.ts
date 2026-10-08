import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fieldDeskAuthRole } from "@/lib/admin/gameDay/authRole";
import { withControllerHolds } from "@/lib/admin/gameDay/controllers";
import { assignrDateKey, clockKey, crewForGame } from "@/lib/admin/gameDay/crew";
import { badgeTextColor, umpireCardText } from "@/lib/admin/gameDay/display";
import {
  gameDayHomePath,
  isDefaultAdminHome,
  landsOnGameDay,
  pathAfterAdminLogin,
} from "@/lib/admin/gameDay/landing";
import { chooseGameDayPark, gameDayDataMode } from "@/lib/admin/gameDay/parks";
import { mergeOwed, owedAtParks, payTotal } from "@/lib/admin/gameDay/pay";
import { rainoutBannerLines } from "@/lib/admin/gameDay/rainout";
import { gamesReadyForScores } from "@/lib/admin/gameDay/scores";
import { fieldDeskHashToTab, gameDayHref, parseGameDayTab } from "@/lib/admin/gameDay/tabs";
import type { FieldDeskGame } from "@/lib/admin/fieldDeskTypes";
import type { Game } from "@/lib/fetchGames";

describe("game day landing", () => {
  it("sends a park-director-only user to Game Day from the dashboard", () => {
    assert.equal(landsOnGameDay({ isMaster: false, rolesOnSite: ["PARK_DIRECTOR"] }), true);
    assert.equal(
      landsOnGameDay({ isMaster: false, rolesOnSite: ["PARK_DIRECTOR", null] }),
      true,
    );
    assert.equal(
      pathAfterAdminLogin({
        nextPath: "/admin?org=fallball",
        landsOnGameDay: true,
        org: "fallball",
      }),
      "/admin/game-day?org=fallball",
    );
  });

  it("keeps admins, masters, and explicit links on their destination", () => {
    assert.equal(landsOnGameDay({ isMaster: true, rolesOnSite: ["MASTER_ADMIN"] }), false);
    assert.equal(landsOnGameDay({ isMaster: false, rolesOnSite: ["ADMIN"] }), false);
    assert.equal(landsOnGameDay({ isMaster: false, rolesOnSite: ["PARK_DIRECTOR", "BOARD_MEMBER"] }), false);
    assert.equal(landsOnGameDay({ isMaster: false, rolesOnSite: [null] }), false);
    assert.equal(isDefaultAdminHome("/admin?org=gonzales"), true);
    assert.equal(isDefaultAdminHome("/admin/scores?org=gonzales"), false);
    assert.equal(
      pathAfterAdminLogin({ nextPath: "/admin/scores?org=gonzales", landsOnGameDay: true, org: "gonzales" }),
      "/admin/scores?org=gonzales",
    );
    assert.equal(
      pathAfterAdminLogin({ nextPath: "/admin", landsOnGameDay: false, org: "gonzales" }),
      "/admin",
    );
    assert.equal(gameDayHomePath(null), "/admin/game-day");
  });
});

describe("game day parks and tabs", () => {
  it("opens the only park and waits when there are several", () => {
    assert.deepEqual(chooseGameDayPark([{ id: "v1", label: "Stevens" }], null), {
      parks: [{ id: "v1", label: "Stevens" }],
      selectedId: "v1",
      needsChoice: false,
    });
    const many = chooseGameDayPark(
      [
        { id: "b", label: "Paula" },
        { id: "a", label: "Stevens" },
      ],
      null,
    );
    assert.equal(many.needsChoice, true);
    assert.equal(many.selectedId, null);
    assert.equal(chooseGameDayPark(many.parks, "a").selectedId, "a");
    assert.equal(chooseGameDayPark(many.parks, "missing").needsChoice, true);
  });

  it("uses assigned parks only for a director who has one", () => {
    assert.equal(
      gameDayDataMode({ isMaster: false, roleIsParkDirector: true, activeAssignmentCount: 1 }),
      "assigned",
    );
    assert.equal(
      gameDayDataMode({ isMaster: false, roleIsParkDirector: true, activeAssignmentCount: 0 }),
      "league",
    );
    assert.equal(
      gameDayDataMode({ isMaster: false, roleIsParkDirector: false, activeAssignmentCount: 2 }),
      "league",
    );
    assert.equal(
      gameDayDataMode({ isMaster: true, roleIsParkDirector: true, activeAssignmentCount: 2 }),
      "league",
    );
  });

  it("maps field-desk bookmarks onto Game Day tabs", () => {
    assert.equal(fieldDeskHashToTab("#controllers"), "controllers");
    assert.equal(fieldDeskHashToTab("cards"), "cards");
    assert.equal(fieldDeskHashToTab("#where"), "cards");
    assert.equal(fieldDeskHashToTab(""), null);
    assert.equal(parseGameDayTab("pay"), "pay");
    assert.equal(parseGameDayTab("nope"), "today");
    assert.equal(gameDayHref({ org: "fallball", tab: "scores", parkId: "v1", day: "2026-10-08" }),
      "/admin/game-day?org=fallball&day=2026-10-08&park=v1&tab=scores");
  });
});

describe("game day crew, pay, and scores", () => {
  it("reads the crew when Assignr matches and stays empty when it does not", () => {
    const target = {
      dateKey: "2026-10-08",
      startTime: "18:00",
      homeTeam: "Stevens",
      awayTeam: "Paula",
      parkNames: ["J Leo Stevens Park"],
    };
    assert.deepEqual(crewForGame(target, [assignrGame()]), ["Sam Ump"]);
    assert.deepEqual(crewForGame(target, []), []);
    assert.deepEqual(crewForGame({ ...target, homeTeam: "Other" }, [assignrGame()]), []);
    assert.equal(clockKey("6:00 PM"), "18:00");
    assert.equal(assignrDateKey({ localized_date: "10/8/2026" } as Game), "2026-10-08");
  });

  it("sums pay across leagues and stays at zero without rows", () => {
    const stevens = owedAtParks([assignrGame()], ["J. Leo Stevens"], { org: "gonzales" });
    const other = owedAtParks(
      [assignrGame({ id: 2, venue: "Somewhere Else", officials: [{ id: "9", first: "Ada", last: "Blue" }] })],
      ["J Leo Stevens Park"],
      { org: "fallball" },
    );
    assert.equal(other.length, 0);
    const merged = mergeOwed([stevens, stevens]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.games, 2);
    assert.equal(payTotal(merged), (stevens[0]?.totalPay ?? 0) * 2);
    assert.equal(payTotal([]), 0);
  });

  it("keeps Paula Park off the score pads and waits for first pitch", () => {
    const asOf = new Date("2026-10-08T22:00:00.000Z");
    const closed = gamesReadyForScores(
      [{ dateKey: "2026-10-08", startTime: "17:00", parkName: "Paula Park" }],
      asOf,
    );
    assert.equal(closed.closedForPark, true);
    assert.equal(closed.ready.length, 0);
    const open = gamesReadyForScores(
      [
        { dateKey: "2026-10-08", startTime: "17:00", parkName: "J Leo Stevens Park" },
        { dateKey: "2026-10-08", startTime: "23:30", parkName: "J Leo Stevens Park" },
      ],
      asOf,
    );
    assert.equal(open.ready.length, 1);
    assert.equal(open.closedForPark, false);
  });

  it("writes a copy-friendly card and a readable badge", () => {
    const text = umpireCardText([
      {
        when: "Wed, Oct 8, 2026 · 6:00 PM",
        division: "10U",
        parkName: "Stevens",
        fieldName: "Field 2",
        awayTeam: "Away",
        homeTeam: "Home",
        crew: ["Sam Ump"],
      },
    ]);
    assert.match(text, /Away at Home/);
    assert.match(text, /Sam Ump/);
    assert.equal(badgeTextColor("#f5f5f5"), "#111827");
    assert.equal(badgeTextColor("#111827"), "#ffffff");
  });
});

describe("game day rainout and remote checkout", () => {
  it("shows a read-only rainout line for the chosen park", () => {
    const lines = rainoutBannerLines(
      [
        {
          leagueLabel: "Gonzales DYB",
          allParksOut: false,
          rainedOutParks: ["J Leo Stevens Park"],
          throughLabel: "Through 8:00 PM CT",
        },
        {
          leagueLabel: "Fall Ball",
          allParksOut: true,
          rainedOutParks: [],
          throughLabel: "Through 9:00 PM CT",
        },
      ],
      ["J Leo Stevens Park"],
    );
    assert.equal(lines.length, 2);
    assert.match(lines[0] ?? "", /Stevens/);
    assert.match(lines[1] ?? "", /all parks/);
    assert.deepEqual(
      rainoutBannerLines(
        [
          {
            leagueLabel: "Gonzales DYB",
            allParksOut: false,
            rainedOutParks: ["Paula Park"],
            throughLabel: null,
          },
        ],
        ["Stevens"],
      ),
      [],
    );
  });

  it("holds the next game while a controller is still out", () => {
    const held = withControllerHolds([
      controller({ id: "a", checkoutStatus: "out", checkoutName: "Ada Blue" }),
      controller({ id: "b", checkoutStatus: "in" }),
    ]);
    assert.equal(held[1]?.controllerHold?.volunteer, "Ada Blue");
    assert.equal(held[0]?.controllerHold, null);
  });

  it("lets an assigned director write another league's game and refuses everyone else", () => {
    assert.equal(
      fieldDeskAuthRole({
        roleOnGameOrg: null,
        siteRole: "PARK_DIRECTOR",
        hasActiveAssignments: true,
      }),
      "PARK_DIRECTOR",
    );
    assert.equal(
      fieldDeskAuthRole({
        roleOnGameOrg: null,
        siteRole: "PARK_DIRECTOR",
        hasActiveAssignments: false,
      }),
      null,
    );
    assert.equal(
      fieldDeskAuthRole({ roleOnGameOrg: "ADMIN", siteRole: null, hasActiveAssignments: false }),
      "ADMIN",
    );
    assert.equal(
      fieldDeskAuthRole({ roleOnGameOrg: null, siteRole: "BOARD_MEMBER", hasActiveAssignments: true }),
      null,
    );
  });
});

function assignrGame(
  overrides: Partial<Game> & { officials?: Array<{ id: string; first: string; last: string }> } = {},
): Game {
  const officials = overrides.officials ?? [{ id: "1", first: "Sam", last: "Ump" }];
  const rest: Partial<Game> = { ...overrides };
  delete rest.officials;
  return {
    id: 1,
    localized_date: "2026-10-08",
    localized_time: "6:00 PM",
    home_team: "Stevens",
    away_team: "Paula",
    age_group: "10U",
    status: "A",
    venue: "J Leo Stevens Park",
    _embedded: {
      assignments: officials.map((official) => ({
        _embedded: { official: { id: official.id, first_name: official.first, last_name: official.last } },
      })),
    },
    ...rest,
  } as Game;
}

function controller(overrides: Partial<FieldDeskGame> & { id: string }): FieldDeskGame & { fieldKey: string } {
  return {
    organizationId: "fallball",
    dateKey: "2026-10-08",
    startTime: "18:00",
    when: "Wed",
    ageGroup: "10U",
    homeTeam: "Home",
    awayTeam: "Away",
    parkName: "Stevens",
    fieldName: "Field 1",
    checkoutStatus: "in",
    checkoutSide: null,
    checkoutTeam: null,
    checkoutName: null,
    checkoutNote: null,
    controllerHold: null,
    isToday: true,
    fieldKey: "field-1",
    ...overrides,
  };
}
