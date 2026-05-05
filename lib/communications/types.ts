import type { AdminRole, CommunicationAudienceLogicalMode, CommunicationAudienceRuleType } from "@prisma/client";

export type AudienceRuleInput = {
  ruleType: CommunicationAudienceRuleType;
  organizationId?: string | null;
  adminRole?: AdminRole | null;
};

export type AudienceResolutionMode = CommunicationAudienceLogicalMode;

export type AudienceRecipient = {
  recipientType: "REGISTERED_USER" | "ADMIN_USER";
  registeredUserId: string | null;
  adminUserId: string | null;
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
