import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAdminSidebarNav } from "@/lib/admin/sidebarNav";
import { buildAdminDashboardCardDescriptors } from "@/lib/admin/dashboardModules";
import { canAccessAdminModule, type AdminRole } from "@/lib/auth/adminRoles";
import {
  ORDERS_UNAVAILABLE_MESSAGE,
  isOrdersModuleEnabled,
  legacyOrdersDestination,
  ordersAdminApiDenial,
} from "@/lib/auth/ordersModule";

const ROLES: AdminRole[] = ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN", "MASTER_ADMIN"];

function env(value: string | undefined): { ORDERS_ENABLED?: string } {
  if (value === undefined) return {};
  return { ORDERS_ENABLED: value };
}

describe("orders module flag", () => {
  it("defaults off and accepts the documented on and off values", () => {
    assert.equal(isOrdersModuleEnabled({}), false);
    assert.equal(isOrdersModuleEnabled(env(undefined)), false);
    for (const on of ["true", "TRUE", "1", "yes", "on"]) {
      assert.equal(isOrdersModuleEnabled(env(on)), true, on);
    }
    for (const off of ["false", "0", "no", "off", ""]) {
      assert.equal(isOrdersModuleEnabled(env(off)), false, off);
    }
    assert.equal(isOrdersModuleEnabled(env("maybe")), false);
  });

  it("denies ORDERS for every role while the flag is off, including master", () => {
    const previous = process.env.ORDERS_ENABLED;
    delete process.env.ORDERS_ENABLED;
    try {
      for (const role of ROLES) {
        assert.equal(canAccessAdminModule(role, "ORDERS"), false, role);
      }
      assert.equal(canAccessAdminModule("MASTER_ADMIN", "DASHBOARD"), true);
      assert.equal(canAccessAdminModule("ADMIN", "SURVEYS"), true);
    } finally {
      if (previous === undefined) delete process.env.ORDERS_ENABLED;
      else process.env.ORDERS_ENABLED = previous;
    }
  });

  it("matches TNT-85 when the flag is on: master only", () => {
    const on = env("true");
    const previous = process.env.ORDERS_ENABLED;
    process.env.ORDERS_ENABLED = "true";
    try {
      assert.equal(canAccessAdminModule("MASTER_ADMIN", "ORDERS"), true);
      for (const role of ["PARK_DIRECTOR", "BOARD_MEMBER", "ADMIN"] as const) {
        assert.equal(canAccessAdminModule(role, "ORDERS"), false, role);
      }
    } finally {
      if (previous === undefined) delete process.env.ORDERS_ENABLED;
      else process.env.ORDERS_ENABLED = previous;
    }
    assert.equal(ordersAdminApiDenial(on), null);
  });

  it("returns a clean 403 for admin order APIs while the flag is off", () => {
    assert.deepEqual(ordersAdminApiDenial({}), {
      status: 403,
      message: ORDERS_UNAVAILABLE_MESSAGE,
    });
    assert.equal(ordersAdminApiDenial(env("true")), null);
  });

  it("sends legacy cap and shirt tabs to the unavailable page and keeps sponsors and reports", () => {
    const off = {};
    assert.deepEqual(legacyOrdersDestination(undefined, off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("caps", off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("shirts", off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("cap-orders", off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("shirt-orders", off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("unknown", off), { kind: "unavailable" });
    assert.deepEqual(legacyOrdersDestination("sponsors", off), {
      kind: "redirect",
      path: "/admin/sponsors",
    });
    assert.deepEqual(legacyOrdersDestination("reports", off), {
      kind: "redirect",
      path: "/admin/reports",
    });

    const on = env("true");
    assert.deepEqual(legacyOrdersDestination("caps", on), {
      kind: "redirect",
      path: "/admin/cap-orders",
    });
    assert.deepEqual(legacyOrdersDestination("shirt-orders", on), {
      kind: "redirect",
      path: "/admin/shirt-orders",
    });
    assert.deepEqual(legacyOrdersDestination("sponsors", on), {
      kind: "redirect",
      path: "/admin/sponsors",
    });
  });

  it("drops cap and shirt cards and sidebar leaves for a master when the flag is off", () => {
    const previous = process.env.ORDERS_ENABLED;
    delete process.env.ORDERS_ENABLED;
    try {
      const cards = buildAdminDashboardCardDescriptors({
        allowModule: (module) => canAccessAdminModule("MASTER_ADMIN", module),
        orgFor: () => "gonzales",
      }).map((card) => card.href.split("?")[0]);
      assert.equal(cards.includes("/admin/cap-orders"), false);
      assert.equal(cards.includes("/admin/shirt-orders"), false);

      const nav = buildAdminSidebarNav(
        (module) => canAccessAdminModule("MASTER_ADMIN", module),
        false,
        "?org=gonzales",
      );
      const hrefs = nav.groups.flatMap((group) =>
        group.subcategories.flatMap((sub) => sub.leaves.map((leaf) => leaf.href.split("?")[0])),
      );
      assert.equal(hrefs.includes("/admin/cap-orders"), false);
      assert.equal(hrefs.includes("/admin/shirt-orders"), false);
    } finally {
      if (previous === undefined) delete process.env.ORDERS_ENABLED;
      else process.env.ORDERS_ENABLED = previous;
    }
  });
});
