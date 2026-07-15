import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import prisma from "@/lib/prisma";
import { storeCoachDocumentFromFile } from "@/lib/uploads/storeCoachDocument";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const actor = await resolveCoachCornerActor(request);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("certificate");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Certificate file is required" }, { status: 400 });
  }

  const stored = await storeCoachDocumentFromFile(file, {
    coachUserId: actor.registeredUserId,
    target: "abuse-awareness-training",
  });
  if (!stored.ok) {
    return NextResponse.json({ error: stored.error }, { status: stored.blobConfigError ? 500 : 400 });
  }

  const now = new Date();
  const updated = await prisma.registeredUser.update({
    where: { id: actor.registeredUserId },
    data: {
      abuseAwarenessTrainingCertificateUrl: stored.url,
      abuseAwarenessTrainingCertificateFileName: stored.fileName,
      abuseAwarenessTrainingCertificateMimeType: stored.mimeType,
      abuseAwarenessTrainingCertificateUploadedAt: now,
    },
    select: {
      id: true,
      organizationId: true,
      abuseAwarenessTrainingCertificateUrl: true,
      abuseAwarenessTrainingCertificateFileName: true,
      abuseAwarenessTrainingCertificateMimeType: true,
      abuseAwarenessTrainingCertificateUploadedAt: true,
    },
  });

  // Dual-write onto Volunteer Card requirement status (best-effort).
  try {
    const { ensureVolunteerProfile, updateRequirementStatus } = await import(
      "@/lib/volunteers/service"
    );
    const profile = await ensureVolunteerProfile({
      organizationId: updated.organizationId,
      registeredUserId: updated.id,
    });
    await updateRequirementStatus({
      volunteerProfileId: profile.id,
      organizationId: updated.organizationId,
      requirementKey: "ABUSE_AWARENESS",
      status: "CLEAR",
      documentUrl: stored.url,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      uploadedAt: now,
      completedAt: now,
    });
  } catch (err) {
    console.warn("[coach-corner/abuse-awareness] volunteer dual-write failed", err);
  }

  return NextResponse.json({ success: true, data: updated });
}
