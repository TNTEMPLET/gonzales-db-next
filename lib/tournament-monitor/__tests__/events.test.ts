import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hashMonitorStatus, monitorHourBucket } from "@/lib/tournament-monitor/events";

describe("tournament monitor events", () => {
  it("creates stable hashes for idempotent event keys", () => {
    assert.equal(hashMonitorStatus({ a: 1, b: "two" }), hashMonitorStatus({ a: 1, b: "two" }));
    assert.notEqual(hashMonitorStatus({ a: 1 }), hashMonitorStatus({ a: 2 }));
  });

  it("rounds heartbeat buckets to the UTC hour", () => {
    assert.equal(monitorHourBucket(new Date("2026-06-27T18:45:10.000Z")), "2026-06-27T18:00:00.000Z");
  });
});
