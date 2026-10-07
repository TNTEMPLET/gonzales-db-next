import { timingSafeEqual } from "crypto";

export type ScoutCronDecision = { action: "skip" } | { action: "deny" } | { action: "run" };

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Vercel cron hits every project that shares vercel.json.
 * Only the master deployment runs. A missing CRON_SECRET refuses the call.
 */
export function scoutCronAccess(input: {
  orgId: string;
  authorizationHeader: string | null;
  cronSecret: string | undefined;
}): ScoutCronDecision {
  if (input.orgId !== "master") return { action: "skip" };
  const secret = input.cronSecret?.trim() ?? "";
  if (!secret) return { action: "deny" };
  const header = input.authorizationHeader ?? "";
  if (!safeEqual(header, `Bearer ${secret}`)) return { action: "deny" };
  return { action: "run" };
}
