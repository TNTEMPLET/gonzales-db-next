import { DEFAULT_COMMUNICATIONS_FROM } from "@/lib/communications/fromAddressConstants";

export async function sendEmailViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Full From header; falls back to COMMUNICATIONS_EMAIL_FROM / default noreply. */
  from?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = (
    input.from?.trim() ||
    process.env.COMMUNICATIONS_EMAIL_FROM?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    DEFAULT_COMMUNICATIONS_FROM
  ).trim();
  if (!apiKey || !from) {
    throw new Error("Missing RESEND_API_KEY or COMMUNICATIONS_EMAIL_FROM");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text ?? undefined,
    }),
  });

  const json = (await response.json()) as { id?: string; message?: string; error?: unknown };
  if (!response.ok) {
    throw new Error(json.message || `Resend send failed (${response.status})`);
  }
  return {
    provider: "resend",
    providerMessageId: json.id ?? null,
  };
}
