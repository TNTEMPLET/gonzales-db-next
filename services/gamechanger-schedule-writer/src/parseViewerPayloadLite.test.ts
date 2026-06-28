import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseViewerPayloadLite } from "./parseViewerPayloadLite.js";

describe("parseViewerPayloadLite", () => {
  it("extracts counts from nested payload shapes", () => {
    const parsed = parseViewerPayloadLite({
      game_situation: {
        balls: 2,
        strikes: 1,
        outs: 2,
        inning: 5,
        half: "top",
      },
    });
    assert.equal(parsed.balls, 2);
    assert.equal(parsed.strikes, 1);
    assert.equal(parsed.outsInHalf, 2);
    assert.equal(parsed.inning, 5);
    assert.equal(parsed.half, "top");
  });
});
