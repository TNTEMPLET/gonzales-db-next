import { SCOUT_ATTENTION_STATUSES, SCOUT_MAILBOX } from "@/lib/scout/config";
import prisma from "@/lib/prisma";
import { isScoutOperator } from "@/lib/scout/access";
import { scoutFilteredAttentionWhere, scoutTicketListWhere } from "@/lib/scout/listQuery";
import { scoutSyntheticSeedBlockReason } from "@/lib/scout/seedGuard";
import { SCOUT_STORAGE_NOT_READY } from "@/lib/scout/storageError";
import { parseScoutListFilters, type ScoutListFilters } from "@/lib/scout/ticketPatch";
import type { ScoutPageModel, ScoutTicketDetail, ScoutTicketListItem } from "@/lib/scout/view";

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
    const where = scoutTicketListWhere(filters);
    const attentionWhere = scoutFilteredAttentionWhere(filters);

    const [rows, state, attentionCount, selectedRow] = await Promise.all([
      prisma.scoutTicket.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        take: 200,
      }),
      prisma.scoutSyncState.findUnique({ where: { mailbox: SCOUT_MAILBOX } }),
      attentionWhere
        ? prisma.scoutTicket.count({ where: attentionWhere })
        : Promise.resolve(0),
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
    return emptyModel(filters, SCOUT_STORAGE_NOT_READY);
  }
}

/** Inbox-wide new/open count for the sidebar badge. Ignores list filters. */
export async function loadScoutAttentionCount(): Promise<number> {
  return prisma.scoutTicket.count({
    where: { mailbox: SCOUT_MAILBOX, status: { in: [...SCOUT_ATTENTION_STATUSES] } },
  });
}

/** First paint for the Tickets nav item. Other admins get no link and no badge. */
export async function loadScoutNavSeed(email: string | null | undefined): Promise<{
  operator: boolean;
  attentionCount: number;
}> {
  if (!isScoutOperator(email)) return { operator: false, attentionCount: 0 };
  try {
    return { operator: true, attentionCount: await loadScoutAttentionCount() };
  } catch (err) {
    console.error("[scout] nav count failed", err instanceof Error ? err.name : "unknown");
    return { operator: true, attentionCount: 0 };
  }
}
