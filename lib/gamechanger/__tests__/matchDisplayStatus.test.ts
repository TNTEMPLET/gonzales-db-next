import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  bracketFinalStatusFromScores,
  resolveMatchDisplayStatus,
} from "@/lib/gamechanger/matchDisplayStatus";

describe("bracketFinalStatusFromScores", () => {
  it("returns score and Final label when both sides have scores", () => {
    assert.deepEqual(bracketFinalStatusFromScores(10, 2), {
      scoreLabel: "10–2",
      statusLabel: "Final",
    });
  });

  it("returns undefined when either score is missing", () => {
    assert.equal(bracketFinalStatusFromScores(10, undefined), undefined);
    assert.equal(bracketFinalStatusFromScores(undefined, 2), undefined);
  });
});

describe("resolveMatchDisplayStatus", () => {
  it("keeps LIVE status even when bracket scores exist", () => {
    const live = { scoreLabel: "1–0", inningLabel: "Top 3", statusLabel: "LIVE" };
    assert.equal(
      resolveMatchDisplayStatus(live, { homeScore: 10, awayScore: 2 }),
      live,
    );
  });

  it("uses GameChanger completed status when present", () => {
    const live = { scoreLabel: "4–12", statusLabel: "Final" };
    assert.deepEqual(
      resolveMatchDisplayStatus(live, { homeScore: 8, awayScore: 3 }),
      live,
    );
  });

  it("falls back to bracket scores when live status is empty", () => {
    assert.deepEqual(resolveMatchDisplayStatus(null, { homeScore: 8, awayScore: 3 }), {
      scoreLabel: "8–3",
      statusLabel: "Final",
    });
  });

  it("falls back when live has no score line", () => {
    assert.deepEqual(
      resolveMatchDisplayStatus({ statusLabel: "Scheduled" }, { homeScore: 10, awayScore: 2 }),
      { scoreLabel: "10–2", statusLabel: "Final" },
    );
  });
});
