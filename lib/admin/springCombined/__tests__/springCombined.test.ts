import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it } from "node:test";

import AdminOrgSwitcher from "@/components/admin/AdminOrgSwitcher";
import SpringRegistrationSummary from "@/components/admin/SpringRegistrationSummary";
import {
  builderCoverageIssues,
  builderLeagueTables,
  builderRowWindow,
  parseBuilderTable,
  serializeBuilderTable,
} from "@/lib/ageDivisions/divisionBuilder";
import { buildAdminSidebarNav } from "@/lib/admin/sidebarNav";
import { leagueDivisionDefaults } from "@/lib/ageDivisions/defaults";
import { CONTENT_ORGS, isContentOrgId, resolveOrg } from "@/lib/siteConfig";

import {
  canOfferSpringCombined,
  countSpringCombinedPool,
  dedupeSpringPool,
  isSpringCombinedParam,
  leagueTaggedDivisionName,
  resolveDivisionAgesView,
  resolveSeasonSetupView,
  combinedForecastRetention,
  springForecastComparison,
  springCombinedBuilderTable,
  springCombinedRequestBlock,
  springContentOrgsUnchanged,
  springParamIsNotContentOrg,
  suggestSpringCombined,
  summarizeSpringRegistrations,
  taggedDivisionRows,
  SPRING_COMBINED_PARAM,
  SPRING_COMBINED_READONLY_ERROR,
} from "../view";

const master = { isMaster: true, masterDeployment: true };
const quiet = { liveOrgs: [] as string[] };

