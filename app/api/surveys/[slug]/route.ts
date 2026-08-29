import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const org = request.nextUrl.searchParams.get("org");
    if (!org) {
      return NextResponse.json(
        { error: "org query parameter is required" },
        { status: 400 }
      );
    }

    // `preview=1` lets a logged-in admin load a draft (unpublished) survey
    // through this same public renderer, without opening drafts up to
    // everyone -- the flag only does anything if the request also carries a
    // valid admin session for the TEAMS module. A normal, unauthenticated
    // request behaves exactly as before: published surveys only.
    const previewRequested = request.nextUrl.searchParams.get("preview") === "1";
    let allowUnpublished = false;
    if (previewRequested) {
      const auth = await ensureAdminModule(request, "TEAMS");
      // Master admins can preview any org's draft; a scoped admin only
      // theirs -- mirrors the org check in the authenticated survey-detail
      // route rather than trusting the `org` query param on its own.
      allowUnpublished = auth.ok && (auth.admin.isMaster || auth.orgId === org);
    }

    const surveyInclude = {
      sections: {
        orderBy: { order: "asc" as const },
        include: {
          questions: {
            orderBy: { order: "asc" as const },
          },
        },
      },
    };

    // This route is public/unauthenticated by design (a parent survey form),
    // so there's no tenant-isolation concern in broadening the lookup — the
    // exact org match just picks the "expected" owner first; if it misses
    // (e.g. a visitor lands on the wrong site's URL for a cross-org survey
    // like the Spring one), fall back to any published survey with this
    // slug so the form still loads instead of 404ing.
    let survey = await prisma.survey.findFirst({
      where: { organizationId: org, slug: slug, ...(allowUnpublished ? {} : { isPublished: true }) },
      include: surveyInclude,
    });
    if (!survey) {
      survey = await prisma.survey.findFirst({
        where: { slug: slug, ...(allowUnpublished ? {} : { isPublished: true }) },
        include: surveyInclude,
      });
    }

    if (!survey) {
      return NextResponse.json(
        { error: "Survey not found or not published" },
        { status: 404 }
      );
    }

    return NextResponse.json({ survey });
  } catch (error) {
    console.error("Error fetching survey:", error);
    return NextResponse.json(
      {
        error: "Failed to load survey",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const org = request.nextUrl.searchParams.get("org");
    if (!org) {
      return NextResponse.json(
        { error: "org query parameter is required" },
        { status: 400 }
      );
    }

    const body = await request.json();

    const { selectedOrg, respondentEmail, divisionName, ageGroup, wantsBoardContact, contactPhone, answers } = body as {
      selectedOrg?: string;
      respondentEmail?: string;
      divisionName?: string;
      ageGroup?: string;
      wantsBoardContact?: boolean;
      contactPhone?: string;
      answers: Array<{
        questionId: string;
        matrixTopic?: string;
        textValue?: string;
        numberValue?: number;
        stringValue?: string;
      }>;
    };

    const responseSurveyInclude = {
      sections: {
        select: {
          questions: { select: { id: true } },
        },
      },
    };

    // Same reasoning as GET: no tenant-isolation concern on this public
    // route, so fall back to a global slug lookup if the visitor's org
    // doesn't own this survey directly.
    let survey = await prisma.survey.findUnique({
      where: { organizationId_slug: { organizationId: org, slug }, isPublished: true },
      include: responseSurveyInclude,
    });
    if (!survey) {
      survey = await prisma.survey.findFirst({
        where: { slug, isPublished: true },
        include: responseSurveyInclude,
      });
    }

    if (!survey) {
      return NextResponse.json(
        { error: "Survey not found or not published" },
        { status: 404 }
      );
    }

    // Fall surveys only ever collect Fall Ball responses — don't trust the
    // client for that, it's not a real choice. Spring surveys serve both
    // Gonzales DYB and Ascension LL, so the respondent's pick is validated
    // against the two allowed orgs for that season.
    let responseOrg: string;
    if (survey.season === "FALL") {
      responseOrg = "fallball";
    } else {
      const allowedSpringOrgs = ["gonzales", "ascension"];
      if (!selectedOrg || !allowedSpringOrgs.includes(selectedOrg)) {
        return NextResponse.json(
          { error: "selectedOrg must be one of: gonzales, ascension" },
          { status: 400 }
        );
      }
      responseOrg = selectedOrg;
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return NextResponse.json(
        { error: "At least one answer is required" },
        { status: 400 }
      );
    }

    if (wantsBoardContact && !contactPhone?.trim()) {
      return NextResponse.json(
        { error: "Please provide a phone number so the board can contact you" },
        { status: 400 }
      );
    }

    const validQuestionIds = new Set(
      survey.sections.flatMap((section) => section.questions.map((q) => q.id)),
    );
    const invalidAnswer = answers.find((ans) => !validQuestionIds.has(ans.questionId));
    if (invalidAnswer) {
      return NextResponse.json(
        { error: `Answer references a question that does not belong to this survey: ${invalidAnswer.questionId}` },
        { status: 400 }
      );
    }

    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: survey.id,
        organizationId: responseOrg,
        respondentEmail: respondentEmail || null,
        divisionName: divisionName || null,
        ageGroup: ageGroup || null,
        wantsBoardContact: Boolean(wantsBoardContact),
        contactPhone: wantsBoardContact ? contactPhone!.trim() : null,
        answers: {
          create: answers.map((ans) => ({
            questionId: ans.questionId,
            matrixTopic: ans.matrixTopic || null,
            textValue: ans.textValue || null,
            numberValue: ans.numberValue !== undefined ? Number(ans.numberValue) : null,
            stringValue: ans.stringValue || null,
          })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Thank you! Your survey response has been recorded.",
      responseId: response.id,
    });
  } catch (error) {
    console.error("Error submitting survey response:", error);
    return NextResponse.json(
      { error: "Failed to submit survey response" },
      { status: 500 }
    );
  }
}
