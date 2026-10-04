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
  suppressPublicLiveScoreboard,
  type PublicSeasonSurface,
} from "@/lib/publicSeason/offSeason";

function utcNoonOn(isoDate: string): Date {
  return new Date(`${isoDate}T17:00:00.000Z`);
}

const SPRING_OFF = utcNoonOn("2026-09-02");
const SPRING_LIVE = utcNoonOn("2026-04-15");
const FALL_LIVE = utcNoonOn("2026-09-02");
const FALL_OFF = utcNoonOn("2026-12-15");
const BOTH_OFF = utcNoonOn("2026-07-15");

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
    it(`${org} hides rosters and schedule and keeps final standings when not live`, () => {
      assert.equal(isSpringPublicOffSeason(org, SPRING_OFF), true);
      assert.equal(publicSurfaceVisibility(org, "rosters", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "schedule", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "upcomingGames", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "scoreboard", SPRING_OFF), "hidden");
      assert.equal(publicSurfaceVisibility(org, "standings", SPRING_OFF), "final");
      assert.equal(finalStandingsLabel(org), "Spring 2026 Final Standings");
      assert.equal(
        offSeasonSeasonInfoMessage(org),
        "Spring 2027 season info will appear here once the season begins.",
      );

      const nav = applySpringOffSeasonNav(NAV, org, SPRING_OFF);
      assert.deepEqual(
        nav.map((link) => link.href),
        ["/standings", "/tournaments", "/news"],
      );
      assert.equal(nav.some((link) => link.href === "/schedule"), false);
    });

    it(`${org} in season leaves every public surface unchanged`, () => {
      assert.equal(isSpringPublicOffSeason(org, SPRING_LIVE), false);
      for (const surface of SURFACES) {
        assert.equal(publicSurfaceVisibility(org, surface, SPRING_LIVE), "live");
      }
      assert.equal(applySpringOffSeasonNav(NAV, org, SPRING_LIVE), NAV);
    });
  }

  for (const [label, asOf] of [
    ["live September", FALL_LIVE],
    ["after the window in December", FALL_OFF],
    ["before the window in July", BOTH_OFF],
    ["during Spring in April", SPRING_LIVE],
  ] as const) {
    it(`fallball is unchanged while ${label}`, () => {
      assert.equal(isSpringPublicOffSeason("fallball", asOf), false);
      for (const surface of SURFACES) {
        assert.equal(publicSurfaceVisibility("fallball", surface, asOf), "live");
      }
      assert.equal(applySpringOffSeasonNav(NAV, "fallball", asOf), NAV);
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
        assert.match(html, /Spring 2027 season info will appear here once the season begins\./);
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
    for (const asOf of [FALL_LIVE, FALL_OFF, BOTH_OFF]) {
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
        registrationStatus: "OPEN",
      }),
    );
    assert.match(html, /Registration is open\./);
    assert.match(html, /Register Now/);
    assert.match(html, /href="\/registration"/);
  });
});
