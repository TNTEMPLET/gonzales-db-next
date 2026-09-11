import type { CommunicationAudienceRuleType } from "@prisma/client";

import { isDivisionRuleType, normalizeAgeGroups } from "./divisionAudience";
import { EXPLICIT_CONTACTS_MAX, normalizeRawContacts, type RawContactInput } from "./rawContacts";
import { EXPLICIT_USERS_MAX, type AudienceRuleInput } from "./types";

export type CampaignRuleBody = {
  ruleType: CommunicationAudienceRuleType;
  organizationId?: string | null;
  adminRole?: AudienceRuleInput["adminRole"];
  coachingInterestStatus?: AudienceRuleInput["coachingInterestStatus"];
  explicitRegisteredUserIds?: string[] | null;
  explicitContacts?: RawContactInput[] | null;
  ageGroups?: string[] | null;
  seasonYear?: number | null;
};

export function parseCampaignRuleBody(rule: CampaignRuleBody): AudienceRuleInput {
  return {
    ruleType: rule.ruleType,
    organizationId: rule.organizationId ?? null,
    adminRole: rule.adminRole ?? null,
    coachingInterestStatus: rule.coachingInterestStatus ?? null,
    explicitRegisteredUserIds: rule.explicitRegisteredUserIds ?? null,
    explicitContacts: rule.explicitContacts ?? null,
    ageGroups: normalizeAgeGroups(rule.ageGroups),
    seasonYear: typeof rule.seasonYear === "number" ? rule.seasonYear : null,
  };
}

export function validateCampaignRules(rules: AudienceRuleInput[]): string | null {
  for (const rule of rules) {
    const ids = rule.explicitRegisteredUserIds || [];
    if (rule.ruleType === "EXPLICIT_USERS" && ids.length > EXPLICIT_USERS_MAX) {
      return `Too many recipients (max ${EXPLICIT_USERS_MAX})`;
    }
    const contacts = rule.explicitContacts || [];
    if (rule.ruleType === "EXPLICIT_CONTACTS" && contacts.length > EXPLICIT_CONTACTS_MAX) {
      return `Too many recipients (max ${EXPLICIT_CONTACTS_MAX})`;
    }
    if (isDivisionRuleType(rule.ruleType)) {
      if (!rule.organizationId) return "Division audience requires an organization";
      if (!rule.seasonYear) return "Division audience requires a season year";
      if (normalizeAgeGroups(rule.ageGroups).length === 0) {
        return "Pick at least one division";
      }
    }
  }
  return null;
}

export function toAudienceRuleWrite(rule: AudienceRuleInput) {
  const division = isDivisionRuleType(rule.ruleType);
  return {
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
    ...(rule.ruleType === "EXPLICIT_CONTACTS"
      ? { explicitContacts: normalizeRawContacts(rule.explicitContacts).contacts }
      : {}),
    ageGroups: division ? normalizeAgeGroups(rule.ageGroups) : [],
    seasonYear: division ? rule.seasonYear ?? null : null,
  };
}
