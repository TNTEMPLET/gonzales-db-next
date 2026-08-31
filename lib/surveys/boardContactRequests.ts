import "server-only";

import prisma from "@/lib/prisma";

export type BoardContactRequest = {
  id: string;
  phone: string | null;
  email: string | null;
  organizationId: string | null;
  divisionName: string | null;
  submittedAt: string;
  contactedAt: string | null;
  surveyId: string;
  surveyTitle: string;
  seasonYear: number;
};

/**
 * Cross-survey list of parents who opted in to "would you like to be
 * contacted by the AP Baseball Board?" (SurveyResponse.wantsBoardContact).
 * Single source of truth for both the admin Surveys "Board Contact
 * Requests" tab and the dashboard's summary widget -- previously this list
 * only existed inline, per-survey, inside the results route.
 *
 * `surveyOrganizationId` is the tenant boundary (which org's survey this
 * is -- omit only for a master admin's cross-org view). `respondentOrganizationId`
 * is a looser UI filter on which org the *respondent* self-selected inside
 * the survey (a single survey can collect responses tagged to any org) --
 * same distinction app/api/admin/surveys/[id]/results/route.ts draws
 * between `auth.orgId` and `respondentOrg`. Never conflate the two: using
 * the respondent's self-reported org as the tenant boundary would let a
 * non-master admin read another org's survey responses.
 */
export async function getBoardContactRequests(input: {
  surveyOrganizationId?: string | null;
  respondentOrganizationId?: string | null;
  seasonYear?: number | null;
  onlyOpen?: boolean;
} = {}): Promise<BoardContactRequest[]> {
  const { surveyOrganizationId, respondentOrganizationId, seasonYear, onlyOpen } = input;

  const responses = await prisma.surveyResponse.findMany({
    where: {
      wantsBoardContact: true,
      ...(respondentOrganizationId ? { organizationId: respondentOrganizationId } : {}),
      ...(onlyOpen ? { contactedAt: null } : {}),
      survey: {
        ...(surveyOrganizationId ? { organizationId: surveyOrganizationId } : {}),
        ...(seasonYear ? { seasonYear } : {}),
      },
    },
    include: {
      survey: { select: { id: true, title: true, seasonYear: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return responses.map((r) => ({
    id: r.id,
    phone: r.contactPhone,
    email: r.respondentEmail,
    organizationId: r.organizationId,
    divisionName: r.divisionName,
    submittedAt: r.submittedAt.toISOString(),
    contactedAt: r.contactedAt ? r.contactedAt.toISOString() : null,
    surveyId: r.survey.id,
    surveyTitle: r.survey.title,
    seasonYear: r.survey.seasonYear,
  }));
}

export async function setBoardContactRequestContacted(input: {
  responseId: string;
  contacted: boolean;
  adminId: string;
}): Promise<void> {
  await prisma.surveyResponse.update({
    where: { id: input.responseId },
    data: {
      contactedAt: input.contacted ? new Date() : null,
      contactedByAdminId: input.contacted ? input.adminId : null,
    },
  });
}
