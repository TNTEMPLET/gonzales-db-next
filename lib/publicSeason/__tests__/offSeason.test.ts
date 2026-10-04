import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OffSeasonNotice } from "@/components/publicSeason/OffSeasonNotice";
import {
  PublicOperationalGate,
  PublicStandingsSection,
} from "@/components/publicSeason/PublicSeasonSurfaces";
import {
  applySpringOffSeasonNav,
  finalStandingsLabel,
  isSpringPublicOffSeason,
  offSeasonSeasonInfoMessage,
  publicSurfaceVisibility,
  springPublicPhase,
  suppressPublicLiveScoreboard,
  type CompletedSeasonRecord,
  type PublicSeasonSurface,
} from "@/lib/publicSeason/offSeason";

function utcNoonOn(isoDate: string): Date {
  return new Date(`${isoDate}T17:00:00.000Z`);
}

const SPRING_BEFORE = utcNoonOn("2026-02-15");
const SPRING_OFF = utcNoonOn("2026-09-02");
const SPRING_LIVE = utcNoonOn("2026-04-15");
const FALL_LIVE = utcNoonOn("2026-09-02");
const FALL_OFF = utcNoonOn("2026-12-15");
const BOTH_OFF = utcNoonOn("2026-07-15");

const UPCOMING_MESSAGE =
  "Spring 2026 season info will appear here once the season begins on March 1, 2026.";
const AFTER_MESSAGE =
  "Spring 2027 season info will appear here once the season begins.";

const PRIOR_SEASONS: CompletedSeasonRecord[] = [
  { label: "Spring 2024", year: 2024, endDate: "2024-06-30" },
  { label: "Spring 2025", year: 2025, endDate: "2025-06-30" },
];

const SURFACES: PublicSeasonSurface[] = [
  "rosters",
  "schedule",
  "upcomingGames",
  "scoreboard",
  "standings",
];

const NAV = [
  { href: "/schedule", label: "Schedule" },
  { href: "/tournaments", label: "Tournaments", key: "tournaments" },
  { href: "/news", label: "News" },
] as const;

function markup(node: ReactElement): string {
  return renderToStaticMarkup(node);
}

function gate(
  props: Omit<ComponentProps<typeof PublicOperationalGate>, "children">,
  children: ReactNode,
) {
  return createElement(
    PublicOperationalGate,
    props as ComponentProps<typeof PublicOperationalGate>,
    children,
  );
}

function standings(
  props: Omit<ComponentProps<typeof PublicStandingsSection>, "children">,
  children: ReactNode,
) {
  return createElement(
    PublicStandingsSection,
    props as ComponentProps<typeof PublicStandingsSection>,
    children,
  );
}

