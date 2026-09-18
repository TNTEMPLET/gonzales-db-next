import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule, isMasterAdminActor } from "@/lib/auth/ensureAdminModule";
import prisma from "@/lib/prisma";
import {
  summarizeSurveyResults,
  surveyResultsToCsv,
  type ResultQuestion,
} from "@/lib/surveys/summarizeResults";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await ensureAdminModule(request, "TEAMS");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const respondentOrgFilter = request.nextUrl.searchParams.get("respondentOrg");
    const divisionFilter = request.nextUrl.searchParams.get("division");
    const asCsv = request.nextUrl.searchParams.get("format") === "csv";

    const survey = await prisma.survey.findFirst({
      where: isMasterAdminActor(auth) ? { id } : { id, organizationId: auth.orgId },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            questions: { orderBy: { order: "asc" } },
          },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const questions: ResultQuestion[] = survey.sections.flatMap((section) =>
      section.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: q.options,
        matrixTopics: q.matrixTopics,
        sectionTitle: section.title,
      })),
    );

    const allMeta = await prisma.surveyResponse.findMany({
      where: { surveyId: id },
      select: { organizationId: true, divisionName: true, ageGroup: true },
    });
    const availableOrganizations = Array.from(
      new Set(allMeta.map((r) => r.organizationId).filter((v): v is string => Boolean(v))),
    ).sort();
    const availableDivisions = Array.from(
      new Set(
        allMeta.flatMap((r) => [r.divisionName, r.ageGroup]).filter((v): v is string => Boolean(v)),
      ),
    ).sort();

    const responses = await prisma.surveyResponse.findMany({
      where: {
        surveyId: id,
        ...(respondentOrgFilter ? { organizationId: respondentOrgFilter } : {}),
        ...(divisionFilter
          ? { OR: [{ divisionName: divisionFilter }, { ageGroup: divisionFilter }] }
          : {}),
      },
      orderBy: { submittedAt: "desc" },
      include: { answers: true },
    });

    const mapped = responses.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      divisionName: r.divisionName,
      ageGroup: r.ageGroup,
      respondentEmail: r.respondentEmail,
      wantsBoardContact: r.wantsBoardContact,
      contactName: r.contactName,
      contactPhone: r.contactPhone,
      contactPreferredMethod: r.contactPreferredMethod,
      contactBestTime: r.contactBestTime,
      submittedAt: r.submittedAt,
      answers: r.answers.map((a) => ({
        id: a.id,
        questionId: a.questionId,
        matrixTopic: a.matrixTopic,
        textValue: a.textValue,
        numberValue: a.numberValue,
        stringValue: a.stringValue,
      })),
    }));

    if (asCsv) {
      const csv = surveyResultsToCsv({ questions, responses: mapped });
      const filename = `${survey.slug}-results.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const summary = summarizeSurveyResults({ questions, responses: mapped });

    return NextResponse.json({
      totalResponses: summary.totalResponses,
      questions: summary.questions,
      snapshot: summary.snapshot,
      responses: summary.responses,
      contactRequests: summary.contactRequests,
      availableOrganizations,
      availableDivisions,
      appliedFilters: { respondentOrg: respondentOrgFilter, division: divisionFilter },
      survey: {
        id: survey.id,
        title: survey.title,
        slug: survey.slug,
        season: survey.season,
        seasonYear: survey.seasonYear,
        organizationId: survey.organizationId,
        isPublished: survey.isPublished,
      },
    });
  } catch (error) {
    console.error("Error computing survey analytics:", error);
    return NextResponse.json({ error: "Failed to compute survey analytics" }, { status: 500 });
  }
}
