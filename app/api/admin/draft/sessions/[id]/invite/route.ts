import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { ensureAdminModule } from "@/lib/auth/ensureAdminModule";
import { draftApiError } from "@/lib/draft/apiError";
import { formatCentralDateTime, parseCentralDateTimeToUtc } from "@/lib/draft/centralTime";
import { getSiteConfigForOrg, isContentOrgId } from "@/lib/siteConfig";
import { getDefaultFromAddress } from "@/lib/communications/fromAddresses";
import { sendOrderReportEmail } from "@/lib/communications/orderReportEmail";

/**
 * POST { scheduledStartAtLocal?, autoDraftTeamIds?, sendEmails? }
 *
 * One combined action for the "Schedule & Invite" modal: sets the draft's
 * scheduled start (entered in Central time, stored as UTC), sets which
 * teams have auto-draft turned on, and -- if requested -- emails every
 * team's head/assistant coach the direct coach link
 * (app/coach-corner/draft/[id]) plus the scheduled time and whether
 * auto-draft is on for their team.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await ensureAdminModule(req, "DRAFT");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { scheduledStartAtLocal, autoDraftTeamIds, sendEmails } = body as {
      scheduledStartAtLocal?: string | null;
      autoDraftTeamIds?: string[];
      sendEmails?: boolean;
    };

    const session = await prisma.draftSession.findUnique({
      where: { id },
      include: {
        teams: {
          orderBy: { draftOrder: "asc" },
          include: {
            headCoach: { select: { name: true, email: true } },
            assistantCoach: { select: { name: true, email: true } },
          },
        },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "Draft session not found" }, { status: 404 });
    }

    const scheduledStartAt =
      scheduledStartAtLocal !== undefined
        ? parseCentralDateTimeToUtc(scheduledStartAtLocal || "")
        : session.scheduledStartAt;

    const autoDraftSet = new Set(autoDraftTeamIds ?? []);

    // Scheduling & inviting coaches is the natural "I'm done setting up"
    // signal now that this is reachable directly from the session list (not
    // just mid-draft) -- bump SETUP -> PAIRED here instead of via a raw
    // status dropdown. Never touch any other status (LIVE/PAUSED/etc.).
    await prisma.$transaction([
      prisma.draftSession.update({
        where: { id },
        data: {
          scheduledStartAt,
          ...(session.status === "SETUP" ? { status: "PAIRED" } : {}),
        },
      }),
      ...session.teams.map((team) =>
        prisma.draftTeam.update({
          where: { id: team.id },
          data: { autoDraftEnabled: autoDraftSet.has(team.id) },
        }),
      ),
    ]);

    let emailResult: { sent: number; skippedSuppressed: string[]; failed: string[]; noCoachEmail: string[] } | null =
      null;

    if (sendEmails) {
      const baseUrl = isContentOrgId(session.organizationId)
        ? getSiteConfigForOrg(session.organizationId).siteUrl
        : req.nextUrl.origin;
      const link = `${baseUrl}/coach-corner/draft/${id}`;
      const startText = scheduledStartAt ? formatCentralDateTime(scheduledStartAt) : null;
      const fromAddress = await getDefaultFromAddress();

      let sent = 0;
      const skippedSuppressed: string[] = [];
      const failed: string[] = [];
      const noCoachEmail: string[] = [];

      for (const team of session.teams) {
        const recipients = [team.headCoach?.email, team.assistantCoach?.email].filter(
          (e): e is string => !!e,
        );
        if (recipients.length === 0) {
          noCoachEmail.push(team.teamName);
          continue;
        }

        const autoDraftOn = autoDraftSet.has(team.id);
        const subject = `Draft Invitation: ${session.name} (${session.ageGroup})`;
        const text = [
          `You're invited to the live online draft for ${session.name} (${session.ageGroup}).`,
          startText ? `Scheduled start: ${startText}` : null,
          `Your team: ${team.teamName}`,
          "",
          `Join here: ${link}`,
          autoDraftOn
            ? "Autopick is turned ON for your team -- if you're not there when it's your turn, we'll automatically draft the best available player for you."
            : null,
        ]
          .filter((line): line is string => line !== null)
          .join("\n");

        const html = `
          <div style="font-family:system-ui,sans-serif;line-height:1.6;color:#111827">
            <p>You're invited to the live online draft for <strong>${session.name}</strong> (${session.ageGroup}).</p>
            ${startText ? `<p><strong>Scheduled start:</strong> ${startText}</p>` : ""}
            <p><strong>Your team:</strong> ${team.teamName}</p>
            <p><a href="${link}" style="display:inline-block;background:#059669;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Join the Draft</a></p>
            <p style="font-size:13px;color:#4b5563">Or copy this link: ${link}</p>
            ${
              autoDraftOn
                ? `<p style="font-size:13px;color:#92400e">Autopick is turned ON for your team -- if you're not there when it's your turn, we'll automatically draft the best available player for you.</p>`
                : ""
            }
          </div>
        `;

        try {
          const result = await sendOrderReportEmail({
            actorAdminId: auth.admin.id,
            actorEmail: auth.admin.email,
            organizationId: session.organizationId,
            campaignTitlePrefix: "Draft Invite",
            sourceType: "DRAFT_INVITE_MANUAL",
            recipients,
            subject,
            text,
            html,
            fromEmail: fromAddress,
            replyTo: auth.admin.email,
          });
          sent += result.sent;
          skippedSuppressed.push(...result.skippedSuppressed);
          failed.push(...result.failed);
        } catch {
          failed.push(...recipients);
        }
      }

      emailResult = { sent, skippedSuppressed, failed, noCoachEmail };
      await prisma.draftSession.update({
        where: { id },
        data: { invitesSentAt: new Date(), lastInviteResult: emailResult },
      });
    }

    return NextResponse.json({
      ok: true,
      scheduledStartAt: scheduledStartAt?.toISOString() ?? null,
      emailResult,
    });
  } catch (e) {
    return draftApiError("session.invite", e, 400);
  }
}
