import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatTournamentDateTime,
  TOURNAMENT_DISPLAY_TIME_ZONE,
} from "@/lib/tournament-monitor/formatDateTime";

describe("formatTournamentDateTime", () => {
  it("uses America/Chicago", () => {
    assert.equal(TOURNAMENT_DISPLAY_TIME_ZONE, "America/Chicago");
  });

  it("formats UTC instant as Central wall clock with zone label", () => {
    const formatted = formatTournamentDateTime("2026-06-28T17:00:00.000Z");
    assert.match(formatted, /Jun 28/);
    assert.match(formatted, /12:00/);
    assert.match(formatted, /PM/);
    assert.match(formatted, /CDT|CST/);
  });

  it("returns Not yet for empty values", () => {
    assert.equal(formatTournamentDateTime(null), "Not yet");
    assert.equal(formatTournamentDateTime(undefined), "Not yet");
  });
});
