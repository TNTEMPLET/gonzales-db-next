import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { applySeasonSidebarOrder, buildAdminSidebarNav, sidebarAllowsModule } from "@/lib/admin/sidebarNav";
import type { AdminRole } from "@/lib/auth/adminRoles";
import type { SeasonMode } from "@/lib/season/mode";

function leafIds(nav: ReturnType<typeof buildAdminSidebarNav>, subcategoryId: string) {
  return (
    nav.groups
      .flatMap((group) => group.subcategories)
      .find((sub) => sub.id === subcategoryId)
      ?.leaves.map((leaf) => leaf.id) ?? []
  );
}

function leafHrefs(role: AdminRole, ordersModuleEnabled: boolean, masterDeployment?: boolean) {
  const nav = buildAdminSidebarNav(
    (module) =>
      sidebarAllowsModule({
        module,
        orgId: "gonzales",
        role,
        ordersModuleEnabled,
      }),
    false,
    "?org=gonzales",
    masterDeployment,
  );
  return nav.groups.flatMap((group) =>
    group.subcategories.flatMap((sub) => sub.leaves.map((leaf) => leaf.href.split("?")[0])),
  );
}

describe("sidebar job leaves", () => {
  it("opens the dashboard from the sidebar without taking the season-home redirect", () => {
    const nav = buildAdminSidebarNav(() => true, false, "?org=gonzales", true);
    assert.equal(nav.dashboardHref, "/admin?org=gonzales&view=dashboard");
    const spring = buildAdminSidebarNav(() => true, false, "?org=spring", true);
    assert.equal(spring.dashboardHref, "/admin?org=gonzales&view=dashboard");
  });

  it("hides orders, surveys, scheduler, and Sports Connect from a park director", () => {
    const hrefs = leafHrefs("PARK_DIRECTOR", true);
    for (const path of [
      "/admin/cap-orders",
      "/admin/shirt-orders",
      "/admin/surveys",
      "/admin/scheduler",
      "/admin/sports-connect",
    ]) {
      assert.equal(hrefs.includes(path), false, path);
    }
    for (const path of [
      "/admin/scores",
      "/admin/season-setup",
      "/admin/reports/umpire-pay",
      "/admin/reports",
      "/admin/game-day",
      "/admin/game-day/remotes",
    ]) {
      assert.equal(hrefs.includes(path), true, path);
    }
  });

  it("hides orders from a board member and an admin, and keeps admin jobs with admins", () => {
    const board = leafHrefs("BOARD_MEMBER", true);
    assert.equal(board.includes("/admin/cap-orders"), false);
    assert.equal(board.includes("/admin/shirt-orders"), false);
    assert.equal(board.includes("/admin/surveys"), false);
    assert.equal(board.includes("/admin/scheduler"), false);
    assert.equal(board.includes("/admin/sports-connect"), false);
    assert.equal(board.includes("/admin/reports/umpire-pay"), true);

    const admin = leafHrefs("ADMIN", true);
    assert.equal(admin.includes("/admin/cap-orders"), false);
    assert.equal(admin.includes("/admin/shirt-orders"), false);
    for (const path of [
      "/admin/surveys",
      "/admin/scheduler",
      "/admin/sports-connect",
      "/admin/game-day",
      "/admin/game-day/remotes",
    ]) {
      assert.equal(admin.includes(path), true, path);
    }
    assert.equal(board.includes("/admin/game-day/remotes"), true);
  });

  it("hides cap and shirt leaves from a master admin when the switch is off", () => {
    const hrefs = leafHrefs("MASTER_ADMIN", false);
    assert.equal(hrefs.includes("/admin/cap-orders"), false);
    assert.equal(hrefs.includes("/admin/shirt-orders"), false);
    assert.equal(hrefs.includes("/admin/sponsors"), true);
    assert.equal(hrefs.includes("/admin/reports"), true);
  });

  it("shows division ages under season setup for admins only", () => {
    for (const role of ["MASTER_ADMIN", "ADMIN"] as const) {
      const hrefs = leafHrefs(role, true);
      assert.equal(hrefs.includes("/admin/season-setup/division-ages"), true, role);
      assert.equal(hrefs.includes("/admin/division-ages"), false, role);
    }
    for (const role of ["BOARD_MEMBER", "PARK_DIRECTOR"] as const) {
      const hrefs = leafHrefs(role, true);
      assert.equal(hrefs.includes("/admin/season-setup/division-ages"), false, role);
      assert.equal(hrefs.includes("/admin/division-ages"), false, role);
    }

    const nav = buildAdminSidebarNav(
      (module) =>
        sidebarAllowsModule({
          module,
          orgId: "gonzales",
          role: "ADMIN",
          ordersModuleEnabled: true,
        }),
      false,
      "?org=gonzales",
    );
    const competition = nav.groups
      .flatMap((group) => group.subcategories)
      .find((sub) => sub.id === "competition");
    const ids = competition?.leaves.map((leaf) => leaf.id) ?? [];
    assert.equal(ids.indexOf("division-ages"), ids.indexOf("season-setup") + 1);
  });

  it("shows Parks to a master admin only on the master deployment", () => {
    const previous = process.env.SITE_ORG;
    try {
      process.env.SITE_ORG = "gonzales";
      assert.equal(leafHrefs("MASTER_ADMIN", true).includes("/admin/parks"), false);
      process.env.SITE_ORG = "ascension";
      assert.equal(leafHrefs("MASTER_ADMIN", true).includes("/admin/parks"), false);
      process.env.SITE_ORG = "master";
      assert.equal(leafHrefs("MASTER_ADMIN", true).includes("/admin/parks"), true);
    } finally {
      if (previous === undefined) delete process.env.SITE_ORG;
      else process.env.SITE_ORG = previous;
    }

    for (const role of ["ADMIN", "BOARD_MEMBER", "PARK_DIRECTOR"] as const) {
      assert.equal(leafHrefs(role, true, true).includes("/admin/parks"), false, role);
    }
    assert.equal(leafHrefs("MASTER_ADMIN", true, false).includes("/admin/parks"), false);

    const nav = buildAdminSidebarNav(
      (module) =>
        sidebarAllowsModule({
          module,
          orgId: "gonzales",
          role: "MASTER_ADMIN",
          ordersModuleEnabled: true,
        }),
      false,
      "?org=gonzales",
      true,
    );
    const park = nav.groups
      .flatMap((group) => group.subcategories)
      .find((sub) => sub.id === "park");
    assert.equal(park?.leaves.some((leaf) => leaf.id === "parks" && leaf.label === "Parks"), true);
  });

  it("puts setup leaves first in the off season and preseason", () => {
    const today = buildAdminSidebarNav(() => true, false, "?org=gonzales", true);
    const todayCompetition = leafIds(today, "competition");
    const todayPark = leafIds(today, "park");
    assert.deepEqual(todayCompetition, [
      "season-setup",
      "division-ages",
      "teams",
      "sports-connect",
      "enrollment-kpi",
      "draft",
      "scores",
      "scheduler",
      "assignr",
      "registration",
    ]);
    assert.deepEqual(todayPark, [
      "game-day",
      "game-day-remotes",
      "brackets",
      "alerts",
      "parks",
      "facilities",
    ]);

    for (const mode of ["OFF_SEASON", "PRESEASON"] as const satisfies readonly SeasonMode[]) {
      const nav = applySeasonSidebarOrder(today, mode);
      assert.deepEqual(leafIds(nav, "competition"), [
        "season-setup",
        "division-ages",
        "registration",
        "sports-connect",
        "teams",
        "draft",
        "scores",
        "scheduler",
        "assignr",
        "enrollment-kpi",
      ]);
      assert.deepEqual(leafIds(nav, "park"), [
        "parks",
        "game-day-remotes",
        "facilities",
        "game-day",
        "brackets",
        "alerts",
      ]);
      assert.deepEqual(new Set(leafIds(nav, "competition")), new Set(todayCompetition));
      assert.deepEqual(new Set(leafIds(nav, "park")), new Set(todayPark));
    }
  });

  it("keeps today's sidebar order in season, postseason, and when mode is unknown", () => {
    const today = buildAdminSidebarNav(() => true, false, "?org=gonzales", true);
    for (const mode of ["IN_SEASON", "POSTSEASON", null, undefined] as const) {
      const nav = applySeasonSidebarOrder(today, mode);
      assert.equal(nav, today);
      assert.deepEqual(leafIds(nav, "competition"), leafIds(today, "competition"));
      assert.deepEqual(leafIds(nav, "park"), leafIds(today, "park"));
    }
  });

  it("does not change which leaves a park director can see", () => {
    const today = buildAdminSidebarNav(
      (module) =>
        sidebarAllowsModule({
          module,
          orgId: "gonzales",
          role: "PARK_DIRECTOR",
          ordersModuleEnabled: true,
        }),
      false,
      "?org=gonzales",
      true,
    );
    const off = applySeasonSidebarOrder(today, "OFF_SEASON");
    const todayHrefs = leafHrefs("PARK_DIRECTOR", true, true);
    const offHrefs = off.groups.flatMap((group) =>
      group.subcategories.flatMap((sub) => sub.leaves.map((leaf) => leaf.href.split("?")[0])),
    );
    assert.deepEqual(new Set(offHrefs), new Set(todayHrefs));
    for (const path of ["/admin/scheduler", "/admin/sports-connect", "/admin/cap-orders", "/admin/parks"]) {
      assert.equal(offHrefs.includes(path), false, path);
    }
    assert.equal(offHrefs.includes("/admin/game-day"), true);
    assert.equal(offHrefs.includes("/admin/game-day/remotes"), true);
  });

  it("shows cap and shirt leaves to a master admin only when the switch is on", () => {
    const master = leafHrefs("MASTER_ADMIN", true);
    assert.equal(master.includes("/admin/cap-orders"), true);
    assert.equal(master.includes("/admin/shirt-orders"), true);
    for (const role of ["ADMIN", "BOARD_MEMBER", "PARK_DIRECTOR"] as const) {
      const hrefs = leafHrefs(role, true);
      assert.equal(hrefs.includes("/admin/cap-orders"), false, role);
      assert.equal(hrefs.includes("/admin/shirt-orders"), false, role);
    }
  });
});
