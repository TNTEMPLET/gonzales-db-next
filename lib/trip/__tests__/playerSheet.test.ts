import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterPlayerSheetParticipants,
  isPlayerSheetEligible,
} from "@/lib/trip/playerSheet";

describe("player sheet eligibility", () => {
  it("includes Player and missing type", () => {
    assert.equal(
      isPlayerSheetEligible({
        answersJson: JSON.stringify({ participant_type: "Player" }),
      }),
      true,
    );
    assert.equal(
      isPlayerSheetEligible({ answersJson: JSON.stringify({}) }),
      true,
    );
    assert.equal(isPlayerSheetEligible({ answersJson: null }), true);
  });

  it("excludes Coach, Manager, Other", () => {
    for (const t of ["Coach", "Manager", "Other", "coach", "MANAGER"]) {
      assert.equal(
        isPlayerSheetEligible({
          answersJson: JSON.stringify({ participant_type: t }),
        }),
        false,
        t,
      );
    }
  });

  it("filters mixed rosters to athletes only", () => {
    const rows = filterPlayerSheetParticipants([
      {
        playerFullName: "Alex Player",
        ageGroup: null,
        team: null,
        jerseyNumber: null,
        status: "submitted",
        answersJson: JSON.stringify({ participant_type: "Player" }),
      },
      {
        playerFullName: "Sam Coach",
        ageGroup: null,
        team: null,
        jerseyNumber: null,
        status: "submitted",
        answersJson: JSON.stringify({ participant_type: "Coach" }),
      },
      {
        playerFullName: "Pat Manager",
        ageGroup: null,
        team: null,
        jerseyNumber: null,
        status: "draft",
        answersJson: JSON.stringify({ participant_type: "Manager" }),
      },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.playerFullName, "Alex Player");
  });
});
