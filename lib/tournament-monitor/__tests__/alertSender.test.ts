import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { planTournamentAlertDelivery } from "@/lib/tournament-monitor/alertPlan";

describe("tournament monitor alerts", () => {
  it("sends email only when a subscription also lists SMS", () => {
    const both = planTournamentAlertDelivery(["EMAIL", "SMS"]);
    assert.equal(both.email, true);
    assert.equal(both.sms, false);

    const smsOnly = planTournamentAlertDelivery(["SMS"]);
    assert.equal(smsOnly.email, false);
    assert.equal(smsOnly.sms, false);
  });

  it("does not reference the Twilio provider", () => {
    const source = readFileSync(new URL("../alertSender.ts", import.meta.url), "utf8");
    assert.equal(source.includes("planTournamentAlertDelivery"), true);
    assert.equal(source.includes("sendSms"), false);
    assert.equal(source.includes("twilio"), false);
    assert.equal(source.includes("TWILIO_"), false);
    assert.equal(source.includes("COMMUNICATIONS_SMS_ENABLED"), false);
    assert.equal(source.includes("api.twilio.com"), false);
  });
});
