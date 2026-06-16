import assert from "node:assert/strict";
import test from "node:test";

import {
  mergePdfTextLayers,
  pdfTextIsWeakForBracketIngest,
} from "@/lib/tournament-brackets/ingestion/bracketPdfVisualReaderConfig";

test("pdfTextIsWeakForBracketIngest accepts DocHub 6-team exports", () => {
  const sample = `6T-G11-T2
Loser of Game #10
6T-G10-T1
Winner of Game #7`;
  assert.equal(pdfTextIsWeakForBracketIngest(sample), false);
});

test("pdfTextIsWeakForBracketIngest flags empty or generic text", () => {
  assert.equal(pdfTextIsWeakForBracketIngest(""), true);
  assert.equal(pdfTextIsWeakForBracketIngest("random scanned noise"), true);
});

test("mergePdfTextLayers deduplicates lines", () => {
  const merged = mergePdfTextLayers([
    "Winner of Game #1\nLoser From Game #2",
    "Winner of Game #1\nGame #1 Info",
  ]);
  assert.match(merged, /Winner of Game #1/);
  assert.match(merged, /Loser From Game #2/);
  assert.match(merged, /Game #1 Info/);
  assert.equal(merged.split("\n").filter((l) => l === "Winner of Game #1").length, 1);
});
