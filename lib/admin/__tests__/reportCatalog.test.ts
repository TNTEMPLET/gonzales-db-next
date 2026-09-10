import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AdminModule } from "@/lib/auth/adminRoles";
import { ADMIN_REPORT_CATALOG, canSeeReportsHub, reportHref, reportsForRole } from "../reportCatalog";
import { parseReportContentOrg } from "../reportOrg";
import { reportFilenameStem } from "../reportPdf";

describe("reportCatalog", () => {
  it("shows umpire pay to REPORTS and hides jersey without TEAMS", () => {
    const allow = (module: AdminModule) => module === "REPORTS";
    const cards = reportsForRole(allow);
    assert.deepEqual(
      cards.map((card) => card.id),
      ["umpire-pay", "tournament-income"],
    );
    assert.equal(canSeeReportsHub(allow), true);
  });

  it("shows parish field prep when TEAMS is allowed", () => {
    const allow = (module: AdminModule) => module === "TEAMS";
    assert.equal(
      reportsForRole(allow)[0]?.id,
      "parish-field-prep",
    );
  });

  it("shows parish enrollment when ENROLLMENT_KPI is allowed", () => {
    const allow = (module: AdminModule) => module === "ENROLLMENT_KPI";
    assert.equal(reportsForRole(allow)[0]?.id, "parish-enrollment");
  });

  it("hides the hub when no report modules are allowed", () => {
    assert.equal(canSeeReportsHub(() => false), false);
  });

  it("keeps money reports split by organization", () => {
    assert.deepEqual(
      ADMIN_REPORT_CATALOG.filter((card) => card.splitByOrg).map((card) => card.id),
      ["parish-enrollment", "umpire-pay", "enrollment"],
    );
  });

  it("parses only Gonzales, Ascension, or Fall Ball for money reports", () => {
    assert.equal(parseReportContentOrg("fallball"), "fallball");
    assert.equal(parseReportContentOrg("all"), null);
    assert.equal(parseReportContentOrg("master"), null);
  });

  it("puts the organization in financial filenames", () => {
    assert.equal(
      reportFilenameStem(["AP Fall Ball", "Fall Ball 2026", "parish-enrollment"]),
      "AP-Fall-Ball-Fall-Ball-2026-parish-enrollment",
    );
  });

  it("appends org and hash to report links", () => {
    assert.equal(
      reportHref(
        {
          id: "jersey",
          title: "Jersey Report",
          description: "",
          href: "/admin/teams",
          hash: "jersey-report",
          module: "TEAMS",
          action: "Open",
        },
        "fallball",
      ),
      "/admin/teams?org=fallball#jersey-report",
    );
  });
});
