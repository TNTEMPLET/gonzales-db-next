import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAdminSidebarNav, sidebarAllowsModule } from "@/lib/admin/sidebarNav";
import type { AdminRole } from "@/lib/auth/adminRoles";

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
    for (const path of ["/admin/surveys", "/admin/scheduler", "/admin/sports-connect", "/admin/game-day"]) {
      assert.equal(admin.includes(path), true, path);
    }
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
