import type { CommunicationChannel } from "@prisma/client";

/**
 * SMS stays in the CommunicationChannel enum (dropped in a later slice).
 * It is not a send path: drop it instead of failing the email send.
 * An SMS-only list becomes empty, which callers treat as "do not send".
 */
export function withoutSmsChannel(channels: readonly CommunicationChannel[]): CommunicationChannel[] {
  return channels.filter((channel) => channel !== "SMS");
}

export function campaignSendsEmail(channels: readonly string[]): boolean {
  return channels.includes("EMAIL");
}
