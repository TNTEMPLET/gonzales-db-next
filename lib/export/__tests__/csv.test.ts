import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { csvCell, csvEscape, toCsvDocument } from "../csv";

describe("csv export helpers", () => {
  it("escapes quotes", () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it("stringifies cells", () => {
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(42), '"42"');
  });

  it("builds a document with header and rows", () => {
    const doc = toCsvDocument(
      ["Name", "Email"],
      [
        ["Ada", "ada@example.com"],
        ['O"Brien', "ob@example.com"],
      ],
    );
    assert.ok(doc.includes('"Name","Email"'));
    assert.ok(doc.includes('"O""Brien"'));
  });
});
