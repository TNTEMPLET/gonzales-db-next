import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { campaignSendsEmail, withoutSmsChannel } from "@/lib/communications/channels";

describe("communications channels", () => {
  it("sends email and ignores SMS without throwing", () => {
    assert.deepEqual(withoutSmsChannel(["EMAIL", "SMS"]), ["EMAIL"]);
    assert.equal(campaignSendsEmail(["EMAIL", "SMS"]), true);
    assert.deepEqual(withoutSmsChannel(["SMS"]), []);
    assert.equal(campaignSendsEmail(["SMS"]), false);
    assert.equal(campaignSendsEmail(["EMAIL"]), true);
  });
});
