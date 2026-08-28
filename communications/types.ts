import type {
  AdminRole,
  CoachingInterestStatus,
  CommunicationAudienceLogicalMode,
  CommunicationAudienceRuleType,
} from "@prisma/client";

import type { RawContactInput } from "./rawContacts";

export type AudienceRuleInput = {
  ruleType: CommunicationAudienceRuleType;
  organizationId?: string | null;
  adminRole?: AdminRole | null;
  coachingInterestStatus?: CoachingInterestStatus | null;
  /** When ruleType is EXPLICIT_USERS — RegisteredUser ids (max enforced at API). */
  explicitRegisteredUserIds?: string[] | null;
  /** When ruleType is EXPLICIT_CONTACTS — raw email/name pairs (max enforced at API). */
  explicitContacts?: RawContactInput[] | null;
};

/** Hard cap for Users-page multi-select / EXPLICIT_USERS campaigns. */
export const EXPLICIT_USERS_MAX = 500;

export type AudienceResolutionMode = CommunicationAudienceLogicalMode;

export type AudienceRecipient = {
  recipientType: "REGISTERED_USER" | "ADMIN_USER" | "COACHING_INTEREST" | "RAW_CONTACT";
  registeredUserId: string | null;
  adminUserId: string | null;
  coachingInterestSubmissionId: string | null;
  organizationId: string | null;
  email: string | null;
  phone: string | null;
  isCoach: boolean;
  adminRole: AdminRole | null;
  matchReasons: string[];
  /** Display name for RAW_CONTACT rows; null for every other recipientType. */
  contactName: string | null;
  /** Generic provenance for RAW_CONTACT rows (e.g. "SPONSOR"); null otherwise. */
  sourceType: string | null;
  sourceId: string | null;
};

export type AudienceResolutionResult = {
  recipients: AudienceRecipient[];
  total: number;
};
