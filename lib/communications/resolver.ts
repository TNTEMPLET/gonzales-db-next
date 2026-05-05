import type { AdminRole, CommunicationAudienceLogicalMode, CommunicationAudienceRuleType } from "@prisma/client";

import prisma from "@/lib/prisma";

import type {
  AudienceRecipient,
  AudienceResolutionResult,
  AudienceRuleInput,
} from "./types";

type RecipientBucket = Map<string, AudienceRecipient>;

function recipientKey(recipientType: "REGISTERED_USER" | "ADMIN_USER", id: string) {
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
  const users = await prisma.registeredUser.findMany({
    where: {
      organizationId: whereOrg,
      isBlocked: false,
      isCoach: whereCoach,
    },
    select: {
      id: true,
      organizationId: true,
      email: true,
      contactPhone: true,
      isCoach: true,
    },
  });

  return users.map((user) => ({
    recipientType: "REGISTERED_USER",
    registeredUserId: user.id,
    adminUserId: null,
    organizationId: user.organizationId,
    email: user.email,
    phone: user.contactPhone ?? null,
    isCoach: user.isCoach,
    adminRole: null,
    matchReasons: [rule.ruleType],
  }));
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
    organizationId: admin.org,
    email: admin.email,
    phone: null,
    isCoach: false,
    adminRole: admin.role,
    matchReasons: [`ADMIN_ROLE:${rule.adminRole}`],
  }));
}

async function resolveRuleRecipients(rule: AudienceRuleInput): Promise<AudienceRecipient[]> {
  switch (rule.ruleType as CommunicationAudienceRuleType) {
    case "ALL_USERS":
    case "ORGANIZATION":
    case "ALL_COACHES":
    case "ORGANIZATION_COACHES":
      return fetchRegisteredCandidates(rule);
    case "ADMIN_ROLE":
      return fetchAdminRoleCandidates(rule);
    default:
      return [];
  }
}

function toBucket(rows: AudienceRecipient[]): RecipientBucket {
  const map: RecipientBucket = new Map();
  for (const row of rows) {
    const id = row.registeredUserId || row.adminUserId;
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
