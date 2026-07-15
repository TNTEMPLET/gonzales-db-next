import { NextRequest, NextResponse } from "next/server";

import { resolveCoachCornerActor } from "@/lib/coachCorner/auth";
import { storeCoachDocumentFromFile } from "@/lib/uploads/storeCoachDocument";
import { recordAbuseAwarenessUpload } from "@/lib/volunteers/service";

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
  try {
    const { snapshot } = await recordAbuseAwarenessUpload({
      organizationId: actor.targetOrg,
      registeredUserId: actor.registeredUserId,
      documentUrl: stored.url,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      uploadedAt: now,
    });

    // Response shape keeps Coach Corner client fields (legacy column names) but
    // data is sourced from VolunteerRequirementStatus — not RegisteredUser.
    return NextResponse.json({
      success: true,
      data: {
        id: actor.registeredUserId,
        organizationId: actor.targetOrg,
        ...snapshot,
      },
    });
  } catch (err) {
    console.error("[coach-corner/abuse-awareness] volunteer write failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 },
    );
  }
}
