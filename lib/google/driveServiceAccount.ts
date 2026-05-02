import { JWT } from "google-auth-library";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

export type ParsedServiceAccount = {
  client_email: string;
  private_key: string;
};

function parseServiceAccountJson(): ParsedServiceAccount | null {
  const raw = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON?.trim();
  if (raw) {
    try {
      const j = JSON.parse(raw) as {
        client_email?: string;
        private_key?: string;
        type?: string;
      };
      if (
        j.type === "service_account" &&
        typeof j.client_email === "string" &&
        typeof j.private_key === "string"
      ) {
        return { client_email: j.client_email, private_key: j.private_key };
      }
    } catch {
      return null;
    }
  }

  const b64 = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const j = JSON.parse(decoded) as {
        client_email?: string;
        private_key?: string;
        type?: string;
      };
      if (
        j.type === "service_account" &&
        typeof j.client_email === "string" &&
        typeof j.private_key === "string"
      ) {
        return { client_email: j.client_email, private_key: j.private_key };
      }
    } catch {
      return null;
    }
  }

  return null;
}

export function isDriveServiceAccountConfigured(): boolean {
  return parseServiceAccountJson() !== null;
}

function createJwt(): JWT | null {
  const creds = parseServiceAccountJson();
  if (!creds) return null;
  return new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: [DRIVE_SCOPE],
  });
}

export async function getDriveAccessToken(): Promise<string | null> {
  const jwt = createJwt();
  if (!jwt) return null;
  const res = await jwt.getAccessToken();
  return res.token ?? null;
}

export type DriveApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

/**
 * Low-level Drive v3 HTTP helper (service account bearer).
 */
export async function driveV3Request<T>(
  pathAndQuery: string,
  init?: RequestInit,
): Promise<DriveApiResult<T>> {
  const token = await getDriveAccessToken();
  if (!token) {
    return {
      ok: false,
      status: 503,
      message:
        "Google Drive service account is not configured. Set GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (or _BASE64).",
    };
  }

  const url = `https://www.googleapis.com/drive/v3${pathAndQuery}`;
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, { ...init, headers });

  if (res.status === 204) {
    return { ok: true, data: undefined as T };
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      if (j.error?.message) message = j.error.message;
    } catch {
      /* ignore */
    }
    return { ok: false, status: res.status, message };
  }

  try {
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: 502, message: "Invalid JSON from Google Drive API." };
  }
}
