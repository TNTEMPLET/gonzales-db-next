import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminModule } from "@/lib/auth/adminRoles";
import {
  ADMIN_DASHBOARD_CARD_SPECS,
  ADMIN_DASHBOARD_CATEGORY_META,
  ADMIN_HUB_PATHS,
  buildAdminDashboardCardDescriptors,
  getAdminDashboardCategory,
  isAdminHubHref,
} from "@/lib/admin/dashboardModules";

const HUB_COPY = /\bhubs?\b|one place/i;
const REDIRECT_ONLY_PATHS = [
  ...ADMIN_HUB_PATHS,
  "/admin/payments",
  "/admin/tournament-alerts",
];

describe("admin dashboard card specs", () => {
  it("points every card at a real page, never a hub or other redirect", () => {
    assert.ok(ADMIN_DASHBOARD_CARD_SPECS.length > 0);
    const paths = ADMIN_DASHBOARD_CARD_SPECS.map((card) => card.path);
    assert.equal(new Set(paths).size, paths.length);
    for (const card of ADMIN_DASHBOARD_CARD_SPECS) {
      assert.equal(card.path.startsWith("/admin/"), true);
      assert.equal(REDIRECT_ONLY_PATHS.includes(card.path as (typeof REDIRECT_ONLY_PATHS)[number]), false);
      assert.equal(isAdminHubHref(card.path), false);
      assert.equal(isAdminHubHref(`${card.path}?org=gonzales`), false);
      assert.notEqual(getAdminDashboardCategory(card.module), null);
      assert.doesNotMatch(card.title, HUB_COPY);
      assert.doesNotMatch(card.description, HUB_COPY);
      assert.doesNotMatch(card.action, HUB_COPY);
    }
    for (const meta of Object.values(ADMIN_DASHBOARD_CATEGORY_META)) {
      assert.doesNotMatch(meta.label, HUB_COPY);
      assert.doesNotMatch(meta.description, HUB_COPY);
    }
  });

  it("recognizes only the five legacy hub paths", () => {
    for (const path of ADMIN_HUB_PATHS) {
      assert.equal(isAdminHubHref(path), true);
      assert.equal(isAdminHubHref(`${path}?org=gonzales&tab=teams`), true);
      assert.equal(isAdminHubHref(`${path}/`), true);
    }
    assert.equal(isAdminHubHref("/admin/park-info"), false);
    assert.equal(isAdminHubHref("/admin/teams"), false);
    assert.equal(isAdminHubHref("/admin/payments"), false);
    assert.equal(isAdminHubHref("/admin/tournament-alerts"), false);
  });

  it("opens the pages the old hubs used to bundle", () => {
    const pathByTitle = Object.fromEntries(
      ADMIN_DASHBOARD_CARD_SPECS.map((card) => [card.title, card.path]),
    );
    assert.equal(pathByTitle.Directory, "/admin/users");
    assert.equal(pathByTitle["Volunteer Cards"], "/admin/volunteers");
    assert.equal(pathByTitle["Role Assignment"], "/admin/roles");
    assert.equal(pathByTitle["Teams & Rosters"], "/admin/teams");
    assert.equal(pathByTitle["Scores & Standings"], "/admin/scores");
    assert.equal(pathByTitle["Park & Tournament Alerts"], "/admin/alerts");
    assert.equal(pathByTitle.Communications, "/admin/communications");
    assert.equal(pathByTitle.Reports, "/admin/reports");
    assert.equal(pathByTitle["Tournament Brackets"], "/admin/tournament-brackets");
    assert.equal(pathByTitle["Park Info"], "/admin/park-info");
    assert.equal(pathByTitle["News Publishing"], "/admin/news");
    assert.equal(pathByTitle["Social Media"], "/admin/social");
    assert.equal(pathByTitle["Dugout Moderation"], "/admin/dugout");
    assert.equal(pathByTitle["Org Documents"], "/admin/documents");
    assert.equal(pathByTitle["Cap Orders"], "/admin/cap-orders");
    assert.equal(pathByTitle["Shirt Orders"], "/admin/shirt-orders");
    assert.equal(pathByTitle.Sponsors, "/admin/sponsors");
  });

  it("keeps the same module gate as the destination page", () => {
    const allow = (module: AdminModule) => module === "REPORTS" || module === "PARK_ALERTS";
    const cards = buildAdminDashboardCardDescriptors({
      allowModule: allow,
      orgFor: () => "gonzales",
    });
    const titles = cards.map((card) => card.title);
    assert.deepEqual(titles, [
      "Park & Tournament Alerts",
      "Cap Orders",
      "Shirt Orders",
      "Reports",
    ]);
    assert.ok(cards.every((card) => card.href.endsWith("?org=gonzales")));
    assert.ok(cards.every((card) => !isAdminHubHref(card.href)));
  });

  it("shows alerts and cap orders through their alternate modules", () => {
    const allow = (module: AdminModule) => module === "TOURNAMENT_ALERTS" || module === "SPONSORS";
    const titles = buildAdminDashboardCardDescriptors({
      allowModule: allow,
      orgFor: () => "ascension",
    }).map((card) => card.title);
    assert.deepEqual(titles, [
      "Park & Tournament Alerts",
      "Cap Orders",
      "Shirt Orders",
      "Sponsors",
    ]);
  });

  it("hides a card when none of its modules are allowed", () => {
    const cards = buildAdminDashboardCardDescriptors({
      allowModule: () => false,
      orgFor: () => "gonzales",
    });
    assert.deepEqual(cards, []);
  });
});
