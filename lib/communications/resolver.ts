import type { AdminRole, CommunicationAudienceLogicalMode, CommunicationAudienceRuleType } from "@prisma/client";

import prisma from "@/lib/prisma";

import { normalizeRawContacts } from "./rawContacts";
import type {
  AudienceRecipient,
  AudienceResolutionResult,
  AudienceRuleInput,
} from "./types";

type RecipientBucket = Map<string, AudienceRecipient>;

function recipientKey(recipientType: AudienceRecipient["recipientType"], id: string) {
  return `${recipientType}:${id}`;
}

function roleAtLeast(role: AdminRole | null | undefined, minimum: AdminRole | null | undefined) {
  if (!role || !minimum) return false;
  const rank: Record<AdminRole, number> = {
    PARK_DIRECTOR: 1,
    BOARD_MEMBER: 2,
    ADMIN: 3,
    MASTER_ADMIN: 4,
  };
  return rank[role] >= rank[minimum];
}

async function fetchRegisteredCandidates(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  const whereOrg =
    rule.ruleType === "ORGANIZATION" || rule.ruleType === "ORGANIZATION_COACHES"
      ? rule.organizationId ?? undefined
      : undefined;
  const whereCoach =
    rule.ruleType === "ALL_COACHES" || rule.ruleType === "ORGANIZATION_COACHES"
      ? true
      : undefined;
  // Global users that have a profile in the org (and optional coach filter via profile).
  const profiles = await (prisma as any).registeredUserOrgProfile.findMany({
    where: {
      organizationId: whereOrg,
      registeredUser: { isBlocked: false },
      ...(whereCoach ? { isCoach: true } : {}),
    },
    include: {
      registeredUser: {
        select: { id: true, email: true, contactPhone: true },
      },
    },
  });

  return profiles.map((p: any) => ({
    recipientType: "REGISTERED_USER",
    registeredUserId: p.registeredUserId,
    adminUserId: null,
    coachingInterestSubmissionId: null,
    organizationId: p.organizationId,
    email: p.registeredUser.email,
    phone: p.registeredUser.contactPhone ?? null,
    isCoach: p.isCoach,
    adminRole: null,
    matchReasons: [rule.ruleType],
    contactName: null,
    sourceType: null,
    sourceId: null,
  }));
}

async function fetchExplicitUserCandidates(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  const ids = Array.from(
    new Set((rule.explicitRegisteredUserIds || []).map((id) => id.trim()).filter(Boolean)),
  );
  if (ids.length === 0) return [];

  const targetOrg = rule.organizationId ?? undefined;

  const users = await prisma.registeredUser.findMany({
    where: {
      id: { in: ids },
      isBlocked: false,
    },
    select: {
      id: true,
      email: true,
      contactPhone: true,
    },
  });

  // For each explicit user, resolve their org profile (if any) for the rule's org to get isCoach.
  const results: AudienceRecipient[] = [];
  for (const u of users) {
    let isCoach = false;
    let orgForRow: string | null = null;
    if (targetOrg) {
      const prof = await (prisma as any).registeredUserOrgProfile.findUnique({
        where: {
          registeredUserId_organizationId: { registeredUserId: u.id, organizationId: targetOrg },
        },
        select: { isCoach: true, organizationId: true },
      });
      if (prof) {
        isCoach = !!prof.isCoach;
        orgForRow = prof.organizationId;
      }
    }
    results.push({
      recipientType: "REGISTERED_USER" as const,
      registeredUserId: u.id,
      adminUserId: null,
      coachingInterestSubmissionId: null,
      organizationId: orgForRow,
      email: u.email,
      phone: u.contactPhone ?? null,
      isCoach,
      adminRole: null,
      matchReasons: ["EXPLICIT_USERS"],
      contactName: null,
      sourceType: null,
      sourceId: null,
    });
  }
  return results;
}

async function fetchAdminRoleCandidates(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  if (!rule.adminRole) return [];

  const [memberships, masters] = await Promise.all([
    prisma.adminOrgMembership.findMany({
      where: {
        ...(rule.organizationId ? { organizationId: rule.organizationId } : {}),
      },
      include: {
        adminUser: true,
      },
    }),
    prisma.adminUser.findMany({
      where: { isMaster: true },
    }),
  ]);

  const rows: Array<{
    id: string;
    email: string;
    role: AdminRole;
    org: string | null;
  }> = memberships
    .filter((m) => roleAtLeast(m.role as AdminRole, rule.adminRole ?? null))
    .map((m) => ({
      id: m.adminUser.id,
      email: m.adminUser.email,
      role: (m.adminUser.isMaster ? "MASTER_ADMIN" : m.role) as AdminRole,
      org: m.organizationId,
    }));

  for (const master of masters) {
    if (rule.organizationId) {
      rows.push({
        id: master.id,
        email: master.email,
        role: "MASTER_ADMIN",
        org: rule.organizationId,
      });
    } else {
      rows.push({
        id: master.id,
        email: master.email,
        role: "MASTER_ADMIN",
        org: null,
      });
    }
  }

  const dedup = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!dedup.has(row.id)) dedup.set(row.id, row);
  }

  return Array.from(dedup.values()).map((admin) => ({
    recipientType: "ADMIN_USER",
    registeredUserId: null,
    adminUserId: admin.id,
    coachingInterestSubmissionId: null,
    organizationId: admin.org,
    email: admin.email,
    phone: null,
    isCoach: false,
    adminRole: admin.role,
    matchReasons: [`ADMIN_ROLE:${rule.adminRole}`],
    contactName: null,
    sourceType: null,
    sourceId: null,
  }));
}

