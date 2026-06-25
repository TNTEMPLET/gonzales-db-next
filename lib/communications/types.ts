import type {
  AdminRole,
  CoachingInterestStatus,
  CommunicationAudienceLogicalMode,
  CommunicationAudienceRuleType,
} from "@prisma/client";

export type AudienceRuleInput = {
  ruleType: CommunicationAudienceRuleType;
  organizationId?: string | null;
  adminRole?: AdminRole | null;
  coachingInterestStatus?: CoachingInterestStatus | null;
};

export type AudienceResolutionMode = CommunicationAudienceLogicalMode;

export type AudienceRecipient = {
  recipientType: "REGISTERED_USER" | "ADMIN_USER" | "COACHING_INTEREST";
  registeredUserId: string | null;
  adminUserId: string | null;
  coachingInterestSubmissionId: string | null;
  organizationId: string | null;
  email: string | null;
  phone: string | null;
  isCoach: boolean;
  adminRole: AdminRole | null;
  matchReasons: string[];
};

export type AudienceResolutionResult = {
  recipients: AudienceRecipient[];
  total: number;
};
