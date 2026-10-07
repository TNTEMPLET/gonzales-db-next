import {
  SCOUT_ATTENTION_STATUSES,
  SCOUT_MAILBOX,
  type ScoutOrgTag,
  type ScoutTicketStatus,
} from "@/lib/scout/config";
import type { ScoutListFilters } from "@/lib/scout/ticketPatch";

type SenderFilter = { contains: string; mode: "insensitive" };

export type ScoutTicketListWhere = {
  mailbox: string;
  status?: ScoutTicketStatus | { in: ScoutTicketStatus[] };
  orgTag?: ScoutOrgTag | null;
  senderEmail?: SenderFilter;
};

function sharedFilters(filters: ScoutListFilters): Pick<ScoutTicketListWhere, "orgTag" | "senderEmail"> {
  return {
    ...(filters.orgTag === "all" ? {} : filters.orgTag === "none" ? { orgTag: null } : { orgTag: filters.orgTag }),
    ...(filters.sender
      ? { senderEmail: { contains: filters.sender, mode: "insensitive" as const } }
      : {}),
  };
}

export function scoutTicketListWhere(filters: ScoutListFilters): ScoutTicketListWhere {
  return {
    mailbox: SCOUT_MAILBOX,
    ...(filters.status === "all" ? {} : { status: filters.status }),
    ...sharedFilters(filters),
  };
}

/**
 * New/open tickets inside the active list filters.
 * Null means the status filter excludes new and open, so the count is zero.
 * The sidebar badge does not use this — it counts the whole inbox.
 */
export function scoutFilteredAttentionWhere(filters: ScoutListFilters): ScoutTicketListWhere | null {
  if (filters.status !== "all" && filters.status !== "NEW" && filters.status !== "OPEN") return null;
  return {
    mailbox: SCOUT_MAILBOX,
    status: filters.status === "all" ? { in: [...SCOUT_ATTENTION_STATUSES] } : filters.status,
    ...sharedFilters(filters),
  };
}

export function scoutFiltersActive(filters: { status: string; orgTag: string; sender: string }): boolean {
  return filters.status !== "all" || filters.orgTag !== "all" || filters.sender.trim() !== "";
}

/** Ticket-count line. Attention follows the same filters as the list. */
export function scoutTicketListSummary(input: {
  ticketCount: number;
  attentionCount: number;
  filtersActive: boolean;
}): string {
  const tickets = `${input.ticketCount} ${input.ticketCount === 1 ? "ticket" : "tickets"}`;
  if (input.attentionCount <= 0) return tickets;
  const attention = `${input.attentionCount} new or open`;
  return input.filtersActive ? `${tickets} · ${attention} in this view` : `${tickets} · ${attention}`;
}