async function fetchCoachingInterestCandidates(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  const organizationId = rule.organizationId ?? undefined;
  const rows = await prisma.coachingInterestSubmission.findMany({
    where: {
      organizationId,
      status: rule.coachingInterestStatus ?? {
        in: ["NEW", "CONTACTED"],
      },
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      cellPhone: true,
      status: true,
    },
  });

  return rows.map((row) => ({
    recipientType: "COACHING_INTEREST",
    registeredUserId: null,
    adminUserId: null,
    coachingInterestSubmissionId: row.id,
    organizationId: row.organizationId,
    email: row.email,
    phone: row.cellPhone,
    isCoach: false,
    adminRole: null,
    matchReasons: [`COACHING_INTEREST:${row.status}`],
    contactName: null,
    sourceType: null,
    sourceId: null,
  }));
}

/**
 * EXPLICIT_CONTACTS — raw email/name pairs supplied directly by the caller
 * (Sponsors, Team roster guardians, Coaching Interest per-record selection,
 * All-Star ballot invites, Shirt/Cap Orders manual recipients). No DB lookup:
 * the caller already resolved these from its own source record.
 */
function fetchExplicitContactCandidates(rule: AudienceRuleInput): AudienceRecipient[] {
  const { contacts } = normalizeRawContacts(rule.explicitContacts);
  return contacts.map((contact) => ({
    recipientType: "RAW_CONTACT",
    registeredUserId: null,
    adminUserId: null,
    coachingInterestSubmissionId: null,
    organizationId: rule.organizationId ?? null,
    email: contact.email,
    phone: null,
    isCoach: false,
    adminRole: null,
    matchReasons: ["EXPLICIT_CONTACTS"],
    contactName: contact.name ?? null,
    sourceType: contact.sourceType ?? null,
    sourceId: contact.sourceId ?? null,
  }));
}

async function resolveRuleRecipients(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  switch (rule.ruleType as CommunicationAudienceRuleType) {
    case "ALL_USERS":
    case "ORGANIZATION":
    case "ALL_COACHES":
    case "ORGANIZATION_COACHES":
      return fetchRegisteredCandidates(rule);
    case "EXPLICIT_USERS":
      return fetchExplicitUserCandidates(rule);
    case "EXPLICIT_CONTACTS":
      return fetchExplicitContactCandidates(rule);
    case "COACHING_INTEREST":
      return fetchCoachingInterestCandidates(rule);
    case "ADMIN_ROLE":
      return fetchAdminRoleCandidates(rule);
    default:
      return [];
  }
}

function toBucket(rows: AudienceRecipient[]): RecipientBucket {
  const map: RecipientBucket = new Map();
  for (const row of rows) {
    const id =
      row.registeredUserId ||
      row.adminUserId ||
      row.coachingInterestSubmissionId ||
      (row.recipientType === "RAW_CONTACT" ? row.email?.trim().toLowerCase() : null);
    if (!id) continue;
    map.set(recipientKey(row.recipientType, id), row);
  }
  return map;
}

function mergeRecipientReason(target: AudienceRecipient, reasonRows: AudienceRecipient[]) {
  const set = new Set(target.matchReasons);
  for (const row of reasonRows) {
    for (const r of row.matchReasons) set.add(r);
  }
  target.matchReasons = Array.from(set);
}

export async function resolveAudienceRecipients(options: {
  rules: AudienceRuleInput[];
  logicalMode: CommunicationAudienceLogicalMode;
}): Promise<AudienceResolutionResult> {
  const { rules, logicalMode } = options;
  if (rules.length === 0) return { recipients: [], total: 0 };

  const resolved = await Promise.all(rules.map((rule) => resolveRuleRecipients(rule)));
  const buckets = resolved.map((rows) => toBucket(rows));
  if (buckets.length === 0) return { recipients: [], total: 0 };

  const out = new Map<string, AudienceRecipient>();
  if (logicalMode === "OR") {
    for (let i = 0; i < buckets.length; i++) {
      for (const [key, recipient] of buckets[i]) {
        const existing = out.get(key);
        if (!existing) {
          out.set(key, { ...recipient, matchReasons: [...recipient.matchReasons] });
        } else {
          mergeRecipientReason(existing, [recipient]);
        }
      }
    }
  } else {
    const [first, ...rest] = buckets;
    for (const [key, recipient] of first) {
      if (rest.every((b) => b.has(key))) {
        const merged = { ...recipient, matchReasons: [...recipient.matchReasons] };
        for (const b of rest) {
          const hit = b.get(key);
          if (hit) mergeRecipientReason(merged, [hit]);
        }
        out.set(key, merged);
      }
    }
  }

  const recipients = Array.from(out.values()).sort((a, b) =>
    (a.email || "").localeCompare(b.email || "", undefined, { sensitivity: "base" }),
  );
  return { recipients, total: recipients.length };
}
