import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveSportsConnectRowKey,
  enrollmentKeyFromPlayerRegRow,
  enrollmentKeysFromPlayerRegRows,
} from "../enrollmentRowKey";
import { pruneWouldBeUnsafe } from "../prunePolicy";

describe("deriveSportsConnectRowKey", () => {
  it("uses order number plus normalized name when an order exists", () => {
    assert.equal(
      deriveSportsConnectRowKey(" 12345 ", "Jane  Q.  Doe", new Date("2016-05-01")),
      "12345::jane q doe",
    );
  });

  it("falls back to name plus birth date when there is no order number", () => {
    assert.equal(
      deriveSportsConnectRowKey("", "Jane Doe", new Date("2016-05-01T00:00:00.000Z")),
      "jane doe::2016-05-01",
    );
  });
});

describe("enrollmentKeysFromPlayerRegRows", () => {
  it("keeps player rows and skips umpire-only divisions", () => {
    const keys = enrollmentKeysFromPlayerRegRows([
      {
        "Division Name": "10U",
        "Order No": "1001",
        "Player Full Name": "Alex Rivera",
      },
      {
        "Division Name": "Umpire Clinic",
        "Order No": "1002",
        "Player Full Name": "Pat Official",
      },
      {
        "division name": "8U",
        "Order Number": "1003",
        "Participant Full Name": "Sam Lee",
      },
    ]);
    assert.equal(keys.size, 2);
    assert.equal(keys.has("1001::alex rivera"), true);
    assert.equal(keys.has("1003::sam lee"), true);
    assert.equal(keys.has("1002::pat official"), false);
  });

  it("returns null for a row with no player name", () => {
    assert.equal(
      enrollmentKeyFromPlayerRegRow({
        "Division Name": "10U",
        "Order No": "1001",
      }),
      null,
    );
  });
});

describe("pruneWouldBeUnsafe", () => {
  it("allows dropping a handful of leftovers from a full file", () => {
    assert.equal(
      pruneWouldBeUnsafe({ existingCount: 981, keepCount: 971, matchingCount: 971 }),
      null,
    );
  });

  it("refuses an empty file", () => {
    assert.equal(
      pruneWouldBeUnsafe({ existingCount: 981, keepCount: 0, matchingCount: 0 }),
      "Latest file produced no enrollment keys",
    );
  });

  it("refuses a partial file against a large roster", () => {
    const skipped = pruneWouldBeUnsafe({
      existingCount: 981,
      keepCount: 80,
      matchingCount: 80,
    });
    assert.match(skipped || "", /file has 80 players but the site has 981/);
  });

  it("refuses when file keys do not overlap the site roster", () => {
    const skipped = pruneWouldBeUnsafe({
      existingCount: 981,
      keepCount: 971,
      matchingCount: 12,
    });
    assert.match(skipped || "", /only 12 of 981 site players match/);
  });
});
