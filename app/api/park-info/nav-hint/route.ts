import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getDefaultContentOrg, getBracketOrgForDeployment } from "@/lib/siteConfig";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = getBracketOrgForDeployment();
    const row = await prisma.parkInfoPage.findUnique({
      where: { organizationId: org },
      select: { rulesMarkdown: true, parkingMarkdown: true, fieldLayoutImageUrl: true },
    });
    const hasContent = !!(
      row?.rulesMarkdown?.trim() ||
      row?.parkingMarkdown?.trim() ||
      row?.fieldLayoutImageUrl
    );
    return NextResponse.json({ showParkInfoLink: hasContent });
  } catch {
    return NextResponse.json({ showParkInfoLink: false });
  }
}
