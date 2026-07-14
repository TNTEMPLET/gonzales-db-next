import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { parseBody } from "../parseBody";

describe("parseBody", () => {
  const schema = z.object({
    ledger: z.enum(["personal", "duckroost"]),
    amount: z.number().positive(),
  });

  it("accepts valid payloads", () => {
    const r = parseBody(schema, { ledger: "personal", amount: 10 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.data.ledger, "personal");
      assert.equal(r.data.amount, 10);
    }
  });

  it("rejects invalid payloads with path messages", () => {
    const r = parseBody(schema, { ledger: "nope", amount: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.error.length > 0);
      assert.ok((r.issues?.length ?? 0) >= 1);
    }
  });
});
