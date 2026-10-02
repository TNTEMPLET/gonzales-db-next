import { DEFAULT_COMMUNICATIONS_FROM } from "@/lib/communications/fromAddressConstants";
import {
  guardOutboundMessage,
  isProductionEnv,
  sentSendResult,
  skippedSendResult,
  type GuardedSendResult,
} from "@/lib/communications/outboundGuard";

export type ResendAttachment = {
  filename: string;
  /** Base64-encoded file contents (Resend API). */
  content: string;
  contentType?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(status: number, message: string) {
  return (
    status === 429 ||
    /too many requests|rate limit/i.test(message)
  );
}

function addressList(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((entry) => entry.trim()).filter(Boolean);
}

export async function sendEmailViaResend(input: {
  /** One address, or multiple (Resend accepts an array). */
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  /** Full From header; falls back to COMMUNICATIONS_EMAIL_FROM / default noreply. */
  from?: string | null;
  /** Optional file attachments (CSV reports, etc.). */
  attachments?: ResendAttachment[];
  /** Optional reply-to. */
  replyTo?: string | null;
  cc?: string | string[] | null;
  bcc?: string | string[] | null;
}): Promise<GuardedSendResult<"resend">> {
  let toList = addressList(input.to);
  let ccList = addressList(input.cc);
  let bccList = addressList(input.bcc);
  if (toList.length === 0) {
    throw new Error("At least one recipient is required");
  }
  if (!isProductionEnv()) {
    const guarded = guardOutboundMessage({
      to: toList,
      cc: ccList,
      bcc: bccList,
      channel: "email",
    });
    if (guarded.to.length === 0) {
      return skippedSendResult("resend");
    }
    toList = guarded.to;
    ccList = guarded.cc;
    bccList = guarded.bcc;
  }

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

  const body: Record<string, unknown> = {
    from,
    to: toList,
    subject: input.subject,
    html: input.html,
    text: input.text ?? undefined,
  };
  if (ccList.length > 0) body.cc = ccList;
  if (bccList.length > 0) body.bcc = bccList;
  if (input.replyTo?.trim()) {
    body.reply_to = input.replyTo.trim();
  }
  if (input.attachments?.length) {
    body.attachments = input.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      ...(a.contentType ? { content_type: a.contentType } : {}),
    }));
  }

  // Resend free/default tier: 10 req/s. Retry 429s with backoff.
  const maxAttempts = 5;
  let lastError = "Resend send failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
      error?: unknown;
    };
    if (response.ok) {
      return sentSendResult("resend", json.id ?? null, toList);
    }

    lastError =
      json.message ||
      json.name ||
      `Resend send failed (${response.status})`;

    if (isRateLimitError(response.status, lastError) && attempt < maxAttempts) {
      const retryAfterHdr = response.headers.get("retry-after");
      const retryAfterSec = retryAfterHdr ? Number(retryAfterHdr) : NaN;
      const waitMs = Number.isFinite(retryAfterSec)
        ? Math.max(250, retryAfterSec * 1000)
        : 250 * 2 ** (attempt - 1); // 250, 500, 1000, 2000…
      await sleep(waitMs);
      continue;
    }

    throw new Error(lastError);
  }

  throw new Error(lastError);
}
