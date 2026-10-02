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

  it("hides orders from a board member and an admin, and keeps admin jobs with admins", () => {
    const board = leafHrefs("BOARD_MEMBER");
    assert.equal(board.includes("/admin/cap-orders"), false);
    assert.equal(board.includes("/admin/shirt-orders"), false);
    assert.equal(board.includes("/admin/surveys"), false);
    assert.equal(board.includes("/admin/scheduler"), false);
    assert.equal(board.includes("/admin/sports-connect"), false);
    assert.equal(board.includes("/admin/reports/umpire-pay"), true);

    const admin = leafHrefs("ADMIN");
    assert.equal(admin.includes("/admin/cap-orders"), false);
    assert.equal(admin.includes("/admin/shirt-orders"), false);
    for (const path of ["/admin/surveys", "/admin/scheduler", "/admin/sports-connect"]) {
      assert.equal(admin.includes(path), true, path);
    }
  });

  it("shows cap and shirt orders to a master admin", () => {
    const hrefs = leafHrefs("MASTER_ADMIN");
    assert.equal(hrefs.includes("/admin/cap-orders"), true);
    assert.equal(hrefs.includes("/admin/shirt-orders"), true);
  });
});
