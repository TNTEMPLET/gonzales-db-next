import { NextRequest, NextResponse } from "next/server";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
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

    // Scope to the org ensureAdminModule already validated the caller
    // against — without this, any admin who knows/guesses a survey id can
    // read another tenant's full results, including free-text answers and
    // respondent emails.
    const survey = await prisma.survey.findFirst({
      where: { id, organizationId: auth.orgId },
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

    // Process analytics aggregates
    const totalResponses = survey.responses.length;

    // Calculate Matrix Averages per Category/Topic
    const matrixScores: Record<string, { sum: number; count: number; avg: number }> = {};
    const priorityCounts: Record<string, number> = {};

    survey.responses.forEach((resp) => {
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
    });
  } catch (error) {
    console.error("Error computing survey analytics:", error);
    return NextResponse.json(
      { error: "Failed to compute survey analytics" },
      { status: 500 }
    );
  }
}
