import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseGameChangerEmbedSnippet } from "@/lib/gamechanger/parseEmbedSnippet";

const SAMPLE = `
<script>
  window.GC.scoreboard.init({
    target: "#gc-scoreboard-widget-1hdq",
    widgetId: "58152785-6fd8-4c3a-be34-187a3fdf97ff",
    maxVerticalGamesVisible: 4,
  })
</script>
`;

describe("parseGameChangerEmbedSnippet", () => {
  it("extracts widgetId and options from embed snippet", () => {
    const result = parseGameChangerEmbedSnippet(SAMPLE);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.config.widgetId, "58152785-6fd8-4c3a-be34-187a3fdf97ff");
    assert.equal(result.config.maxVerticalGamesVisible, 4);
  });

  it("returns error when widgetId is missing", () => {
    const result = parseGameChangerEmbedSnippet("<div></div>");
    assert.equal(result.ok, false);
  });
});
