import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAccessAdminModule, type AdminModule, type AdminRole } from "@/lib/auth/adminRoles";
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

  it("keeps reports and alerts on their own gates, not orders", () => {
    const allow = (module: AdminModule) => module === "REPORTS" || module === "PARK_ALERTS";
    const cards = buildAdminDashboardCardDescriptors({
      allowModule: allow,
      orgFor: () => "gonzales",
    });
    const titles = cards.map((card) => card.title);
    assert.deepEqual(titles, ["Park & Tournament Alerts", "Reports"]);
    assert.ok(cards.every((card) => card.href.endsWith("?org=gonzales")));
    assert.ok(cards.every((card) => !isAdminHubHref(card.href)));
  });

  it("gates cap and shirt cards on ORDERS alone", () => {
    for (const title of ["Cap Orders", "Shirt Orders"]) {
      const card = ADMIN_DASHBOARD_CARD_SPECS.find((spec) => spec.title === title);
      assert.ok(card);
      assert.equal(card.module, "ORDERS");
      assert.equal(card.accessModules, undefined);
    }

    const orders = buildAdminDashboardCardDescriptors({
      allowModule: (module) => module === "ORDERS",
      orgFor: () => "gonzales",
    }).map((card) => card.title);
    assert.deepEqual(orders, ["Cap Orders", "Shirt Orders"]);

    for (const role of ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN"] as const satisfies readonly AdminRole[]) {
      const titles = buildAdminDashboardCardDescriptors({
        allowModule: (module) => canAccessAdminModule(role, module),
        orgFor: () => "gonzales",
      }).map((card) => card.title);
      assert.equal(titles.includes("Cap Orders"), false, role);
      assert.equal(titles.includes("Shirt Orders"), false, role);
    }

    const previous = process.env.ORDERS_ENABLED;
    try {
      process.env.ORDERS_ENABLED = "true";
      const masterTitles = buildAdminDashboardCardDescriptors({
        allowModule: (module) => canAccessAdminModule("MASTER_ADMIN", module),
        orgFor: () => "gonzales",
      }).map((card) => card.title);
      assert.equal(masterTitles.includes("Cap Orders"), true);
      assert.equal(masterTitles.includes("Shirt Orders"), true);

      delete process.env.ORDERS_ENABLED;
      const hiddenTitles = buildAdminDashboardCardDescriptors({
        allowModule: (module) => canAccessAdminModule("MASTER_ADMIN", module),
        orgFor: () => "gonzales",
      }).map((card) => card.title);
      assert.equal(hiddenTitles.includes("Cap Orders"), false);
      assert.equal(hiddenTitles.includes("Shirt Orders"), false);
      assert.equal(hiddenTitles.includes("Sponsors"), true);
    } finally {
      if (previous === undefined) delete process.env.ORDERS_ENABLED;
      else process.env.ORDERS_ENABLED = previous;
    }

    const sponsors = buildAdminDashboardCardDescriptors({
      allowModule: (module) => module === "SPONSORS",
      orgFor: () => "gonzales",
    }).map((card) => card.title);
    assert.deepEqual(sponsors, ["Sponsors"]);
  });

  it("shows alerts through the tournament-alerts alternate", () => {
    const titles = buildAdminDashboardCardDescriptors({
      allowModule: (module) => module === "TOURNAMENT_ALERTS",
      orgFor: () => "ascension",
    }).map((card) => card.title);
    assert.deepEqual(titles, ["Park & Tournament Alerts"]);
  });

  it("keeps division ages off the dashboard card list", () => {
    assert.equal(getAdminDashboardCategory("DIVISION_AGES"), null);
    assert.equal(
      ADMIN_DASHBOARD_CARD_SPECS.some((card) => card.module === "DIVISION_AGES"),
      false,
    );
  });

  it("lists shared parks for a master admin and hides them from lower roles", () => {
    const card = ADMIN_DASHBOARD_CARD_SPECS.find((spec) => spec.path === "/admin/parks");
    assert.ok(card);
    assert.equal(card.module, "VENUES");
    assert.equal(card.title, "Parks");
    assert.equal(isAdminHubHref("/admin/parks"), false);
    assert.equal(isAdminHubHref("/admin/park"), true);

    const master = buildAdminDashboardCardDescriptors({
      allowModule: (module) => canAccessAdminModule("MASTER_ADMIN", module, { masterDeployment: true }),
      orgFor: () => "gonzales",
    }).some((item) => item.href.startsWith("/admin/parks?"));
    assert.equal(master, true);

    for (const role of ["ADMIN", "BOARD_MEMBER", "PARK_DIRECTOR"] as const satisfies readonly AdminRole[]) {
      const titles = buildAdminDashboardCardDescriptors({
        allowModule: (module) => canAccessAdminModule(role, module, { masterDeployment: true }),
        orgFor: () => "gonzales",
      }).map((item) => item.title);
      assert.equal(titles.includes("Parks"), false, role);
    }
  });

  it("hides a card when none of its modules are allowed", () => {
    const cards = buildAdminDashboardCardDescriptors({
      allowModule: () => false,
      orgFor: () => "gonzales",
    });
    assert.deepEqual(cards, []);
  });
});
