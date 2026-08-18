import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    // respondentOrg/division filter the responses used for aggregates below
    // (the org a Spring respondent self-selected — gonzales/ascension/
    // fallball — not to be confused with auth.orgId, the admin's own
    // authorized tenant scope, which is enforced separately and always).
    const respondentOrgFilter = request.nextUrl.searchParams.get("respondentOrg");
    const divisionFilter = request.nextUrl.searchParams.get("division");

    // Scope to the org ensureAdminModule already validated the caller
    // against — without this, any admin who knows/guesses a survey id can
    // read another tenant's full results, including free-text answers and
    // respondent emails.
    //
    // Master admins can reach any survey by id regardless of org (same
    // reasoning as app/api/admin/surveys/route.ts) — non-master admins
    // stay strictly locked to auth.orgId.
    const survey = await prisma.survey.findFirst({
      where: isMasterAdminActor(auth) ? { id } : { id, organizationId: auth.orgId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
        responses: {
          orderBy: { submittedAt: "desc" },
          include: {
            answers: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // Full, unfiltered lists so the admin UI's filter dropdowns always show
    // every real option, even while a filter is applied.
    const availableOrganizations = Array.from(
      new Set(survey.responses.map((r) => r.organizationId).filter((v): v is string => Boolean(v))),
    ).sort();
    const availableDivisions = Array.from(
      new Set(
        survey.responses
          .flatMap((r) => [r.divisionName, r.ageGroup])
          .filter((v): v is string => Boolean(v)),
      ),
    ).sort();

    const filteredResponses = survey.responses.filter((r) => {
      if (respondentOrgFilter && r.organizationId !== respondentOrgFilter) return false;
      if (divisionFilter && r.divisionName !== divisionFilter && r.ageGroup !== divisionFilter) return false;
      return true;
    });

    // Process analytics aggregates (on the filtered set)
    const totalResponses = filteredResponses.length;

    // Calculate Matrix Averages per Category/Topic
    const matrixScores: Record<string, { sum: number; count: number; avg: number }> = {};
    const priorityCounts: Record<string, number> = {};

    filteredResponses.forEach((resp) => {
      resp.answers.forEach((ans) => {
        if (ans.matrixTopic && ans.numberValue !== null && ans.numberValue !== undefined) {
          if (!matrixScores[ans.matrixTopic]) {
            matrixScores[ans.matrixTopic] = { sum: 0, count: 0, avg: 0 };
          }
          matrixScores[ans.matrixTopic].sum += ans.numberValue;
          matrixScores[ans.matrixTopic].count += 1;
        }

        if (ans.question.questionText.includes("#1 priority") && ans.stringValue) {
          priorityCounts[ans.stringValue] = (priorityCounts[ans.stringValue] || 0) + 1;
        }
      });
    });

    Object.keys(matrixScores).forEach((topic) => {
      matrixScores[topic].avg =
        Math.round((matrixScores[topic].sum / matrixScores[topic].count) * 10) / 10;
    });

    return NextResponse.json({
      survey,
      totalResponses,
      matrixScores,
      priorityCounts,
      availableOrganizations,
      availableDivisions,
      appliedFilters: { respondentOrg: respondentOrgFilter, division: divisionFilter },
    });
  } catch (error) {
    console.error("Error computing survey analytics:", error);
    return NextResponse.json(
      { error: "Failed to compute survey analytics" },
      { status: 500 }
    );
  }
}
