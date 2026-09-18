import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateBoardContact } from "../boardContact";

describe("validateBoardContact", () => {
  it("skips when they did not request a callback", () => {
    const result = validateBoardContact({ wantsBoardContact: false });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal("skipped" in result && result.skipped, true);
  });

  it("requires name, phone, email, method, and time when they opt in", () => {
    const missing = validateBoardContact({ wantsBoardContact: true });
    assert.equal(missing.ok, false);

    const ok = validateBoardContact({
      wantsBoardContact: true,
      contactName: "Ada Lovelace",
      contactPhone: "(225) 555-0100",
      email: "ada@example.com",
      preferredMethod: "PHONE",
      bestTime: "EVENING",
    });
    assert.equal(ok.ok, true);
    if (ok.ok && !("skipped" in ok)) {
      assert.equal(ok.contactName, "Ada Lovelace");
      assert.equal(ok.preferredMethod, "PHONE");
    }
  });
});
