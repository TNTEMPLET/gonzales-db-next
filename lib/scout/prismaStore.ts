import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import type { ScoutPlan } from "@/lib/scout/plan";
import type { ScoutStore, ScoutSyncPatch } from "@/lib/scout/store";

function isUniqueConstraint(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function syncUpdate(patch: ScoutSyncPatch): Prisma.ScoutSyncStateUpdateInput {
  const data: Prisma.ScoutSyncStateUpdateInput = { lastRunAt: patch.lastRunAt };
  if (patch.lastSuccessAt !== undefined) data.lastSuccessAt = patch.lastSuccessAt;
  if (patch.lastError !== undefined) data.lastError = patch.lastError;
  if (patch.lastHistoryId !== undefined) data.lastHistoryId = patch.lastHistoryId;
  if (patch.cursor !== undefined) data.cursor = patch.cursor;
  return data;
}

export const prismaScoutStore: ScoutStore = {
  async hasMessage(gmailMessageId) {
    const row = await prisma.scoutTicketMessage.findUnique({
      where: { gmailMessageId },
      select: { id: true },
    });
    return Boolean(row);
  },

  async findTicket(mailbox, gmailThreadId) {
    return prisma.scoutTicket.findUnique({
      where: { mailbox_gmailThreadId: { mailbox, gmailThreadId } },
      select: {
        id: true,
        status: true,
        subject: true,
        senderEmail: true,
        senderName: true,
        firstMessageAt: true,
        lastMessageAt: true,
        snippet: true,
      },
    });
  },

  async insertTicket(input: Extract<ScoutPlan, { type: "create" }>) {
    try {
      await prisma.scoutTicket.create({
        data: {
          mailbox: input.mailbox,
          gmailThreadId: input.gmailThreadId,
          subject: input.subject,
          senderEmail: input.senderEmail,
          senderName: input.senderName,
          firstMessageAt: input.firstMessageAt,
          lastMessageAt: input.lastMessageAt,
          snippet: input.snippet,
          gmailUrl: input.gmailUrl,
          status: input.status,
          messages: {
            create: {
              gmailMessageId: input.message.gmailMessageId,
              senderEmail: input.message.senderEmail,
              senderName: input.message.senderName,
              receivedAt: input.message.receivedAt,
              snippet: input.message.snippet,
            },
          },
        },
      });
      return "created";
    } catch (err) {
      if (isUniqueConstraint(err)) return "duplicate";
      throw err;
    }
  },

  async appendTicket(input: Extract<ScoutPlan, { type: "append" }>) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.scoutTicketMessage.create({
          data: {
            ticketId: input.ticketId,
            gmailMessageId: input.message.gmailMessageId,
            senderEmail: input.message.senderEmail,
            senderName: input.message.senderName,
            receivedAt: input.message.receivedAt,
            snippet: input.message.snippet,
          },
        });
        await tx.scoutTicket.update({
          where: { id: input.ticketId },
          data: {
            status: input.status,
            subject: input.subject,
            senderEmail: input.senderEmail,
            senderName: input.senderName,
            firstMessageAt: input.firstMessageAt,
            lastMessageAt: input.lastMessageAt,
            snippet: input.snippet,
          },
        });
      });
      return "appended";
    } catch (err) {
      if (isUniqueConstraint(err)) return "duplicate";
      throw err;
    }
  },

  async getSyncState(mailbox) {
    const row = await prisma.scoutSyncState.findUnique({ where: { mailbox } });
    if (!row) return null;
    return {
      lastHistoryId: row.lastHistoryId,
      cursor: row.cursor,
      lastRunAt: row.lastRunAt,
      lastSuccessAt: row.lastSuccessAt,
      lastError: row.lastError,
    };
  },

  async saveSyncState(mailbox, patch) {
    await prisma.scoutSyncState.upsert({
      where: { mailbox },
      create: {
        mailbox,
        lastRunAt: patch.lastRunAt,
        lastSuccessAt: patch.lastSuccessAt ?? null,
        lastError: patch.lastError ?? null,
        lastHistoryId: patch.lastHistoryId ?? null,
        cursor: patch.cursor ?? null,
      },
      update: syncUpdate(patch),
    });
  },
};
