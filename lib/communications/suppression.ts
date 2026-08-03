import prisma from "@/lib/prisma";

/**
 * Checks EmailSuppression for a given address, matching either a suppression
 * scoped to this exact organization OR a global suppression (organizationId
 * null). Extracted from lib/communications/sender.ts so the campaign-send path
 * and any other governed sender (e.g. lib/communications/orderReportEmail.ts)
 * share one rule instead of diverging.
 *
 * Previously (sender.ts inline) this only checked organizationId === campaign's
 * own org, so a globally-suppressed address wasn't caught for an org-scoped
 * campaign. Broadened here to also match global suppressions — strictly more
 * conservative (can only block more sends, never allow one that should've been
 * blocked).
 */
export async function isEmailSuppressed(
  email: string,
  organizationId: string | null,
): Promise<boolean> {
  const suppressed = await prisma.emailSuppression.findFirst({
    where: {
      email,
      OR: [{ organizationId: null }, { organizationId }],
    },
    select: { id: true },
  });
  return Boolean(suppressed);
}