describe("spring public off-season visibility", () => {
  for (const org of ["gonzales", "ascension"] as const) {
    it(`${org} before opening day treats the configured season as upcoming`, () => {
      assert.equal(springPublicPhase(org, SPRING_BEFORE), "before");
      assert.equal(isSpringPublicOffSeason(org, SPRING_BEFORE), true);
      assert.equal(publicSurfaceVisibility(org, "rosters", SPRING_BEFORE), "hidden");
      assert.equal(publicSurfaceVisibility(org, "schedule", SPRING_BEFORE), "hidden");
      assert.equal(publicSurfaceVisibility(org, "upcomingGames", SPRING_BEFORE), "hidden");
      assert.equal(publicSurfaceVisibility(org, "scoreboard", SPRING_BEFORE), "hidden");
      assert.equal(publicSurfaceVisibility(org, "standings", SPRING_BEFORE), "hidden");
      assert.equal(
        publicSurfaceVisibility(org, "standings", SPRING_BEFORE, PRIOR_SEASONS),
        "final",
      );
      assert.equal(finalStandingsLabel(org, SPRING_BEFORE), null);
      assert.equal(
        finalStandingsLabel(org, SPRING_BEFORE, PRIOR_SEASONS),
        "Spring 2025 Final Standings",
      );
      assert.equal(
        finalStandingsLabel(org, SPRING_BEFORE, [
          { label: "Spring 2026", year: 2026, endDate: "2026-06-30" },
        ]),
        null,
      );
      assert.equal(offSeasonSeasonInfoMessage(org, SPRING_BEFORE), UPCOMING_MESSAGE);
      assert.equal(offSeasonSeasonInfoMessage(org, SPRING_BEFORE).includes("Spring 2027"), false);
      assert.equal(offSeasonSeasonInfoMessage(org, SPRING_BEFORE).includes("Final"), false);

      const nav = applySpringOffSeasonNav(NAV, org, SPRING_BEFORE);
      assert.deepEqual(
        nav.map((link) => link.href),
        ["/tournaments", "/news"],
      );
      assert.equal(nav.some((link) => link.href === "/schedule"), false);
      assert.equal(nav.some((link) => link.href === "/standings"), false);

      const navWithHistory = applySpringOffSeasonNav(NAV, org, SPRING_BEFORE, PRIOR_SEASONS);
      assert.deepEqual(
        navWithHistory.map((link) => link.href),
        ["/standings", "/tournaments", "/news"],
      );
    });

    it(`${org} in season leaves every public surface unchanged`, () => {
      assert.equal(springPublicPhase(org, SPRING_LIVE), "live");
      assert.equal(isSpringPublicOffSeason(org, SPRING_LIVE), false);
      for (const surface of SURFACES) {
        assert.equal(publicSurfaceVisibility(org, surface, SPRING_LIVE), "live");
      }
      assert.equal(finalStandingsLabel(org, SPRING_LIVE), null);
      assert.equal(finalStandingsLabel(org, SPRING_LIVE, PRIOR_SEASONS), null);
      assert.equal(applySpringOffSeasonNav(NAV, org, SPRING_LIVE), NAV);
      assert.equal(applySpringOffSeasonNav(NAV, org, SPRING_LIVE, PRIOR_SEASONS), NAV);
    });

    it(`${org} after the window keeps the configured season as final`, () => {
      assert.equal(springPublicPhase(org, SPRING_OFF), "after");
      assert.equal(isSpringPublicOffSeason(org, SPRING_OFF), true);
      assert.equal(publicSurfaceVisibility(org, "rosters", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "schedule", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "upcomingGames", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "scoreboard", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "standings", SPRING_OFF), "final");
      assert.equal(finalStandingsLabel(org, SPRING_OFF), "Spring 2026 Final Standings");
      assert.equal(offSeasonSeasonInfoMessage(org, SPRING_OFF), AFTER_MESSAGE);
      assert.equal(offSeasonSeasonInfoMessage(org, SPRING_OFF).includes("on March"), false);

      const nav = applySpringOffSeasonNav(NAV, org, SPRING_OFF);
      assert.deepEqual(
        nav.map((link) => link.href),
        ["/standings", "/tournaments", "/news"],
      );
      assert.equal(nav.some((link) => link.href === "/schedule"), false);
    });
  }

  it("uses the calendar-day boundaries of the Spring window", () => {
    assert.equal(springPublicPhase("gonzales", utcNoonOn("2026-02-28")), "before");
    assert.equal(springPublicPhase("ascension", utcNoonOn("2026-02-28")), "before");
    assert.equal(springPublicPhase("gonzales", utcNoonOn("2026-03-01")), "live");
    assert.equal(springPublicPhase("ascension", utcNoonOn("2026-03-01")), "live");
    assert.equal(springPublicPhase("gonzales", utcNoonOn("2026-06-30")), "live");
    assert.equal(springPublicPhase("ascension", utcNoonOn("2026-06-30")), "live");
    assert.equal(springPublicPhase("gonzales", utcNoonOn("2026-07-01")), "after");
    assert.equal(springPublicPhase("ascension", utcNoonOn("2026-07-01")), "after");
  });

  for (const [label, asOf] of [
    ["before Spring opening day", SPRING_BEFORE],
    ["live September", FALL_LIVE],
    ["after the window in December", FALL_OFF],
    ["before the window in July", BOTH_OFF],
    ["during Spring in April", SPRING_LIVE],
  ] as const) {
    it(`fallball is unchanged while ${label}`, () => {
      assert.equal(springPublicPhase("fallball", asOf), null);
      assert.equal(isSpringPublicOffSeason("fallball", asOf), false);
      for (const surface of SURFACES) {
        assert.equal(publicSurfaceVisibility("fallball", surface, asOf), "live");
      }
      assert.equal(applySpringOffSeasonNav(NAV, "fallball", asOf), NAV);
      assert.equal(applySpringOffSeasonNav(NAV, "fallball", asOf, PRIOR_SEASONS), NAV);
    });
  }

  it("does not treat district or admin deployments as Spring off-season", () => {
    for (const org of ["ladistrict2", "ladistrict6", "master"]) {
      assert.equal(isSpringPublicOffSeason(org, SPRING_OFF), false);
      assert.equal(publicSurfaceVisibility(org, "schedule", SPRING_OFF), "live");
      assert.equal(publicSurfaceVisibility(org, "standings", SPRING_OFF), "live");
      assert.equal(applySpringOffSeasonNav(NAV, org, SPRING_OFF), NAV);
    }
  });

  it("suppresses live scoreboards only for an off-season Spring league", () => {
    const bracket = { id: "bracket-1", gameChanger: { widgetId: "widget-1" } };
    const hidden = suppressPublicLiveScoreboard(bracket, "gonzales", SPRING_OFF);
    assert.equal(hidden.gameChanger, null);
    assert.equal(hidden.id, "bracket-1");
    assert.equal(suppressPublicLiveScoreboard(bracket, "gonzales", SPRING_LIVE), bracket);
    assert.equal(suppressPublicLiveScoreboard(bracket, "ascension", SPRING_LIVE), bracket);
    assert.equal(suppressPublicLiveScoreboard(bracket, "fallball", FALL_LIVE), bracket);
    assert.equal(suppressPublicLiveScoreboard(bracket, "fallball", FALL_OFF), bracket);
    assert.equal(suppressPublicLiveScoreboard(bracket, "ladistrict6", SPRING_OFF), bracket);
  });
});

