export const OUTBOUND_SKIPPED_REASON = "No allowlisted recipients outside production";

export type GuardedSendResult<P extends string = string> = {
  provider: P;
  providerMessageId: string | null;
  status: "sent" | "skipped";
  skippedReason: string | null;
  accepted: string[];
};

type OutboundEnv = {
  VERCEL_ENV?: string | null;
  EMAIL_ALLOWLIST?: string | null;
  SMS_ALLOWLIST?: string | null;
};

type OutboundEnvSource = OutboundEnv | NodeJS.ProcessEnv;

function readOutboundEnv(env: OutboundEnvSource, key: keyof OutboundEnv): string | null | undefined {
  return (env as OutboundEnv)[key];
}

export function isProductionEnv(env: OutboundEnvSource = process.env): boolean {
  return (readOutboundEnv(env, "VERCEL_ENV") ?? "").trim() === "production";
}

export function shouldShowStagingBanner(env: OutboundEnvSource = process.env): boolean {
  return !isProductionEnv(env);
}

export function parseAllowlist(raw: string | null | undefined): Set<string> {
  if (raw == null || raw.trim() === "") return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function maskOutboundAddress(value: string): string {
  const trimmed = value.trim();
  const at = trimmed.indexOf("@");
  if (at > 0) {
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    return `${local.slice(0, 1).toLowerCase()}***@${domain.toLowerCase()}`;
  }
  const compact = trimmed.replace(/\s+/g, "");
  return `***${compact.slice(-4)}`;
}

export function logDroppedRecipients(channel: "email" | "sms", dropped: readonly string[]): void {
  if (dropped.length === 0) return;
  const masked = dropped.map((address) => maskOutboundAddress(address)).join(", ");
  console.warn(
    `[outbound] Dropped ${dropped.length} ${channel} recipient(s) outside production: ${masked}`,
  );
}

export function guardOutboundMessage(input: {
  to: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  channel: "email" | "sms";
  env?: OutboundEnvSource;
}): { to: string[]; cc: string[]; bcc: string[]; dropped: string[] } {
  const env = input.env ?? process.env;
  const clean = (values: readonly string[] | undefined) =>
    (values ?? []).map((value) => value.trim()).filter(Boolean);

  const to = clean(input.to);
  const cc = clean(input.cc);
  const bcc = clean(input.bcc);
  if (isProductionEnv(env)) {
    return { to, cc, bcc, dropped: [] };
  }

  const allow = parseAllowlist(
    readOutboundEnv(env, input.channel === "email" ? "EMAIL_ALLOWLIST" : "SMS_ALLOWLIST"),
  );
  const dropped: string[] = [];
  const keep = (values: string[]) => {
    const allowed: string[] = [];
    for (const value of values) {
      if (allow.has(value.toLowerCase())) allowed.push(value);
      else dropped.push(value);
    }
    return allowed;
  };

  const guarded = { to: keep(to), cc: keep(cc), bcc: keep(bcc), dropped };
  logDroppedRecipients(input.channel, dropped);
  return guarded;
}

export function skippedSendResult<P extends string>(provider: P): GuardedSendResult<P> {
  return {
    provider,
    providerMessageId: null,
    status: "skipped",
    skippedReason: OUTBOUND_SKIPPED_REASON,
    accepted: [],
  };
}

export function sentSendResult<P extends string>(
  provider: P,
  providerMessageId: string | null,
  accepted: string[],
): GuardedSendResult<P> {
  return {
    provider,
    providerMessageId,
    status: "sent",
    skippedReason: null,
    accepted,
  };
}
