import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sendSmsViaTwilio } from "@/lib/communications/providers/twilio";

describe("sendSmsViaTwilio", () => {
  it("posts SMS messages to Twilio with basic auth", async () => {
    const previousFetch = globalThis.fetch;
    const previousEnv = { ...process.env };
    let captured: { url: string; init: RequestInit } | null = null;
    process.env.COMMUNICATIONS_SMS_ENABLED = "true";
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_FROM_PHONE = "+12223334444";
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {} };
      return new Response(JSON.stringify({ sid: "SM123" }), { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    try {
      const result = await sendSmsViaTwilio({ to: "+15556667777", body: "Tournament alert" });
      assert.equal(result.provider, "twilio");
      assert.ok(captured);
      const cap: { url: string; init: RequestInit } = captured;
      assert.ok(cap.url.includes("/Accounts/AC123/Messages.json"));
      assert.equal(cap.init.method, "POST");
      assert.equal((cap.init.headers as Record<string, string>).Authorization, `Basic ${Buffer.from("AC123:secret").toString("base64")}`);
      const body = cap.init.body as URLSearchParams;
      assert.equal(body.get("From"), "+12223334444");
      assert.equal(body.get("To"), "+15556667777");
      assert.equal(body.get("Body"), "Tournament alert");
    } finally {
      globalThis.fetch = previousFetch;
      process.env = previousEnv;
    }
  });
});
