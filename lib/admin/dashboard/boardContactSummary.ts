import "server-only";

import { getBoardContactRequests, type BoardContactRequest } from "@/lib/surveys/boardContactRequests";
import type { ContentOrgId } from "@/lib/siteConfig";

export type BoardContactSummary = {
  openCount: number;
  recent: BoardContactRequest[];
};

/**
 * Thin dashboard-widget wrapper around the shared board-contact-requests
 * query (lib/surveys/boardContactRequests.ts) -- same source of truth as
 * the Surveys admin "Board Contact Requests" tab, just capped to the 5 most
 * recent open ones for the summary card.
 */
export async function getBoardContactSummary(orgs: ContentOrgId[]): Promise<BoardContactSummary> {
  // Master (all CONTENT_ORGS passed) reads across every survey; a
  // single-org admin call passes exactly one org, so query per-org and
  // merge rather than bypassing the tenant boundary with `null`.
  const perOrg = await Promise.all(
    orgs.map((organizationId) =>
      getBoardContactRequests({ surveyOrganizationId: organizationId, onlyOpen: true }),
    ),
  );
  const open = perOrg.flat().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  return {
    openCount: open.length,
    recent: open.slice(0, 5),
  };
}
