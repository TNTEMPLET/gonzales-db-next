import test from "node:test";
import assert from "node:assert/strict";

import { parseJsonStringArray, parseMatchEventPins } from "@/lib/gamechanger/scoreboardConnections";

test("parseJsonStringArray keeps only non-empty strings", () => {
  assert.deepEqual(parseJsonStringArray(["a", "", 2, "b"]), ["a", "b"]);
});

test("parseMatchEventPins normalizes persisted pin maps", () => {
  assert.deepEqual(parseMatchEventPins({ G1: "event-1", G2: "", G3: 3 }), { G1: "event-1" });
});