describe("spring combined access", () => {
  it("lets a master see the option and keeps it off for everyone else", () => {
    assert.equal(canOfferSpringCombined(master), true);
    assert.equal(canOfferSpringCombined({ isMaster: false, masterDeployment: true }), false);
    assert.equal(canOfferSpringCombined({ isMaster: true, masterDeployment: false }), false);

    const shown = renderToStaticMarkup(
      createElement(AdminOrgSwitcher, {
        currentOrg: "gonzales",
        currentPath: "/admin/season-setup?org=gonzales",
        showAllSites: false,
        springCombined: { selected: false, suggested: true },
      }),
    );
    assert.match(shown, /Spring \(combined\)/);
    assert.match(shown, /data-testid="spring-combined-option"/);
    assert.match(shown, /Suggested/);
    assert.match(shown, /Gonzales DYB/);
    assert.match(shown, /Ascension LL/);
    assert.match(shown, /AP Fall Ball/);

    const hidden = renderToStaticMarkup(
      createElement(AdminOrgSwitcher, {
        currentOrg: "gonzales",
        currentPath: "/admin/season-setup?org=gonzales",
        showAllSites: false,
      }),
    );
    assert.doesNotMatch(hidden, /Spring \(combined\)/);
    assert.match(hidden, /AP Fall Ball/);
  });

  it("denies a direct spring URL to non-masters and suggests it when neither spring league is live", () => {
    assert.equal(isSpringCombinedParam("spring"), true);
    assert.equal(isSpringCombinedParam("gonzales"), false);
    assert.equal(springParamIsNotContentOrg(), true);
    assert.equal(isContentOrgId(SPRING_COMBINED_PARAM), false);

    assert.deepEqual(
      resolveSeasonSetupView({ ...master, requestedOrg: "spring", liveOrgs: ["fallball"] }),
      { mode: "combined" },
    );
    assert.deepEqual(
      resolveSeasonSetupView({ isMaster: false, masterDeployment: true, requestedOrg: "spring", liveOrgs: [] }),
      { mode: "denied" },
    );
    assert.equal(
      resolveDivisionAgesView({ isMaster: false, masterDeployment: true, requestedOrg: "spring", liveOrgs: [] }),
      "denied",
    );
    assert.equal(suggestSpringCombined({ ...master, requestedOrg: null, liveOrgs: ["fallball"] }), true);
    assert.equal(suggestSpringCombined({ ...master, requestedOrg: null, liveOrgs: ["gonzales"] }), false);
    assert.equal(suggestSpringCombined({ ...master, requestedOrg: null, ...quiet }), true);
    assert.deepEqual(
      resolveSeasonSetupView({ ...master, requestedOrg: undefined, liveOrgs: [] }),
      { mode: "single" },
    );
    assert.deepEqual(
      resolveSeasonSetupView({ ...master, requestedOrg: undefined, liveOrgs: ["ascension"] }),
      { mode: "single" },
    );
    assert.equal(
      resolveDivisionAgesView({ ...master, requestedOrg: undefined, liveOrgs: [] }),
      "combined",
    );
    assert.equal(resolveDivisionAgesView({ ...master, requestedOrg: "", liveOrgs: [] }), "combined");
    assert.equal(resolveDivisionAgesView({ ...master, requestedOrg: "gonzales", liveOrgs: [] }), "default");
    assert.equal(resolveDivisionAgesView({ ...master, requestedOrg: "ascension", liveOrgs: [] }), "default");
    assert.equal(
      resolveDivisionAgesView({ isMaster: false, masterDeployment: false, requestedOrg: undefined, liveOrgs: [] }),
      "default",
    );
    assert.equal(
      resolveDivisionAgesView({ ...master, requestedOrg: "all", liveOrgs: ["fallball"] }),
      "default",
    );
  });

  it("leaves single-org screens and Fall Ball on their own org", () => {
    assert.equal(springContentOrgsUnchanged(CONTENT_ORGS), true);
    assert.deepEqual(
      resolveSeasonSetupView({ ...master, requestedOrg: "gonzales", liveOrgs: [] }),
      { mode: "single" },
    );
    assert.deepEqual(
      resolveSeasonSetupView({ ...master, requestedOrg: "fallball", liveOrgs: ["fallball"] }),
      { mode: "single" },
    );
    assert.equal(
      resolveDivisionAgesView({ ...master, requestedOrg: "fallball", liveOrgs: ["fallball"] }),
      "default",
    );
    assert.equal(
      resolveDivisionAgesView({ isMaster: false, masterDeployment: false, requestedOrg: "fallball", liveOrgs: ["fallball"] }),
      "default",
    );
  });

  it("resolveOrg('spring') outside season-setup never yields fallball", () => {
    const onMaster = { masterDeployment: true, liveOrg: "fallball" as const, defaultOrg: "fallball" as const };
    assert.equal(resolveOrg("fallball", onMaster), "fallball");
    assert.equal(resolveOrg("ascension", onMaster), "ascension");
    assert.equal(resolveOrg("not-a-real-org", onMaster), "fallball");
    assert.equal(resolveOrg(undefined, onMaster), "fallball");
    assert.equal(resolveOrg("spring", onMaster), "gonzales");
    assert.notEqual(resolveOrg("spring", onMaster), "fallball");

    const nav = buildAdminSidebarNav(() => true, false, "?org=spring");
    const hrefs = [
      nav.dashboardHref,
      ...nav.groups.flatMap((group) => group.subcategories.flatMap((sub) => sub.leaves.map((leaf) => leaf.href))),
    ];
    assert.ok(hrefs.includes("/admin/season-setup?org=spring"));
    assert.ok(hrefs.includes("/admin/season-setup/division-ages?org=spring"));
    for (const href of hrefs) {
      assert.doesNotMatch(href, /fallball/);
      const path = href.split("?")[0] ?? href;
      if (path === "/admin/season-setup" || path.startsWith("/admin/season-setup/")) continue;
      if (path === "/admin") {
        assert.equal(href, "/admin?org=gonzales&view=dashboard");
        continue;
      }
      assert.equal(href.endsWith("?org=gonzales"), true, href);
      assert.doesNotMatch(href, /org=spring/);
    }

    const dashboard = readFileSync(new URL("../../../../app/admin/page.tsx", import.meta.url), "utf8");
    const springRedirect = dashboard.indexOf('org === "spring"');
    const liveRedirect = dashboard.indexOf("!requestedOrg && !allSitesRequested");
    assert.ok(springRedirect > 0 && springRedirect < liveRedirect);
    assert.match(dashboard.slice(springRedirect, liveRedirect), /resolveOrg\("spring"\)/);
  });
});

