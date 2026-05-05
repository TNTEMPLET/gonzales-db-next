export async function sendEmailViaResend(input: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.COMMUNICATIONS_EMAIL_FROM || process.env.RESEND_FROM_EMAIL;
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
