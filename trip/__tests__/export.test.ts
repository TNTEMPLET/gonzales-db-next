import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildTripExportCsv, directorExportFields } from "@/lib/trip/export";
import {
  DIRECTOR_SHEET_HEADERS,
  SW_REGIONAL_V1_FIELDS,
} from "@/lib/trip/swRegionalFields";
import { splitPlayerName, buildPrefillAnswers } from "@/lib/trip/validate";
import type { TripFieldDefPublic } from "@/lib/trip/types";

function mockFields(): TripFieldDefPublic[] {
  return SW_REGIONAL_V1_FIELDS.map((f) => ({
    key: f.key,
    label: f.label,
    sheetColumn: f.sheetColumn,
    fieldType: f.fieldType,
    required: f.required ?? false,
    options: f.options ?? [],
    sortOrder: f.sortOrder,
    helpText: f.helpText ?? null,
    prefillFrom: f.prefillFrom ?? null,
    adminOnly: f.adminOnly ?? false,
    section: f.section ?? "roster",
    excludeFromDirectorExport: f.excludeFromDirectorExport ?? false,
  }));
}

describe("splitPlayerName", () => {
  it("splits first and last", () => {
    assert.deepEqual(splitPlayerName("Alex Rivera"), {
      first: "Alex",
      last: "Rivera",
    });
  });
  it("keeps multi-word last names", () => {
    assert.deepEqual(splitPlayerName("Maria De La Cruz"), {
      first: "Maria",
      last: "De La Cruz",
    });
  });
});

describe("buildPrefillAnswers", () => {
  it("prefills first/last and default participant type", () => {
    const fields = mockFields();
    const pre = buildPrefillAnswers(fields, {
      playerFullName: "Jordan Lee",
      ageGroup: "10U",
      team: "All-Stars",
      jerseyNumber: "12",
    });
    assert.equal(pre.first_name, "Jordan");
    assert.equal(pre.last_name, "Lee");
    assert.equal(pre.uniform_number, "12");
    assert.equal(pre.participant_type, "Player");
  });
});

describe("buildTripExportCsv", () => {
  it("emits exact Sheet header row without health columns", () => {
    const csv = buildTripExportCsv({
      fields: mockFields(),
      rows: [
        {
          playerFullName: "Alex Rivera",
          ageGroup: null,
          team: null,
          jerseyNumber: "7",
          status: "submitted",
          submitterName: "Pat Rivera",
          submitterEmail: "pat@example.com",
          submitterPhone: null,
          submittedAt: new Date("2026-07-01T12:00:00Z"),
          answersJson: JSON.stringify({
            first_name: "Alex",
            last_name: "Rivera",
            participant_type: "Player",
            guardian1_email: "pat@example.com",
            guardian1_first_name: "Pat",
            guardian1_last_name: "Rivera",
            guardian1_phone: "555-0100",
            guardian2_email: "",
            guardian2_first_name: "",
            guardian2_last_name: "",
            uniform_number: "7",
            positions: "SS, P",
            bats: "R",
            throws: "R",
            health_allergies: "Peanuts — do not include in CSV",
            health_medications: "Secret meds",
          }),
        },
      ],
      sheetOnly: true,
    });
    const headerLine = csv.split("\n")[0]!;
    assert.equal(headerLine, DIRECTOR_SHEET_HEADERS.join(","));
    assert.equal(headerLine.includes("Allerg"), false);
    assert.equal(csv.includes("Peanuts"), false);
    assert.equal(csv.includes("Secret meds"), false);
    assert.equal(csv.includes("555-0100"), false);
    assert.match(csv, /Alex,Rivera,Player,pat@example\.com/);
    assert.match(csv, /7,"SS, P",R,R/);
  });
});

describe("directorExportFields", () => {
  it("excludes health and phone-only binder fields", () => {
    const keys = directorExportFields(mockFields()).map((f) => f.key);
    assert.ok(keys.includes("first_name"));
    assert.ok(keys.includes("throws"));
    assert.ok(!keys.includes("health_allergies"));
    assert.ok(!keys.includes("guardian1_phone"));
  });
});

describe("SW_REGIONAL_V1_FIELDS headers", () => {
  it("matches operator Sheet headers for director columns", () => {
    assert.deepEqual(DIRECTOR_SHEET_HEADERS, [
      "First Name",
      "Last Name",
      "Participant Type",
      "Responsible User/Legal Guardian Email Address",
      "Responsible User/Legal Guardian First Name",
      "Responsible User/Legal Guardian Last Name",
      "2nd Responsible User/Legal Guardian Email Address",
      "2nd Responsible User/Legal Guardian First Name",
      "2nd Responsible User/Legal Guardian Last Name",
      "Uniform Number",
      "Position(s)",
      "Bats (R/L/S)",
      "Throws (R/L)",
    ]);
  });

  it("includes five health free-text fields", () => {
    const health = SW_REGIONAL_V1_FIELDS.filter((f) => f.section === "health");
    assert.equal(health.length, 5);
    assert.ok(health.every((f) => f.excludeFromDirectorExport && f.fieldType === "textarea"));
  });
});
