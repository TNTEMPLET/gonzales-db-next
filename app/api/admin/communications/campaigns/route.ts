import type { CommunicationChannel } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { resolveCommunicationActor } from "@/lib/communications/authz";
import {
  getAllowedFromAddresses,
  getDefaultFromAddress,
  resolveFromAddress,
} from "@/lib/communications/fromAddresses";
import { canSendForOrg } from "@/lib/communications/policy";
import { EXPLICIT_CONTACTS_MAX, normalizeRawContacts, type RawContactInput } from "@/lib/communications/rawContacts";
import { EXPLICIT_USERS_MAX } from "@/lib/communications/types";
import prisma from "@/lib/prisma";

type CreateCampaignBody = {
  title?: string;
  messageSubject?: string | null;
  messageBody?: string;
  /** Full From header; defaults to AP Baseball noreply. */
  fromEmail?: string | null;
  channels?: CommunicationChannel[];
  organizationId?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  /** Shortcut: create EXPLICIT_USERS rule from Users-page multi-select. */
  registeredUserIds?: string[];
  /** Shortcut: create EXPLICIT_CONTACTS rule from raw email/name pairs (Sponsors, guardians, etc). */
  contacts?: RawContactInput[];
  rules?: Array<{
    ruleType:
      | "ALL_USERS"
      | "ORGANIZATION"
      | "ALL_COACHES"
      | "ORGANIZATION_COACHES"
      | "COACHING_INTEREST"
      | "ADMIN_ROLE"
      | "EXPLICIT_USERS"
      | "EXPLICIT_CONTACTS";
    organizationId?: string | null;
    adminRole?: "MASTER_ADMIN" | "ADMIN" | "BOARD_MEMBER" | "PARK_DIRECTOR" | null;
    coachingInterestStatus?: "NEW" | "CONTACTED" | "NOT_INTERESTED" | "CONVERTED" | "ARCHIVED" | null;
    explicitRegisteredUserIds?: string[] | null;
    explicitContacts?: RawContactInput[] | null;
  }>;
};

export async function GET(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const includeGlobal = request.nextUrl.searchParams.get("includeGlobal") === "1";
  const campaigns = await prisma.communicationCampaign.findMany({
    where: includeGlobal
      ? { OR: [{ organizationId: actor.targetOrg }, { organizationId: null }] }
      : { organizationId: actor.targetOrg },
    include: {
      audienceRules: true,
      approvals: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { recipientSnapshots: true, deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const [fromOptions, defaultFrom] = await Promise.all([
    getAllowedFromAddresses(),
    getDefaultFromAddress(),
  ]);
  return NextResponse.json({
    data: campaigns,
    fromOptions,
    defaultFrom,
  });
}

export async function POST(request: NextRequest) {
  const actor = await resolveCommunicationActor(request);
  if (!actor.ok) return NextResponse.json({ error: actor.message }, { status: actor.status });

  const body = (await request.json()) as CreateCampaignBody;
  const title = body.title?.trim() || "";
  const messageBody = body.messageBody?.trim() || "";
  if (!title || !messageBody) {
    return NextResponse.json({ error: "title and messageBody are required" }, { status: 400 });
  }
  let fromEmail: string;
  try {
    fromEmail = await resolveFromAddress(body.fromEmail);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid from address" },
      { status: 400 },
    );
  }
  const channels: CommunicationChannel[] =
    Array.isArray(body.channels) && body.channels.length > 0 ? body.channels : ["EMAIL"];
  const requestedOrg =
    body.organizationId === undefined
      ? actor.targetOrg
      : body.organizationId === null
        ? null
        : body.organizationId;
  if (!canSendForOrg(actor.role, requestedOrg, actor.targetOrg)) {
    return NextResponse.json({ error: "Forbidden for selected audience scope" }, { status: 403 });
  }

  const explicitIdsFromBody = Array.from(
    new Set((body.registeredUserIds || []).map((id) => id.trim()).filter(Boolean)),
  );
  if (explicitIdsFromBody.length > EXPLICIT_USERS_MAX) {
    return NextResponse.json(
      { error: `Too many recipients (max ${EXPLICIT_USERS_MAX})` },
      { status: 400 },
    );
  }

  const { contacts: contactsFromBody, rejected: rejectedContacts } = normalizeRawContacts(
    body.contacts,
  );
  if ((body.contacts?.length || 0) > EXPLICIT_CONTACTS_MAX) {
    return NextResponse.json(
      { error: `Too many recipients (max ${EXPLICIT_CONTACTS_MAX})` },
      { status: 400 },
    );
  }
  if (explicitIdsFromBody.length > 0 && contactsFromBody.length > 0) {
    return NextResponse.json(
      { error: "Provide either registeredUserIds or contacts, not both" },
      { status: 400 },
    );
  }

  let rules = body.rules ?? [];
  if (explicitIdsFromBody.length > 0) {
    rules = [
      {
        ruleType: "EXPLICIT_USERS",
        organizationId: requestedOrg,
        explicitRegisteredUserIds: explicitIdsFromBody,
      },
    ];
  } else if (contactsFromBody.length > 0) {
    rules = [
      {
        ruleType: "EXPLICIT_CONTACTS",
        organizationId: requestedOrg,
        explicitContacts: contactsFromBody,
      },
    ];
  }

  for (const rule of rules) {
    const ids = rule.explicitRegisteredUserIds || [];
    if (rule.ruleType === "EXPLICIT_USERS" && ids.length > EXPLICIT_USERS_MAX) {
      return NextResponse.json(
        { error: `Too many recipients (max ${EXPLICIT_USERS_MAX})` },
        { status: 400 },
      );
    }
    const contacts = rule.explicitContacts || [];
    if (rule.ruleType === "EXPLICIT_CONTACTS" && contacts.length > EXPLICIT_CONTACTS_MAX) {
      return NextResponse.json(
        { error: `Too many recipients (max ${EXPLICIT_CONTACTS_MAX})` },
        { status: 400 },
      );
    }
  }

  const created = await prisma.communicationCampaign.create({
    data: {
      organizationId: requestedOrg,
      logicalMode: "AND",
      channels,
      title,
      messageSubject: body.messageSubject?.trim() || null,
      messageBody,
      fromEmail,
      quietHoursStart:
        typeof body.quietHoursStart === "number" ? Math.max(0, Math.min(23, body.quietHoursStart)) : null,
      quietHoursEnd:
        typeof body.quietHoursEnd === "number" ? Math.max(0, Math.min(23, body.quietHoursEnd)) : null,
      createdByAdminId: actor.admin.id,
      audienceRules: {
        create: rules.map((rule) => ({
          ruleType: rule.ruleType,
          organizationId: rule.organizationId ?? null,
          adminRole: rule.adminRole ?? null,
          coachingInterestStatus: rule.coachingInterestStatus ?? null,
          explicitRegisteredUserIds:
            rule.ruleType === "EXPLICIT_USERS"
              ? Array.from(
                  new Set((rule.explicitRegisteredUserIds || []).map((id) => id.trim()).filter(Boolean)),
                )
              : [],
          explicitContacts:
            rule.ruleType === "EXPLICIT_CONTACTS"
              ? normalizeRawContacts(rule.explicitContacts).contacts
              : undefined,
        })),
      },
    },
    include: {
      audienceRules: true,
    },
  });

  return NextResponse.json({
    success: true,
    data: created,
    ...(rejectedContacts > 0 ? { rejectedContacts } : {}),
  });
}
