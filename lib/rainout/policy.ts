type RainoutEnv = {
  RAINOUT_EMAILS_ENABLED?: string;
  RAINOUT_EMAIL_ALLOWLIST?: string | null;
  COMMUNICATIONS_MODULE_ENABLED?: string;
};

type RainoutEnvSource = RainoutEnv | NodeJS.ProcessEnv;

function readEnv(env: RainoutEnvSource, key: keyof RainoutEnv): string | null | undefined {
  return (env as unknown as RainoutEnv)[key];
}

function flagOn(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes";
}

function communicationsModuleEnabled(env: RainoutEnvSource): boolean {
  const value = (readEnv(env, "COMMUNICATIONS_MODULE_ENABLED") || "true").trim().toLowerCase();
  return value !== "0" && value !== "false" && value !== "off";
}

/** Defaults off. Anything other than an explicit on-value keeps mail in dry-run. */
export function rainoutEmailsEnabled(env: RainoutEnvSource = process.env): boolean {
  return flagOn(readEnv(env, "RAINOUT_EMAILS_ENABLED"));
}

/**
 * Live send requires the rainout switch and the communications module.
 * The module defaults on; the rainout switch defaults off.
 */
export function rainoutSendingEnabled(env: RainoutEnvSource = process.env): boolean {
  return rainoutEmailsEnabled(env) && communicationsModuleEnabled(env);
}

/**
 * Comma-separated allowlist. Unset or blank means every computed family may be mailed.
 * A list that is present but empty (for example ",") matches nobody.
 */
export function rainoutEmailAllowlist(env: RainoutEnvSource = process.env): Set<string> | null {
  const raw = readEnv(env, "RAINOUT_EMAIL_ALLOWLIST");
  if (raw == null) return null;
  if (raw.trim() === "") return null;
  const emails = raw.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return new Set(emails);
}

export function allowlistPermits(email: string, allowlist: Set<string> | null): boolean {
  if (!allowlist) return true;
  return allowlist.has(email.trim().toLowerCase());
}