describe("spring combined counts", () => {
  it("counts a player in both leagues once and ignores Fall Ball", () => {
    const summary = summarizeSpringRegistrations(
      [
        { organizationId: "gonzales", sportsConnectRowKey: "same-row", ageGroup: "12U" },
        { organizationId: "ascension", sportsConnectRowKey: "same-row", ageGroup: "12U" },
        { organizationId: "gonzales", sportsConnectRowKey: "only-g", ageGroup: "10U" },
        { organizationId: "fallball", sportsConnectRowKey: "fall-row", ageGroup: "8U" },
      ],
      2026,
    );
    assert.equal(summary.totalPlayers, 2);
    assert.equal(summary.duplicatePlayers, 1);
    assert.equal(summary.byLeague.find((league) => league.organizationId === "gonzales")?.players, 1);
    assert.equal(summary.byLeague.find((league) => league.organizationId === "ascension")?.players, 0);
    assert.deepEqual(
      summary.byDivision.map((row) => `${row.displayName}:${row.players}`),
      ["10U DYB:1", "12U DYB:1"],
    );
    assert.equal(
      summary.byDivision.reduce((sum, row) => sum + row.players, 0),
      summary.totalPlayers,
    );
    assert.equal(summary.byDivision.some((row) => row.displayName === "12U LLB"), false);
    assert.equal(summary.byDivision.some((row) => row.ageGroup === "8U"), false);

    const crossed = summarizeSpringRegistrations(
      [
        { organizationId: "ascension", sportsConnectRowKey: "both-ages", ageGroup: "11U" },
        { organizationId: "gonzales", sportsConnectRowKey: "both-ages", ageGroup: "12U" },
      ],
      2026,
    );
    assert.equal(crossed.totalPlayers, 1);
    assert.equal(crossed.duplicatePlayers, 1);
    assert.deepEqual(
      crossed.byDivision.map((row) => `${row.displayName}:${row.players}`),
      ["12U DYB:1"],
    );

    const html = renderToStaticMarkup(createElement(SpringRegistrationSummary, { summary }));
    assert.match(html, /data-testid="spring-registration-summary"/);
    assert.match(html, /Counted once/);
    assert.match(html, /10U DYB/);
    assert.match(html, /12U DYB/);
    assert.doesNotMatch(html, /Fall Ball/);
    assert.doesNotMatch(html, /same-row/);
  });

  it("dedupes the forecast pool by sportsConnectRowKey and does not apply a feeder share", () => {
    const deduped = dedupeSpringPool([
      { sportsConnectRowKey: "same-row", matchKey: "a|2014-01-01", birthDate: "2014-01-01" },
      { sportsConnectRowKey: "same-row", matchKey: "a|2014-01-01", birthDate: "2014-01-01" },
      { sportsConnectRowKey: "other", matchKey: "b|2015-05-01", birthDate: "2015-05-01" },
    ]);
    assert.equal(deduped.players.length, 2);
    assert.equal(deduped.duplicateCount, 1);

    const rosterFirst = dedupeSpringPool([
      { sportsConnectRowKey: null, matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
      { sportsConnectRowKey: "row-1", matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
    ]);
    assert.equal(rosterFirst.players.length, 1);
    assert.equal(rosterFirst.duplicateCount, 1);

    const enrollmentFirst = dedupeSpringPool([
      { sportsConnectRowKey: "row-1", matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
      { sportsConnectRowKey: null, matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
    ]);
    assert.equal(enrollmentFirst.players.length, 1);
    assert.equal(enrollmentFirst.duplicateCount, 1);

    const distinctRows = dedupeSpringPool([
      { sportsConnectRowKey: "row-1", matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
      { sportsConnectRowKey: "row-2", matchKey: "sam|2014-01-01", birthDate: "2014-01-01" },
    ]);
    assert.equal(distinctRows.players.length, 2);
    assert.equal(distinctRows.duplicateCount, 0);

    const blank = dedupeSpringPool([
      { sportsConnectRowKey: null, matchKey: null, birthDate: null },
      { sportsConnectRowKey: null, matchKey: null, birthDate: null },
    ]);
    assert.equal(blank.players.length, 2);
    assert.equal(blank.duplicateCount, 0);

    const counts = countSpringCombinedPool(
      deduped.players.concat(deduped.players[0]!),
      {
        cutoff: { cutoffMonth: 4, cutoffDay: 30, yearOffset: 0 },
        divisions: [
          {
            code: "12U DYB",
            label: "12U DYB",
            minAge: 4,
            maxAge: 18,
            sortOrder: 1,
            oldestBirthdate: "2000-01-01",
            youngestBirthdate: "2020-12-31",
          },
        ],
      },
      2027,
    );
    assert.equal(counts.totalPlayers, 2);
    assert.equal(counts.duplicatePlayers, 1);
    assert.equal(counts.rows[0]?.count, 2);
  });

  it("keeps saved windows as current when the editor sends a proposed table", () => {
    const gonzales = leagueDivisionDefaults("gonzales");
    const ascension = leagueDivisionDefaults("ascension");
    const leagues = [
      { organizationId: "gonzales" as const, cutoff: gonzales.rule, divisions: gonzales.divisions },
      { organizationId: "ascension" as const, cutoff: ascension.rule, divisions: ascension.divisions },
    ];
    const unchanged = springForecastComparison(leagues, 2027, null);
    assert.deepEqual(combinedForecastRetention(undefined, 1), { applied: 1, source: "default" });
    assert.deepEqual(combinedForecastRetention(0.8, 1), { applied: 0.8, source: "override" });
    assert.equal(unchanged.current, unchanged.proposed);
    assert.ok(unchanged.current.divisions.some((division) => division.label.endsWith("DYB")));
    assert.ok(unchanged.current.divisions.some((division) => division.label.endsWith("LLB")));

    const proposed = {
      cutoff: unchanged.current.cutoff,
      divisions: unchanged.current.divisions.map((division) =>
        division.code === "gonzales:7U MINOR" ? { ...division, oldestBirthdate: "2019-06-01" } : division,
      ),
    };
    const sides = springForecastComparison(leagues, 2027, proposed);
    assert.notEqual(sides.current.divisions.find((division) => division.code === "gonzales:7U MINOR")?.oldestBirthdate, "2019-06-01");
    assert.equal(sides.proposed.divisions.find((division) => division.code === "gonzales:7U MINOR")?.oldestBirthdate, "2019-06-01");
    assert.equal(
      sides.current.divisions.find((division) => division.code === "ascension:7-8U MAJOR")?.label.endsWith("LLB"),
      true,
    );
  });

  it("tags saved names for display and leaves the saved label alone", () => {
    assert.equal(leagueTaggedDivisionName("12U", "gonzales"), "12U DYB");
    assert.equal(leagueTaggedDivisionName("12U", "ascension"), "12U LLB");
    assert.equal(leagueTaggedDivisionName("12U DYB", "gonzales"), "12U DYB");
    assert.equal(leagueTaggedDivisionName("12U LLB", "ascension"), "12U LLB");
    const saved = { code: "12U", label: "12U", minAge: 12, maxAge: 12, sortOrder: 1 };
    const before = { ...saved };
    const rows = taggedDivisionRows(
      [{ organizationId: "ascension", cutoff: { cutoffMonth: 8, cutoffDay: 31, yearOffset: 0 }, divisions: [saved] }],
      2027,
    );
    assert.equal(rows[0]?.displayName, "12U LLB");
    assert.equal(rows[0]?.savedName, "12U");
    assert.deepEqual(saved, before);
  });
});

describe("spring combined template", () => {
  it("fills the owner's rows and counts tee-ball in the Little League pool", () => {
    const table = springCombinedBuilderTable(2027);
    assert.equal(table.organizationId, "spring");
    assert.equal(isContentOrgId(table.organizationId), false);
    const parsed = parseBuilderTable(serializeBuilderTable(table));
    assert.equal(parsed.ok, true);

    const byName = new Map(table.rows.map((row) => [row.name, row]));
    const tee = byName.get("Tee-ball LLB");
    assert.equal(tee?.charter, "ll");
    assert.equal(tee?.cutoff, "dyb");
    const seven = byName.get("7U Minors LLB");
    const eight = byName.get("8U Minors LLB");
    assert.equal(seven?.charter, "ll");
    assert.equal(eight?.charter, "ll");
    assert.equal(seven?.cutoff, "custom");
    assert.equal(eight?.cutoff, "custom");
    assert.equal(seven?.customMonth, 4);
    assert.equal(seven?.customDay, 30);
    assert.equal(eight?.customMonth, 8);
    assert.equal(eight?.customDay, 31);
    assert.ok(seven && eight);
    const sevenWindow = builderRowWindow(seven, 2027);
    const eightWindow = builderRowWindow(eight, 2027);
    assert.equal(eightWindow.oldest, "2018-05-01");
    assert.equal(eightWindow.youngest, "2019-08-31");
    assert.equal(sevenWindow.oldest, "2019-09-01");
    assert.equal(sevenWindow.youngest, "2020-04-30");
    const pair = { ...table, rows: [seven, eight] };
    assert.deepEqual(
      builderCoverageIssues(pair).filter((issue) => issue.kind === "gap" || issue.kind === "overlap"),
      [],
    );
    assert.equal(byName.get("7/8 Majors LLB")?.charter, "ll");
    assert.equal(byName.get("7/8 Majors LLB")?.cutoff, "little-league");
    for (const age of [9, 10, 11, 12]) {
      assert.equal(byName.get(`${age}U LLB`)?.charter, "ll");
      assert.equal(byName.get(`${age}U DYB`)?.charter, "dyb");
    }
    assert.equal(byName.get("13/14U DYB")?.charter, "dyb");
    assert.equal(byName.get("15-17U DYB")?.charter, "dyb");
    assert.equal([...byName.keys()].some((name) => /LLB/.test(name) && /1[47]/.test(name)), false);
    assert.equal(table.rows.some((row) => row.charter === "teeball"), false);

    const pools = builderLeagueTables(table);
    const little = pools.find((pool) => pool.id === "ll");
    const diamond = pools.find((pool) => pool.id === "dyb");
    assert.ok(little?.table.rows.some((row) => row.id === "tee-llb"));
    assert.equal(diamond?.table.rows.some((row) => row.id === "tee-llb"), false);
    assert.equal(pools.some((pool) => pool.id === "teeball"), false);
  });
});

describe("spring combined stays read-only", () => {
  it("blocks spring on write routes and does not call them from the combined screens", () => {
    assert.deepEqual(springCombinedRequestBlock("spring"), {
      status: 403,
      error: SPRING_COMBINED_READONLY_ERROR,
    });
    assert.equal(springCombinedRequestBlock("gonzales"), null);
    assert.equal(springCombinedRequestBlock("fallball"), null);

    const checklist = readFileSync(
      new URL("../../../../components/admin/AdminSeasonSetupChecklist.tsx", import.meta.url),
      "utf8",
    );
    const saveFee = checklist.slice(checklist.indexOf("const saveFee"), checklist.indexOf("const toggleManual"));
    const toggle = checklist.slice(checklist.indexOf("const toggleManual"), checklist.indexOf("const completeCount"));
    assert.ok(saveFee.indexOf("if (readOnly) return") >= 0);
    assert.ok(saveFee.indexOf("if (readOnly) return") < saveFee.indexOf('method: "PATCH"'));
    assert.ok(toggle.indexOf("if (readOnly) return") >= 0);
    assert.ok(toggle.indexOf("if (readOnly) return") < toggle.indexOf('method: "POST"'));

    const divisions = readFileSync(
      new URL("../../../../components/admin/SpringCombinedDivisions.tsx", import.meta.url),
      "utf8",
    );
    assert.match(divisions, /SPRING_LEAGUE_ORGS/);
    assert.match(divisions, /SPRING_COMBINED_SAVE_HINT/);
    assert.doesNotMatch(divisions, /method:\s*"PUT"|method:\s*"POST"|method:\s*"PATCH"/);
    assert.doesNotMatch(divisions, /fallball/);

    const forecast = readFileSync(
      new URL("../../../../components/admin/DivisionAgesForecast.tsx", import.meta.url),
      "utf8",
    );
    assert.match(forecast, /forecast\?org=spring/);
    assert.match(forecast, /springCombined \? false/);
    assert.match(forecast, /SPRING_COMBINED_SAVE_HINT/);
    assert.match(forecast, /data-testid="spring-what-if"/);
    const combinedCutoff = forecast.slice(forecast.indexOf("onCutoff={(patch)"), forecast.indexOf("onReplace={(next)"));
    assert.match(combinedCutoff, /if \(springCombined \|\| !proposed\) return;/);
    assert.ok(combinedCutoff.indexOf("springCombined") < combinedCutoff.indexOf("withProposedCutoff"));
    const timeline = readFileSync(
      new URL("../../../../components/admin/DivisionAgesForecastTimeline.tsx", import.meta.url),
      "utf8",
    );
    assert.match(timeline, /combinedPresets \? null : \([\s\S]*data-testid="cutoff-preset-custom"/);
    assert.match(timeline, /combinedPresets \? null : \([\s\S]*data-testid="proposed-cutoff-day"/);
    assert.doesNotMatch(forecast, /method:\s*"PUT"|method:\s*"PATCH"/);
    assert.doesNotMatch(forecast, /fallball/);

    const seasonRoute = readFileSync(
      new URL("../../../../app/api/admin/season-setup/route.ts", import.meta.url),
      "utf8",
    );
    assert.ok(seasonRoute.indexOf("const springBlock") < seasonRoute.indexOf("resolveAdminTargetOrg("));
    const settings = readFileSync(
      new URL("../../../../app/api/admin/season-setup/settings/route.ts", import.meta.url),
      "utf8",
    );
    assert.match(settings, /springBlock/);
    const guard = readFileSync(
      new URL("../../../../app/api/admin/division-ages/guard.ts", import.meta.url),
      "utf8",
    );
    assert.ok(guard.indexOf("springCombinedRequestBlock") < guard.indexOf("resolveAdminTargetOrg("));

    const forecastRoute = readFileSync(
      new URL("../../../../app/api/admin/division-ages/forecast/route.ts", import.meta.url),
      "utf8",
    );
    assert.ok(forecastRoute.indexOf("isSpringCombinedParam") < forecastRoute.indexOf("resolveAdminTargetOrg("));
    assert.match(forecastRoute, /auth\.admin\.isMaster/);
    assert.match(forecastRoute, /runSpringCombinedForecast/);
    assert.match(forecastRoute, /runDivisionForecast/);
  });

  it("keeps the single-org season setup checklist editable and the combined one read-only", () => {
    const page = readFileSync(new URL("../../../../app/admin/season-setup/page.tsx", import.meta.url), "utf8");
    const combinedAt = page.indexOf('view.mode === "combined"');
    const singleAt = page.indexOf("const currentOrg = resolveAdminTargetOrg");
    assert.ok(combinedAt > 0 && singleAt > combinedAt);
    const combined = page.slice(combinedAt, singleAt);
    const single = page.slice(singleAt);
    assert.match(combined, /readOnly/);
    assert.match(combined, /Edit in Gonzales/);
    assert.match(combined, /Edit in Ascension/);
    assert.doesNotMatch(combined, /FallBallUmpirePayScheduleEditor/);
    assert.match(single, /<AdminSeasonSetupChecklist targetOrg=\{currentOrg\} \/>/);
    assert.match(single, /FallBallUmpirePayScheduleEditor/);
    assert.doesNotMatch(single, /readOnly/);

    const ages = readFileSync(
      new URL("../../../../app/admin/season-setup/division-ages/page.tsx", import.meta.url),
      "utf8",
    );
    assert.match(ages, /CONTENT_ORGS/);
    assert.match(ages, /DivisionAgesWorkspace/);
    assert.doesNotMatch(ages, /divisionAgesAllOrgs/);
    assert.doesNotMatch(ages, /redirect\("\/admin\/season-setup\/division-ages\?org=spring"\)/);
    assert.match(ages, /showSpringTemplate=\{combined\}/);
    assert.match(ages, /springCombined/);
    assert.doesNotMatch(ages, /SpringCombinedForecast/);
    assert.match(ages, /isContentOrgId/);
    assert.doesNotMatch(ages, /prisma|Enrollment|TeamPlayer/);

    const setup = readFileSync(new URL("../../../../app/admin/season-setup/page.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(setup, /redirect\("\/admin\/season-setup\?org=spring"\)/);

    const forecastData = readFileSync(
      new URL("../../../ageDivisions/forecastData.ts", import.meta.url),
      "utf8",
    );
    const combinedForecast = forecastData.slice(
      forecastData.indexOf("export async function runSpringCombinedForecast"),
      forecastData.indexOf("export async function forecastReaders"),
    );
    assert.match(combinedForecast, /includeFeeder:\s*false/);
    assert.match(combinedForecast, /dedupeSpringPool/);
    assert.match(combinedForecast, /springForecastComparison/);
    assert.match(combinedForecast, /combinedForecastRetention/);
    assert.match(combinedForecast, /retentionRate: retention\.applied/);
    assert.match(combinedForecast, /sides\.current,\s*sides\.proposed/);
    assert.doesNotMatch(combinedForecast, /compareConfigs\(buckets,\s*config,\s*config/);
    assert.match(combinedForecast, /SPRING_LEAGUE_ORGS/);
    assert.doesNotMatch(combinedForecast, /"fallball"|loadFallLines/);
    assert.doesNotMatch(forecastData, /\.(create|update|delete|upsert|createMany|updateMany|deleteMany)\s*\(/);
  });
});
