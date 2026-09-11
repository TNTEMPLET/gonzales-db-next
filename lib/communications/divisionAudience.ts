import type { CommunicationAudienceLogicalMode, CommunicationAudienceRuleType } from "@prisma/client";

import type { AudienceRecipient, AudienceRuleInput } from "./types";

export type DivisionWho = {
  includeCoaches: boolean;
  includeParents: boolean;
};

export type DivisionAudienceSelection = DivisionWho & {
  organizationId: string;
  seasonYear: number;
  ageGroups: string[];
};

export type DivisionAudienceSummary = {
  ageGroups: string[];
  includeCoaches: boolean;
  includeParents: boolean;
  seasonYear: number | null;
};

const RECIPIENT_TYPE_RANK: Record<AudienceRecipient["recipientType"], number> = {
  REGISTERED_USER: 0,
  ADMIN_USER: 1,
  COACHING_INTEREST: 2,
  RAW_CONTACT: 3,
};

export function normalizeAgeGroups(raw: string[] | null | undefined): string[] {
  return Array.from(
    new Set((raw || []).map((value) => value.trim()).filter(Boolean)),
  );
}

export function isDivisionRuleType(
  ruleType: CommunicationAudienceRuleType | string | null | undefined,
): ruleType is "DIVISION_COACHES" | "DIVISION_PARENTS" {
  return ruleType === "DIVISION_COACHES" || ruleType === "DIVISION_PARENTS";
}

export function logicalModeForRules(
  rules: Array<{ ruleType: string }>,
): CommunicationAudienceLogicalMode {
  return rules.some((rule) => isDivisionRuleType(rule.ruleType)) ? "OR" : "AND";
}

export function buildDivisionAudienceRules(
  selection: DivisionAudienceSelection,
): AudienceRuleInput[] {
  const ageGroups = normalizeAgeGroups(selection.ageGroups);
  if (ageGroups.length === 0) return [];
  if (!selection.includeCoaches && !selection.includeParents) return [];

  const base = {
    organizationId: selection.organizationId,
    ageGroups,
    seasonYear: selection.seasonYear,
  };
  const rules: AudienceRuleInput[] = [];
  if (selection.includeCoaches) {
    rules.push({ ...base, ruleType: "DIVISION_COACHES" });
  }
  if (selection.includeParents) {
    rules.push({ ...base, ruleType: "DIVISION_PARENTS" });
  }
  return rules;
}

export function summarizeDivisionAudience(
  rules: Array<{
    ruleType: string;
    ageGroups?: string[] | null;
    seasonYear?: number | null;
  }>,
): DivisionAudienceSummary | null {
  const divisionRules = rules.filter((rule) => isDivisionRuleType(rule.ruleType));
  if (divisionRules.length === 0) return null;
  const ageGroups = normalizeAgeGroups(divisionRules.flatMap((rule) => rule.ageGroups || []));
  const seasonYear =
    divisionRules.find((rule) => typeof rule.seasonYear === "number")?.seasonYear ?? null;
  return {
    ageGroups,
    includeCoaches: divisionRules.some((rule) => rule.ruleType === "DIVISION_COACHES"),
    includeParents: divisionRules.some((rule) => rule.ruleType === "DIVISION_PARENTS"),
    seasonYear,
  };
}

export function formatAudienceSummary(
  rules: Array<{
    ruleType: string;
    ageGroups?: string[] | null;
    adminRole?: string | null;
    coachingInterestStatus?: string | null;
  }>,
): string {
  const division = summarizeDivisionAudience(rules);
  if (division) {
    const who = [
      division.includeCoaches ? "Coaches" : null,
      division.includeParents ? "Parents" : null,
    ]
      .filter(Boolean)
      .join(" + ");
    const divisions = division.ageGroups.join(", ") || "No divisions";
    return `${divisions} · ${who || "No recipients"}`;
  }
  if (rules.length === 0) return "No audience";
  return rules
    .map((rule) => {
      if (rule.ruleType === "ADMIN_ROLE") return `Admin role ${rule.adminRole || ""}`.trim();
      if (rule.ruleType === "COACHING_INTEREST") {
        return `Coaching interest${rule.coachingInterestStatus ? ` ${rule.coachingInterestStatus}` : ""}`;
      }
      return rule.ruleType.replaceAll("_", " ").toLowerCase();
    })
    .join(" · ");
}

export type DivisionCoachRow = {
  team: { ageGroup: string; organizationId: string };
  registeredUser: {
    id: string;
    email: string | null;
    contactPhone: string | null;
  };
};

export function mapDivisionCoachRows(
  rows: DivisionCoachRow[],
  rule: Pick<AudienceRuleInput, "organizationId">,
): AudienceRecipient[] {
  return rows.map((row) => ({
    recipientType: "REGISTERED_USER",
    registeredUserId: row.registeredUser.id,
    adminUserId: null,
    coachingInterestSubmissionId: null,
    organizationId: row.team.organizationId || rule.organizationId || null,
    email: row.registeredUser.email,
    phone: row.registeredUser.contactPhone,
    isCoach: true,
    adminRole: null,
    matchReasons: [`DIVISION_COACHES:${row.team.ageGroup}`],
    contactName: null,
    sourceType: null,
    sourceId: null,
  }));
}

export type DivisionParentRow = {
  id: string;
  organizationId: string;
  ageGroup: string;
  guardianEmail: string | null;
  guardianFirstName: string | null;
  guardianLastName: string | null;
};

export function mapDivisionParentRows(
  rows: DivisionParentRow[],
  rule: Pick<AudienceRuleInput, "organizationId">,
): AudienceRecipient[] {
  const out: AudienceRecipient[] = [];
  for (const row of rows) {
    const email = row.guardianEmail?.trim() || "";
    if (!email) continue;
    const name = [row.guardianFirstName, row.guardianLastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
    out.push({
      recipientType: "RAW_CONTACT",
      registeredUserId: null,
      adminUserId: null,
      coachingInterestSubmissionId: null,
      organizationId: row.organizationId || rule.organizationId || null,
      email,
      phone: null,
      isCoach: false,
      adminRole: null,
      matchReasons: [`DIVISION_PARENTS:${row.ageGroup}`],
      contactName: name || null,
      sourceType: "ENROLLMENT_GUARDIAN",
      sourceId: row.id,
    });
  }
  return out;
}

function emailKey(email: string | null | undefined): string | null {
  const normalized = email?.trim().toLowerCase() || "";
  return normalized || null;
}

export function dedupeRecipientsByEmail(recipients: AudienceRecipient[]): AudienceRecipient[] {
  const byEmail = new Map<string, AudienceRecipient>();
  const withoutEmail: AudienceRecipient[] = [];

  for (const recipient of recipients) {
    const key = emailKey(recipient.email);
    if (!key) {
      withoutEmail.push(recipient);
      continue;
    }
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { ...recipient, matchReasons: [...recipient.matchReasons] });
      continue;
    }
    const keepNew =
      RECIPIENT_TYPE_RANK[recipient.recipientType] < RECIPIENT_TYPE_RANK[existing.recipientType];
    const kept = keepNew ? { ...recipient, matchReasons: [...recipient.matchReasons] } : existing;
    const other = keepNew ? existing : recipient;
    const reasons = new Set(kept.matchReasons);
    for (const reason of other.matchReasons) reasons.add(reason);
    kept.matchReasons = Array.from(reasons);
    byEmail.set(key, kept);
  }

  return [...byEmail.values(), ...withoutEmail];
}
