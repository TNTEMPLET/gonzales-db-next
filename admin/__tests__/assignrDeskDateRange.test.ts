import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  endOfYearIsoDate,
  resolveAssignrDeskDateRange,
  todayIsoDate,
} from "@/lib/admin/assignrDeskDateRange";

describe("assignr desk date range", () => {
  test("defaults start to today and end to the start year", () => {
    const today = todayIsoDate(new Date("2026-05-12T12:00:00"));
    assert.equal(today, "2026-05-12");
    const range = resolveAssignrDeskDateRange({ startDate: today, endDate: "" });
    assert.equal(range.endDate, "2026-12-31");
  });

  test("uses the end of the year when end date is omitted", () => {
    const range = resolveAssignrDeskDateRange({
      startDate: "2026-05-12",
      endDate: "",
    });
    assert.equal(range.startDate, "2026-05-12");
    assert.equal(range.endDate, "2026-12-31");
    assert.equal(endOfYearIsoDate("2027-01-02"), "2027-12-31");
  });
});
