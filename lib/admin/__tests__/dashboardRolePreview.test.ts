import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ADMIN_DASHBOARD_CARD_SPECS } from "@/lib/admin/dashboardModules";
import { filterDashboardCardsForRolePreview } from "@/lib/admin/dashboardRolePreview";

function previewTitles(masterMode: boolean) {
  return filterDashboardCardsForRolePreview(ADMIN_DASHBOARD_CARD_SPECS, "ADMIN", {
    masterMode,
    allStarVaultView: false,
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
  });
});
