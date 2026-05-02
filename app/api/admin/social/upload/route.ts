import { NextRequest, NextResponse } from "next/server";

import { ensureAdminModule } from "@/lib/news/auth";
import {
  isBlobConfigStoreError,
  storeAdminImageFromFile,
} from "@/lib/uploads/storeAdminImage";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await ensureAdminModule(request, "SOCIAL_MEDIA");
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Image file is required" },
        { status: 400 },
      );
    }

    const result = await storeAdminImageFromFile(file, "social");
    if (!result.ok) {
      const status = isBlobConfigStoreError(result) ? 500 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      data: {
        imageUrl: result.imageUrl,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to upload image: ${message}` },
      { status: 500 },
    );
  }
}
