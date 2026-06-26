import { isSmsSendingEnabled } from "../config";

export async function sendSmsViaTwilio(input: { to: string; body: string }) {
  if (!isSmsSendingEnabled()) {
    throw new Error("SMS sending is disabled. Set COMMUNICATIONS_SMS_ENABLED=true to send tournament text alerts.");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE;
  if (!accountSid || !authToken || !from) {
    throw new Error("Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_PHONE");
  }

  const body = new URLSearchParams({
    From: from,
    To: input.to,
    Body: input.body,
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = (await response.json().catch(() => ({}))) as { sid?: string; message?: string; error_message?: string };
  if (!response.ok) {
    throw new Error(json.message || json.error_message || `Twilio send failed (${response.status})`);
  }
  return {
    provider: "twilio",
    providerMessageId: json.sid ?? null,
  };
}
