import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_DASHBOARD_CARD_SPECS } from "@/lib/admin/dashboardModules";
import { filterDashboardCardsForRolePreview } from "@/lib/admin/dashboardRolePreview";

function previewTitles(masterMode: boolean) {
  return filterDashboardCardsForRolePreview(ADMIN_DASHBOARD_CARD_SPECS, "ADMIN", {
    masterMode,
    allStarVaultView: false,
    ordersModuleEnabled: false,
  }).map((card) => card.title);
}

describe("dashboard role preview on the master site", () => {
  it("shows a master-only card to an admin preview only when masterMode is on", () => {
    const onMaster = previewTitles(true);
    const onOrgSite = previewTitles(false);

    assert.equal(onMaster.includes("Sponsors"), true);
    assert.equal(onMaster.includes("Park Info"), true);
    assert.equal(onOrgSite.includes("Sponsors"), false);
    assert.equal(onOrgSite.includes("Park Info"), false);
    assert.equal(onMaster.includes("Cap Orders"), false);
    assert.equal(onMaster.includes("Shirt Orders"), false);
  });

  it("shows cap and shirt orders to a master preview only when the switch is on", () => {
    const titles = (ordersModuleEnabled: boolean) =>
      filterDashboardCardsForRolePreview(ADMIN_DASHBOARD_CARD_SPECS, "MASTER_ADMIN", {
        masterMode: true,
        allStarVaultView: false,
        ordersModuleEnabled,
      }).map((card) => card.title);

    const on = titles(true);
    assert.equal(on.includes("Cap Orders"), true);
    assert.equal(on.includes("Shirt Orders"), true);

    const off = titles(false);
    assert.equal(off.includes("Cap Orders"), false);
    assert.equal(off.includes("Shirt Orders"), false);
    assert.equal(off.includes("Sponsors"), true);
    assert.equal(off.includes("Reports"), true);
  });

  it("does not preview a division ages dashboard card", () => {
    const titles = filterDashboardCardsForRolePreview(ADMIN_DASHBOARD_CARD_SPECS, "MASTER_ADMIN", {
      masterMode: true,
      allStarVaultView: true,
      ordersModuleEnabled: true,
    }).map((card) => card.title);

    assert.equal(titles.includes("Division ages"), false);
    assert.equal(
      ADMIN_DASHBOARD_CARD_SPECS.some((card) => card.module === "DIVISION_AGES"),
      false,
    );
  });
});
