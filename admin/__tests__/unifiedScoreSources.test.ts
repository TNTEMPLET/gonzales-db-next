import test from "node:test";
import assert from "node:assert/strict";

import { leagueSourceKey, unifiedScoreGameId } from "@/lib/admin/unifiedScoreSources";

test("leagueSourceKey returns the shared league connection key", () => {
  assert.equal(leagueSourceKey(), "league");
});

test("unifiedScoreGameId keeps source, organization, source key, and match distinct", () => {
  assert.equal(
    unifiedScoreGameId("TOURNAMENT", "ladistrict2", "project-1", "G1"),
    "TOURNAMENT:ladistrict2:project-1:G1",
  );
});
