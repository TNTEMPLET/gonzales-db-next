import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";

import {
  isAllowedSportsConnectExportName,
  parseSportsConnectExportBuffer,
} from "../parseExportBuffer";
import { detectSportsConnectReport } from "../columnProfiles";

describe("parseSportsConnectExportBuffer", () => {
  it("parses CSV-like workbook headers and sample rows", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Division Name",
        "Team Name",
        "Player Full Name",
        "User Email",
      ],
      ["9U", "Yankees", "Sample Player", ""],
      ["9U", "Yankees", "Other", "a@example.com"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const parsed = parseSportsConnectExportBuffer({
      buffer,
      fileName: "players.xlsx",
    });
    assert.equal(parsed.fileName, "players.xlsx");
    assert.ok(parsed.headers.includes("Player Full Name"));
    assert.equal(parsed.totalRowCount, 2);
    assert.equal(parsed.rows.length, 2);

    const detection = detectSportsConnectReport(parsed.headers);
    assert.equal(detection.reportKind, "PLAYER_REG");
  });

  it("accepts export extensions", () => {
    assert.equal(isAllowedSportsConnectExportName("a.csv"), true);
    assert.equal(isAllowedSportsConnectExportName("a.XLSX"), true);
    assert.equal(isAllowedSportsConnectExportName("a.txt"), false);
  });
});
