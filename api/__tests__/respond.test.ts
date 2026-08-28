import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authFailureResponse, jsonError, jsonOk } from "../respond";

describe("api respond helpers", () => {
  it("builds error and ok envelopes", async () => {
    const err = jsonError("Nope", 400, { issues: ["a"] });
    assert.equal(err.status, 400);
    const errBody = await err.json();
    assert.equal(errBody.error, "Nope");
    assert.deepEqual(errBody.issues, ["a"]);

    const ok = jsonOk({ data: 1 });
    assert.equal(ok.status, 200);
    const okBody = await ok.json();
    assert.equal(okBody.data, 1);
  });

  it("maps auth failures", async () => {
    const res = authFailureResponse({
      ok: false,
      status: 403,
      message: "Forbidden",
    });
    assert.equal(res.status, 403);
  });
});
