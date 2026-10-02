import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAdminSidebarNav } from "@/lib/admin/sidebarNav";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";

function leafHrefs(role: AdminRole) {
  const nav = buildAdminSidebarNav(
    (module) => canAccessAdminModule(role, module),
    false,
    "?org=gonzales",
  );
  return nav.groups.flatMap((group) =>
    group.subcategories.flatMap((sub) => sub.leaves.map((leaf) => leaf.href.split("?")[0])),
  );
}

describe("sidebar job leaves", () => {
  it("hides orders, surveys, scheduler, and Sports Connect from a park director", () => {
    const hrefs = leafHrefs("PARK_DIRECTOR");
    for (const path of [
      "/admin/cap-orders",
      "/admin/shirt-orders",
      "/admin/surveys",
      "/admin/scheduler",
      "/admin/sports-connect",
    ]) {
      assert.equal(hrefs.includes(path), false, path);
    }
    for (const path of ["/admin/scores", "/admin/season-setup", "/admin/reports/umpire-pay", "/admin/reports"]) {
      assert.equal(hrefs.includes(path), true, path);
    }
  });

  it("shows orders to a board member and keeps admin-only jobs hidden", () => {
    const hrefs = leafHrefs("BOARD_MEMBER");
    assert.equal(hrefs.includes("/admin/cap-orders"), true);
    assert.equal(hrefs.includes("/admin/shirt-orders"), true);
    assert.equal(hrefs.includes("/admin/surveys"), false);
    assert.equal(hrefs.includes("/admin/scheduler"), false);
    assert.equal(hrefs.includes("/admin/sports-connect"), false);
    assert.equal(hrefs.includes("/admin/reports/umpire-pay"), true);
  });

  it("shows each admin job to an admin on its own key", () => {
    const hrefs = leafHrefs("ADMIN");
    for (const path of [
      "/admin/cap-orders",
      "/admin/shirt-orders",
      "/admin/surveys",
      "/admin/scheduler",
      "/admin/sports-connect",
    ]) {
      assert.equal(hrefs.includes(path), true, path);
    }
  });
});
