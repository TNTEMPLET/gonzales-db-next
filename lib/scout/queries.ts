import { SCOUT_ATTENTION_STATUSES, SCOUT_MAILBOX } from "@/lib/scout/config";
import prisma from "@/lib/prisma";
import { scoutSyntheticSeedBlockReason } from "@/lib/scout/seedGuard";
import { parseScoutListFilters, type ScoutListFilters } from "@/lib/scout/ticketPatch";
import type { ScoutPageModel, ScoutTicketDetail, ScoutTicketListItem } from "@/lib/scout/view";

const STORAGE_MESSAGE = "Scout storage is not ready yet.";

function emptyModel(filters: ScoutListFilters, storageMessage: string | null): ScoutPageModel {
  return {
    tickets: [],
    selected: null,
    sync: { lastRunAt: null, lastSuccessAt: null, lastError: null, backfillPending: false },
    attentionCount: 0,
    seedAllowed: scoutSyntheticSeedBlockReason(process.env) === null,
    storageMessage,
    filters: {
      status: filters.status,
      orgTag: filters.orgTag,
      sender: filters.sender,
    },
  };
}

function toListItem(row: {
  id: string;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  lastMessageAt: Date;
  status: ScoutTicketListItem["status"];
  orgTag: ScoutTicketListItem["orgTag"];
  snippet: string;
}): ScoutTicketListItem {
  return {
    id: row.id,
    subject: row.subject,
    senderEmail: row.senderEmail,
    senderName: row.senderName,
    lastMessageAt: row.lastMessageAt.toISOString(),
    status: row.status,
    orgTag: row.orgTag,
    snippet: row.snippet,
  };
}

export async function loadScoutPage(input: {
  status?: string | null;
  orgTag?: string | null;
  sender?: string | null;
  ticketId?: string | null;
}): Promise<ScoutPageModel> {
  const filters = parseScoutListFilters(input);
  try {
    const where = {
      mailbox: SCOUT_MAILBOX,
      ...(filters.status === "all" ? {} : { status: filters.status }),
      ...(filters.orgTag === "all" ? {} : filters.orgTag === "none" ? { orgTag: null } : { orgTag: filters.orgTag }),
      ...(filters.sender
        ? { senderEmail: { contains: filters.sender, mode: "insensitive" as const } }
        : {}),
    };

    const [rows, state, attentionCount, selectedRow] = await Promise.all([
      prisma.scoutTicket.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: 200,
      }),
      prisma.scoutSyncState.findUnique({ where: { mailbox: SCOUT_MAILBOX } }),
      prisma.scoutTicket.count({
        where: { mailbox: SCOUT_MAILBOX, status: { in: [...SCOUT_ATTENTION_STATUSES] } },
      }),
      input.ticketId
        ? prisma.scoutTicket.findFirst({
            where: { id: input.ticketId, mailbox: SCOUT_MAILBOX },
            include: { messages: { orderBy: { receivedAt: "asc" } } },
          })
        : Promise.resolve(null),
    ]);

    const selected: ScoutTicketDetail | null = selectedRow
      ? {
          ...toListItem(selectedRow),
          gmailUrl: selectedRow.gmailUrl,
          notes: selectedRow.notes ?? "",
          firstMessageAt: selectedRow.firstMessageAt.toISOString(),
          messages: selectedRow.messages.map((message) => ({
            id: message.id,
            senderEmail: message.senderEmail,
            senderName: message.senderName,
            receivedAt: message.receivedAt.toISOString(),
            snippet: message.snippet,
          })),
        }
      : null;

    return {
      tickets: rows.map(toListItem),
      selected,
      sync: {
        lastRunAt: state?.lastRunAt?.toISOString() ?? null,
        lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
        lastError: state?.lastError ?? null,
        backfillPending: Boolean(state?.cursor),
      },
      attentionCount,
      seedAllowed: scoutSyntheticSeedBlockReason(process.env) === null,
      storageMessage: null,
      filters: {
        status: filters.status,
        orgTag: filters.orgTag,
        sender: filters.sender,
      },
    };
  } catch (err) {
    console.error("[scout] page load failed", err instanceof Error ? err.name : "unknown");
    return emptyModel(filters, STORAGE_MESSAGE);
  }
}

export async function loadScoutAttentionCount(): Promise<number> {
  return prisma.scoutTicket.count({
    where: { mailbox: SCOUT_MAILBOX, status: { in: [...SCOUT_ATTENTION_STATUSES] } },
  });
}
