import crypto from "node:crypto";

const SECRET = process.env.COMMUNICATIONS_UNSUBSCRIBE_SECRET || "";

function b64url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromB64url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function createUnsubscribeToken(payload: {
  email: string;
  organizationId?: string | null;
  channel: "EMAIL" | "SMS";
}) {
  if (!SECRET) return "";
  const body = JSON.stringify({
    e: payload.email.trim().toLowerCase(),
    o: payload.organizationId ?? null,
    c: payload.channel,
    t: Date.now(),
  });
  const encoded = b64url(body);
  const sig = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

export function verifyUnsubscribeToken(token: string) {
  if (!SECRET) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(encoded).digest("base64url");
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(fromB64url(encoded)) as {
      e?: string;
      o?: string | null;
      c?: "EMAIL" | "SMS";
    };
    if (!parsed.e || !parsed.c) return null;
    return {
      email: parsed.e.trim().toLowerCase(),
      organizationId: parsed.o ?? null,
      channel: parsed.c,
    };
  } catch {
    return null;
  }
}
