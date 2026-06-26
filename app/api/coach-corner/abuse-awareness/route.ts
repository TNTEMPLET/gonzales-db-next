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

  const updated = await prisma.registeredUser.update({
    where: { id: actor.registeredUserId },
    data: {
      abuseAwarenessTrainingCertificateUrl: stored.url,
      abuseAwarenessTrainingCertificateFileName: stored.fileName,
      abuseAwarenessTrainingCertificateMimeType: stored.mimeType,
      abuseAwarenessTrainingCertificateUploadedAt: new Date(),
    },
    select: {
      id: true,
      abuseAwarenessTrainingCertificateUrl: true,
      abuseAwarenessTrainingCertificateFileName: true,
      abuseAwarenessTrainingCertificateMimeType: true,
      abuseAwarenessTrainingCertificateUploadedAt: true,
    },
  });

  return NextResponse.json({ success: true, data: updated });
}
