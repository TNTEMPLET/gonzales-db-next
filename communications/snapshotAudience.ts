import prisma from "@/lib/prisma";

import { resolveAudienceRecipients } from "./resolver";

/**
 * Resolve campaign audience rules into recipient snapshots (replaces prior snapshots).
 * Used by submit-approval and Master Admin send-now bypass.
 */
export async function snapshotCampaignAudience(campaignId: string) {
  const campaign = await prisma.communicationCampaign.findUnique({
    where: { id: campaignId },
    include: { audienceRules: true },
  });
  if (!campaign) {
    throw new Error("Campaign not found");
  }

  const resolved = await resolveAudienceRecipients({
    rules: campaign.audienceRules.map((rule) => ({
      ruleType: rule.ruleType,
      organizationId: rule.organizationId,
      adminRole: rule.adminRole,
      coachingInterestStatus: rule.coachingInterestStatus,
      explicitRegisteredUserIds: rule.explicitRegisteredUserIds,
      explicitContacts: (rule.explicitContacts as unknown as
        | { email: string; name?: string | null; sourceType?: string | null; sourceId?: string | null }[]
        | null) ?? null,
    })),
    logicalMode: campaign.logicalMode,
  });

  await prisma.$transaction(async (tx) => {
    await tx.communicationRecipientSnapshot.deleteMany({ where: { campaignId } });
    if (resolved.recipients.length > 0) {
      await tx.communicationRecipientSnapshot.createMany({
        data: resolved.recipients.map((row) => ({
          campaignId,
          recipientType: row.recipientType,
          registeredUserId: row.registeredUserId,
          adminUserId: row.adminUserId,
          contactName: row.contactName,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          email: row.email,
          phone: row.phone,
          matchReasons: row.matchReasons,
        })),
      });
    }
  });

  return { campaign, total: resolved.total, recipients: resolved.recipients };
}
