import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { sendEmailViaResend } from "../providers/resend";
import { guardOutboundMessage, isProductionEnv, shouldShowStagingBanner } from "../outboundGuard";

const originalWarn = console.warn;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
}

afterEach(() => {
  console.warn = originalWarn;
  globalThis.fetch = originalFetch;
  restoreEnv();
});

function captureWarnings(): string[] {
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  return lines;
}

describe("guardOutboundMessage", () => {
  it("passes every recipient through in production", () => {
    const lines = captureWarnings();
    const result = guardOutboundMessage({
      to: ["Parent@Example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      channel: "email",
      env: { VERCEL_ENV: "production" },
    });
    assert.equal(isProductionEnv({ VERCEL_ENV: "production" }), true);
    assert.equal(shouldShowStagingBanner({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldShowStagingBanner({ VERCEL_ENV: "preview" }), true);
    assert.equal(shouldShowStagingBanner({}), true);
    assert.deepEqual(result, {
      to: ["Parent@Example.com"],
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
      dropped: [],
    });
    assert.equal(lines.length, 0);
  });

  it("keeps only allowlisted recipients in preview", () => {
    const lines = captureWarnings();
    const result = guardOutboundMessage({
      to: ["Coach@Example.com", "parent@example.com"],
      cc: ["other@example.com"],
      channel: "email",
      env: {
        VERCEL_ENV: "preview",
        EMAIL_ALLOWLIST: "coach@example.com, other@example.com",
      },
    });
    assert.deepEqual(result.to, ["Coach@Example.com"]);
    assert.deepEqual(result.cc, ["other@example.com"]);
    assert.deepEqual(result.dropped, ["parent@example.com"]);
    assert.match(lines[0] ?? "", /Dropped 1 email recipient/);
    assert.match(lines[0] ?? "", /p\*\*\*@example\.com/);
  });

  it("drops preview recipients that are not on the allowlist", () => {
    captureWarnings();
    const result = guardOutboundMessage({
      to: ["parent@example.com"],
      channel: "sms",
      env: { VERCEL_ENV: "preview", SMS_ALLOWLIST: "+15551212" },
    });
    assert.deepEqual(result.to, []);
    assert.deepEqual(result.dropped, ["parent@example.com"]);
  });

  it("blocks every recipient when the allowlist is empty", () => {
    for (const raw of ["", "   ", ","]) {
      captureWarnings();
      const result = guardOutboundMessage({
        to: ["parent@example.com", "coach@example.com"],
        cc: ["cc@example.com"],
        channel: "email",
        env: { VERCEL_ENV: "preview", EMAIL_ALLOWLIST: raw },
      });
      assert.deepEqual(result.to, []);
      assert.deepEqual(result.cc, []);
      assert.deepEqual(result.dropped, ["parent@example.com", "coach@example.com", "cc@example.com"]);
    }
  });

  it("blocks every recipient when VERCEL_ENV is unset and the allowlist is unset", () => {
    const lines = captureWarnings();
    const env = {};
    assert.equal(isProductionEnv(env), false);
    const email = guardOutboundMessage({
      to: ["parent@example.com"],
      channel: "email",
      env,
    });
    const sms = guardOutboundMessage({
      to: ["+15551212000"],
      channel: "sms",
      env,
    });
    assert.deepEqual(email.to, []);
    assert.deepEqual(email.dropped, ["parent@example.com"]);
    assert.deepEqual(sms.to, []);
    assert.match(lines.join("\n"), /Dropped 1 sms/);
    const kept = guardOutboundMessage({
      to: ["Coach@Example.com", "parent@example.com"],
      channel: "email",
      env: { EMAIL_ALLOWLIST: "coach@example.com" },
    });
    assert.deepEqual(kept.to, ["Coach@Example.com"]);
    assert.deepEqual(kept.dropped, ["parent@example.com"]);
  });
});

describe("provider allowlist guard", () => {
  it("sends only the allowlisted address and does not call Resend when none remain", async () => {
    captureWarnings();
    const seen: string[] = [];
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ id: "email_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    process.env.VERCEL_ENV = "preview";
    process.env.EMAIL_ALLOWLIST = "coach@example.com";
    process.env.RESEND_API_KEY = "re_test";
    process.env.COMMUNICATIONS_EMAIL_FROM = "AP Baseball <noreply@example.com>";

    const skipped = await sendEmailViaResend({
      to: "parent@example.com",
      subject: "Rainout",
      html: "<p>out</p>",
    });
    assert.equal(skipped.status, "skipped");
    assert.equal(seen.length, 0);

    const sent = await sendEmailViaResend({
      to: ["Coach@Example.com", "parent@example.com"],
      cc: "other@example.com",
      subject: "Rainout",
      html: "<p>out</p>",
    });
    assert.equal(sent.status, "sent");
    assert.deepEqual(sent.accepted, ["Coach@Example.com"]);
    assert.equal(seen.length, 1);
    const body = JSON.parse(seen[0] ?? "{}") as { to?: string[]; cc?: string[] };
    assert.deepEqual(body.to, ["Coach@Example.com"]);
    assert.equal(body.cc, undefined);
  });
});
