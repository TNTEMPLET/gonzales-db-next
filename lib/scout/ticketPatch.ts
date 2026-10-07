import {
  SCOUT_NOTES_MAX,
  isScoutOrgTag,
  isScoutTicketStatus,
  type ScoutOrgTag,
  type ScoutTicketStatus,
} from "@/lib/scout/config";

export type ScoutTicketPatch = {
  status?: ScoutTicketStatus;
  orgTag?: ScoutOrgTag | null;
  notes?: string | null;
};

export type ScoutListFilters = {
  status: ScoutTicketStatus | "all";
  orgTag: ScoutOrgTag | "all" | "none";
  sender: string;
};

export function parseScoutTicketPatch(
  body: unknown,
): { ok: true; data: ScoutTicketPatch } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid request" };
  const record = body as Record<string, unknown>;
  const data: ScoutTicketPatch = {};

  if ("status" in record) {
    if (typeof record.status !== "string" || !isScoutTicketStatus(record.status)) {
      return { ok: false, error: "Invalid status" };
    }
    data.status = record.status;
  }

  if ("orgTag" in record) {
    if (record.orgTag === null || record.orgTag === "") {
      data.orgTag = null;
    } else if (typeof record.orgTag === "string" && isScoutOrgTag(record.orgTag)) {
      data.orgTag = record.orgTag;
    } else {
      return { ok: false, error: "Invalid org tag" };
    }
  }

  if ("notes" in record) {
    if (record.notes === null) {
      data.notes = null;
    } else if (typeof record.notes !== "string") {
      return { ok: false, error: "Invalid notes" };
    } else if (record.notes.length > SCOUT_NOTES_MAX) {
      return { ok: false, error: "Notes are too long" };
    } else {
      data.notes = record.notes;
    }
  }

  if (data.status === undefined && data.orgTag === undefined && data.notes === undefined) {
    return { ok: false, error: "Nothing to update" };
  }

  return { ok: true, data };
}

export function parseScoutListFilters(input: {
  status?: string | null;
  orgTag?: string | null;
  sender?: string | null;
}): ScoutListFilters {
  const status = input.status && isScoutTicketStatus(input.status) ? input.status : "all";
  const orgTag =
    input.orgTag === "none" ? "none" : input.orgTag && isScoutOrgTag(input.orgTag) ? input.orgTag : "all";
  const sender = (input.sender ?? "").trim().slice(0, 200);
  return { status, orgTag, sender };
}
