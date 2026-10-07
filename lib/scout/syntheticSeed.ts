import type { PrismaClient } from "@prisma/client";

import { SCOUT_MAILBOX } from "@/lib/scout/config";
import {
  SYNTHETIC_SCOUT_TICKETS,
  syntheticTicketGmailUrl,
  type SyntheticScoutTicket,
} from "@/lib/scout/syntheticFixtures";

type ScoutSeedClient = Pick<PrismaClient, "$transaction" | "scoutTicket" | "scoutTicketMessage">;

function hoursAgo(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function ticketTimes(fixture: SyntheticScoutTicket, now: Date) {
  const stamps = fixture.messages.map((message) => hoursAgo(now, message.hoursAgo));
  const first = stamps.reduce((earliest, stamp) => (stamp < earliest ? stamp : earliest));
  const last = stamps.reduce((latest, stamp) => (stamp > latest ? stamp : latest));
  const latestMessage = fixture.messages.reduce((best, message) =>
    message.hoursAgo < best.hoursAgo ? message : best,
  );
  const earliestMessage = fixture.messages.reduce((best, message) =>
    message.hoursAgo > best.hoursAgo ? message : best,
  );
  return { first, last, latestMessage, earliestMessage };
}

/** Upserts the synthetic threads only. Real Gmail threads are left alone. */
export async function seedSyntheticScoutTickets(db: ScoutSeedClient, now = new Date()) {
  let upserted = 0;
  for (const fixture of SYNTHETIC_SCOUT_TICKETS) {
    const { first, last, latestMessage, earliestMessage } = ticketTimes(fixture, now);
    const messages = fixture.messages.map((message) => ({
      gmailMessageId: message.gmailMessageId,
      senderEmail: message.senderEmail,
      senderName: message.senderName,
      receivedAt: hoursAgo(now, message.hoursAgo),
      snippet: message.snippet,
    }));

    await db.$transaction(async (tx) => {
      await tx.scoutTicketMessage.deleteMany({
        where: { gmailMessageId: { in: messages.map((message) => message.gmailMessageId) } },
      });
      await tx.scoutTicket.upsert({
        where: {
          mailbox_gmailThreadId: {
            mailbox: SCOUT_MAILBOX,
            gmailThreadId: fixture.gmailThreadId,
          },
        },
        create: {
          mailbox: SCOUT_MAILBOX,
          gmailThreadId: fixture.gmailThreadId,
          subject: fixture.subject,
          senderEmail: earliestMessage.senderEmail,
          senderName: earliestMessage.senderName,
          firstMessageAt: first,
          lastMessageAt: last,
          snippet: latestMessage.snippet,
          gmailUrl: syntheticTicketGmailUrl(fixture.gmailThreadId),
          status: fixture.status,
          orgTag: fixture.orgTag,
          notes: fixture.notes,
          messages: { create: messages },
        },
        update: {
          subject: fixture.subject,
          senderEmail: earliestMessage.senderEmail,
          senderName: earliestMessage.senderName,
          firstMessageAt: first,
          lastMessageAt: last,
          snippet: latestMessage.snippet,
          gmailUrl: syntheticTicketGmailUrl(fixture.gmailThreadId),
          status: fixture.status,
          orgTag: fixture.orgTag,
          notes: fixture.notes,
          messages: { create: messages },
        },
      });
    });
    upserted += 1;
  }
  return { upserted };
}
