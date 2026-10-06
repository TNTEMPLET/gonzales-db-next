import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  scrubSportsConnectRow,
  shiftBirthDateText,
  sportsConnectExportColumnKind,
} from "@/lib/staging/scrubSportsConnectExport";

const ALLERGY =
  "Are there any physical / medical conditions or allergies that the staff need to be aware of?";

describe("scrubSportsConnectExport", () => {
  it("replaces names, emails, phones, and streets, blanks medical columns, and keeps league fields", () => {
    const scrubbed = scrubSportsConnectRow({
      "Program Name": "2026 Gonzales DYB Spring Season",
      "Division Name": "Tee Ball",
      "Order No": "1001",
      "Order Payment Status": "Completed",
      "OrderItem Amount": "125.00",
      "Player Gender": "F",
      City: "Sample City",
      "Postal Code": "70000",
      State: "LA",
      "Player First Name": "Sample",
      "Player Last Name": "Player",
      "Account First Name": "Guardian",
      "Account Last Name": "Sample",
      "User Email": "guardian@example.com",
      "Cell Phone": "2255550199",
      "Street Address": "10 Oak Street",
      Unit: "B",
      "Birth Date": "2015-06-15",
      "Insurance Company": "Sample Mutual",
      "Policy Number": "POL-1",
      "Physician Name": "Sample Physician",
      "Physician Phone": "2255550101",
      [ALLERGY]: "peanut allergy note",
    });

    assert.equal(scrubbed["Program Name"], "2026 Gonzales DYB Spring Season");
    assert.equal(scrubbed["Division Name"], "Tee Ball");
    assert.equal(scrubbed["Order No"], "1001");
    assert.equal(scrubbed["Order Payment Status"], "Completed");
    assert.equal(scrubbed["OrderItem Amount"], "125.00");
    assert.equal(scrubbed["Player Gender"], "F");
    assert.equal(scrubbed.City, "Sample City");
    assert.equal(scrubbed["Postal Code"], "70000");
    assert.equal(scrubbed.State, "LA");
    assert.match(String(scrubbed["Player First Name"]), /^s[0-9a-f]{32}$/);
    assert.match(String(scrubbed["Account Last Name"]), /^s[0-9a-f]{32}$/);
    assert.match(String(scrubbed["User Email"]), /^staging\+[0-9a-f]{16}@example\.invalid$/);
    assert.equal(scrubbed["Cell Phone"], "+15550000000");
    assert.equal(scrubbed["Street Address"], "100 Staging Street");
    assert.equal(scrubbed.Unit, "");
    assert.equal(scrubbed["Birth Date"], shiftBirthDateText("2015-06-15"));
    assert.match(String(scrubbed["Birth Date"]), /^2015-06-\d{2}$/);
    assert.equal(scrubbed["Insurance Company"], "");
    assert.equal(scrubbed["Policy Number"], "");
    assert.equal(scrubbed["Physician Name"], "");
    assert.equal(scrubbed["Physician Phone"], "");
    assert.equal(scrubbed[ALLERGY], "");
    assert.equal(JSON.stringify(scrubbed).includes("guardian@example.com"), false);
    assert.equal(JSON.stringify(scrubbed).includes("10 Oak Street"), false);
    assert.equal(JSON.stringify(scrubbed).includes("peanut allergy note"), false);
  });

  it("shifts a birth day once and keeps a second pass still", () => {
    const once = shiftBirthDateText("6/15/2015");
    assert.match(once, /^2015-06-\d{2}$/);
    assert.equal(shiftBirthDateText(once), once);
    const scrubbed = scrubSportsConnectRow({ "Birth Date": once });
    assert.equal(scrubbed["Birth Date"], once);
  });

  it("classifies export columns the way the staging scrub does", () => {
    assert.equal(sportsConnectExportColumnKind("Program Name"), "keep");
    assert.equal(sportsConnectExportColumnKind("Division Name"), "keep");
    assert.equal(sportsConnectExportColumnKind("City"), "keep");
    assert.equal(sportsConnectExportColumnKind("Zip"), "keep");
    assert.equal(sportsConnectExportColumnKind("Player First Name"), "name");
    assert.equal(sportsConnectExportColumnKind("User Email"), "email");
    assert.equal(sportsConnectExportColumnKind("Cell Phone"), "phone");
    assert.equal(sportsConnectExportColumnKind("Street Address"), "street");
    assert.equal(sportsConnectExportColumnKind("Birth Date"), "birth");
    assert.equal(sportsConnectExportColumnKind("Insurance Company"), "blank");
    assert.equal(sportsConnectExportColumnKind("Physician Phone"), "blank");
    assert.equal(sportsConnectExportColumnKind(ALLERGY), "blank");
    assert.equal(sportsConnectExportColumnKind("Player Physical Conditions"), "blank");
    assert.equal(sportsConnectExportColumnKind("Tetanus Shot"), "blank");
    assert.equal(sportsConnectExportColumnKind("Tetanus Shot Date"), "blank");
    assert.equal(sportsConnectExportColumnKind("Immunization Record"), "blank");
    assert.equal(sportsConnectExportColumnKind("Vaccination"), "blank");
    assert.equal(sportsConnectExportColumnKind("Division Name"), "keep");
    assert.equal(sportsConnectExportColumnKind("Birth Date"), "birth");
    assert.equal(sportsConnectExportColumnKind("Player Gender"), "keep");
    assert.equal(sportsConnectExportColumnKind("School"), "keep");
    assert.equal(sportsConnectExportColumnKind("Grade"), "keep");
  });

  it("blanks physical conditions and tetanus columns and keeps league fields", () => {
    const scrubbed = scrubSportsConnectRow({
      "Division Name": "Tee Ball",
      "Birth Date": "2015-06-15",
      "Player Gender": "F",
      School: "Sample School",
      Grade: "1",
      "Player Physical Conditions": "asthma note",
      "Tetanus Shot": "yes",
      "Tetanus Shot Date": "2024-04-01",
      "Immunization Record": "sample record",
    });
    assert.equal(scrubbed["Division Name"], "Tee Ball");
    assert.equal(scrubbed["Player Gender"], "F");
    assert.equal(scrubbed.School, "Sample School");
    assert.equal(scrubbed.Grade, "1");
    assert.equal(scrubbed["Birth Date"], shiftBirthDateText("2015-06-15"));
    assert.equal(scrubbed["Player Physical Conditions"], "");
    assert.equal(scrubbed["Tetanus Shot"], "");
    assert.equal(scrubbed["Tetanus Shot Date"], "");
    assert.equal(scrubbed["Immunization Record"], "");
    assert.equal(JSON.stringify(scrubbed).includes("asthma note"), false);
    assert.equal(JSON.stringify(scrubbed).includes("2024-04-01"), false);
  });

  it("covers the same medical headers in scripts/staging/scrub.sql", () => {
    const sql = readFileSync(new URL("../../../scripts/staging/scrub.sql", import.meta.url), "utf8");
    const medical = sql.slice(sql.indexOf("staging_json_key_kind"), sql.indexOf("staging_scrub_scalar"));
    for (const token of ["physical condition", "tetanus", "immuni[sz]", "vaccin", "shot date", "condition"]) {
      assert.match(medical, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const survey = sql.slice(sql.indexOf('UPDATE "SurveyAnswer"'));
    for (const token of ["physical condition", "tetanus", "immuni[sz]", "vaccin", "shot date"]) {
      assert.match(survey, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(sql, /kind = 'medical'/);
    assert.match(sql, /RETURN 'redacted'/);
  });
});
