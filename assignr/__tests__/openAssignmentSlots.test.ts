import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  assignrAssignmentSlotIsOpen,
  assignrGameHasOpenAssignmentSlots,
  filterAssignrGamesWithOpenAssignmentSlots,
} from "@/lib/assignr/games";
import type { AssignrGame } from "@/lib/assignr/types";

describe("assignr open assignment slots", () => {
  test("treats games without assignment slots as open", () => {
    const game: AssignrGame = { id: 1 };
    assert.equal(assignrGameHasOpenAssignmentSlots(game), true);
  });

  test("detects open and filled slots", () => {
    const open = { assigned: false };
    const filled = {
      assigned: true,
      _embedded: { official: { id: 99 } },
    };
    assert.equal(assignrAssignmentSlotIsOpen(open), true);
    assert.equal(assignrAssignmentSlotIsOpen(filled), false);
  });

  test("filters games with at least one open slot", () => {
    const games: AssignrGame[] = [
      {
        id: 1,
        _embedded: {
          assignments: [{ assigned: false }],
        },
      },
      {
        id: 2,
        _embedded: {
          assignments: [{ assigned: true, _embedded: { official: { id: 1 } } }],
        },
      },
    ];
    assert.equal(filterAssignrGamesWithOpenAssignmentSlots(games).length, 1);
  });
});
