import { JWT } from "google-auth-library";

import {
  GMAIL_ACCESS_NOT_GRANTED_MESSAGE,
  SCOUT_GMAIL_READONLY_SCOPE,
  SCOUT_MAILBOX,
} from "@/lib/scout/config";

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function parseJsonCredentials(raw: string): ServiceAccountCredentials | null {
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
      type?: string;
    };
    if (
      parsed.type === "service_account" &&
      typeof parsed.client_email === "string" &&
      typeof parsed.private_key === "string"
    ) {
      return { client_email: parsed.client_email, private_key: parsed.private_key };
    }
  } catch {
    return null;
  }
  return null;
}

export function readGmailServiceAccountCredentials(): ServiceAccountCredentials | null {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    const parsed = parseJsonCredentials(raw);
    if (parsed) return parsed;
  }

  const b64 = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (!b64) return null;
  try {
    return parseJsonCredentials(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/**
 * JWT options for Gmail. Subject is always the Scout mailbox.
 * There is no non-delegated fallback.
 */
export function gmailDelegatedJwtOptions(creds: ServiceAccountCredentials) {
  return {
    email: creds.client_email,
    key: creds.private_key,
    scopes: [SCOUT_GMAIL_READONLY_SCOPE],
    subject: SCOUT_MAILBOX,
  };
}

export function messageForGmailAuthFailure(err: unknown): string {
  const status =
    typeof err === "object" && err !== null && "response" in err
      ? (err as { response?: { status?: number } }).response?.status
      : undefined;
  const text = err instanceof Error ? `${err.message} ${err.name}` : "";
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /unauthorized_client|invalid_grant|access_denied|insufficient|not authorized|delegation|permission|forbidden/i.test(
      text,
    )
  ) {
    return GMAIL_ACCESS_NOT_GRANTED_MESSAGE;
  }
  return "Scout could not reach Gmail.";
}

export async function getDelegatedGmailAccessToken(): Promise<
  { ok: true; token: string } | { ok: false; message: string }
> {
  const creds = readGmailServiceAccountCredentials();
  if (!creds) {
    return { ok: false, message: "Gmail service account is not configured." };
  }

  const jwt = new JWT(gmailDelegatedJwtOptions(creds));
  try {
    const res = await jwt.getAccessToken();
    if (!res.token) return { ok: false, message: GMAIL_ACCESS_NOT_GRANTED_MESSAGE };
    return { ok: true, token: res.token };
  } catch (err) {
    return { ok: false, message: messageForGmailAuthFailure(err) };
  }
}