describe("rendered public season surfaces", () => {
  it("before opening day shows the upcoming season and hides a final label when none exists", () => {
    for (const org of ["gonzales", "ascension"] as const) {
      const html = markup(
        gate(
          {
            org,
            surface: "schedule",
            asOf: SPRING_BEFORE,
            registrationStatus: "CLOSED",
          },
          createElement("p", null, "Last year Saturday game"),
        ),
      );
      assert.equal(html.includes("Last year Saturday game"), false);
      assert.match(html, /UPCOMING SEASON/);
      assert.match(html, /Spring 2026 season info will appear here once the season begins on March 1, 2026\./);
      assert.equal(html.includes("Spring 2027"), false);
      assert.equal(html.includes("Final Standings"), false);
      assert.equal(html.includes('href="/standings"'), false);

      const withHistory = markup(
        gate(
          {
            org,
            surface: "rosters",
            asOf: SPRING_BEFORE,
            completedSeasons: PRIOR_SEASONS,
          },
          createElement("ul", null, createElement("li", null, "Roster Player One")),
        ),
      );
      assert.equal(withHistory.includes("Roster Player One"), false);
      assert.match(withHistory, /Spring 2025 Final Standings/);
      assert.match(withHistory, /href="\/standings"/);
      assert.equal(withHistory.includes("Spring 2026 Final"), false);

      const standingsHtml = markup(
        standings(
          { org, seasonName: "Spring 2026", asOf: SPRING_BEFORE },
          createElement("table", null, "Configured year row"),
        ),
      );
      assert.match(standingsHtml, />\s*Standings\s*</);
      assert.match(standingsHtml, /once the season begins on March 1, 2026\./);
      assert.match(standingsHtml, /Configured year row/);
      assert.equal(standingsHtml.includes("Final Standings"), false);
      assert.equal(standingsHtml.includes("View Schedule"), false);

      const priorStandings = markup(
        standings(
          {
            org,
            seasonName: "Spring 2026",
            asOf: SPRING_BEFORE,
            completedSeasons: PRIOR_SEASONS,
          },
          createElement("table", null, "12U finished 10-0"),
        ),
      );
      assert.match(priorStandings, /Spring 2025 Final Standings/);
      assert.match(priorStandings, /12U finished 10-0/);
      assert.equal(priorStandings.includes("Spring 2026 Final"), false);
      assert.equal(priorStandings.includes("View Schedule"), false);
    }
  });

  it("hides roster and schedule markup for Gonzales and Ascension off-season", () => {
    for (const org of ["gonzales", "ascension"] as const) {
      for (const surface of ["rosters", "schedule"] as const) {
        const html = markup(
          gate(
            {
              org,
              surface,
              asOf: SPRING_OFF,
              registrationStatus: "CLOSED",
            },
            createElement("ul", null, createElement("li", null, "Roster Player One vs Schedule Team")),
          ),
        );
        assert.equal(html.includes("Roster Player One"), false);
        assert.equal(html.includes("Schedule Team"), false);
        assert.match(html, /OFF SEASON/);
        assert.match(html, /Spring 2027 season info will appear here once the season begins\./);
        assert.equal(html.includes("on March"), false);
        assert.match(html, /Spring 2026 Final Standings/);
        assert.match(html, /Registration is currently closed\./);
        assert.match(html, /href="\/registration"/);
        assert.match(html, /href="\/standings"/);
      }
    }
  });

  it("keeps final standings content and labels it for an off-season Spring league", () => {
    const html = markup(
      standings(
        { org: "ascension", seasonName: "Spring 2026", asOf: SPRING_OFF },
        createElement("table", null, "12U finished 10-0"),
      ),
    );
    assert.match(html, /Spring 2026 Final Standings/);
    assert.match(html, /12U finished 10-0/);
    assert.equal(html.includes("View Schedule"), false);
    assert.equal(html.includes("href=\"/schedule\""), false);
  });

  it("renders Gonzales and Ascension operational pages unchanged while live", () => {
    for (const org of ["gonzales", "ascension"] as const) {
      const schedule = markup(
        gate(
          { org, surface: "schedule", asOf: SPRING_LIVE, registrationStatus: "OPEN" },
          createElement("p", null, "Saturday game remains"),
        ),
      );
      assert.match(schedule, /Saturday game remains/);
      assert.equal(schedule.includes("once the season begins"), false);
      assert.equal(schedule.includes("OFF SEASON"), false);

      const standingsHtml = markup(
        standings(
          { org, seasonName: "Spring 2026", asOf: SPRING_LIVE },
          createElement("table", null, "Current scored row"),
        ),
      );
      assert.match(standingsHtml, /League Standings/);
      assert.match(standingsHtml, /Spring 2026 · by age group with current scored results\./);
      assert.match(standingsHtml, /View Schedule/);
      assert.match(standingsHtml, /href="\/schedule"/);
      assert.match(standingsHtml, /Current scored row/);
      assert.equal(standingsHtml.includes("Final Standings"), false);
    }
  });

  it("renders Fall Ball unchanged in and out of its window", () => {
    for (const asOf of [SPRING_BEFORE, FALL_LIVE, FALL_OFF, BOTH_OFF, SPRING_LIVE]) {
      const rosters = markup(
        gate(
          { org: "fallball", surface: "rosters", asOf },
          createElement("p", null, "Fall roster stays"),
        ),
      );
      assert.match(rosters, /Fall roster stays/);
      assert.equal(rosters.includes("once the season begins"), false);

      const schedule = markup(
        gate(
          { org: "fallball", surface: "schedule", asOf },
          createElement("p", null, "Fall Saturday game stays"),
        ),
      );
      assert.match(schedule, /Fall Saturday game stays/);
      assert.equal(schedule.includes("OFF SEASON"), false);

      const standingsHtml = markup(
        standings(
          { org: "fallball", seasonName: "Fall Ball 2026", asOf },
          createElement("table", null, "Fall results row"),
        ),
      );
      assert.match(standingsHtml, /League Standings/);
      assert.match(standingsHtml, /Fall Ball 2026 · by age group with current scored results\./);
      assert.match(standingsHtml, /View Schedule/);
      assert.match(standingsHtml, /Fall results row/);
      assert.equal(standingsHtml.includes("Final Standings"), false);
    }
  });

  it("includes an open registration link on the off-season notice", () => {
    const html = markup(
      createElement(OffSeasonNotice, {
        org: "gonzales",
        asOf: SPRING_OFF,
        registrationStatus: "OPEN",
      }),
    );
    assert.match(html, /Registration is open\./);
    assert.match(html, /Register Now/);
    assert.match(html, /href="\/registration"/);
  });
});
