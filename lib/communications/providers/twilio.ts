/**
 * SMS is intentionally disabled in MVP; this adapter exists for
 * schema/workflow readiness and future activation behind feature flags.
 */
export async function sendSmsViaTwilio(_input: { to: string; body: string }) {
  throw new Error("SMS sending is not enabled yet");
}
