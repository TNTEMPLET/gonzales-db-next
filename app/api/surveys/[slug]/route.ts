import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

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

    const survey = await prisma.survey.findFirst({
      where: { organizationId: org, slug: slug, isPublished: true },
      include: {
        sections: {
          orderBy: { order: "asc" },
          include: {
            questions: {
              orderBy: { order: "asc" },
            },
          },
        },
      },
    });

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

    const { selectedOrg, respondentEmail, divisionName, ageGroup, answers } = body as {
      selectedOrg?: string;
      respondentEmail?: string;
      divisionName?: string;
      ageGroup?: string;
      answers: Array<{
        questionId: string;
        matrixTopic?: string;
        textValue?: string;
        numberValue?: number;
        stringValue?: string;
      }>;
    };

    const survey = await prisma.survey.findUnique({
      where: { organizationId_slug: { organizationId: org, slug }, isPublished: true },
      include: {
        sections: {
          select: {
            questions: { select: { id: true } },
          },
        },
      },
    });

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
