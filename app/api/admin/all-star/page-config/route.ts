import { NextRequest, NextResponse } from "next/server";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import { resolveAllStarVaultAccessForAdmin } from "@/lib/allStar/auth";
import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";
import prisma from "@/lib/prisma";

function resolveOrg(request: NextRequest, adminUser: { isMaster: boolean }): string | null {
  const org = request.nextUrl.searchParams.get("org");
  if (isMasterDeployment() && adminUser.isMaster) {
    if (org === "gonzales" || org === "ascension") return org;
    return "gonzales"; // default
  }
  return getSiteConfig().orgId === "ascension" ? "ascension" : "gonzales";
}

export async function GET(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = resolveOrg(request, adminUser);
  if (!org) return NextResponse.json({ error: "Invalid org" }, { status: 400 });

  const { vaultView } = await resolveAllStarVaultAccessForAdmin({
    isMaster: adminUser.isMaster,
    email: adminUser.email,
    organizationId: org as "gonzales" | "ascension",
  });
  if (!vaultView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const empty = { paypalLinkLabel: null, paypalLinkUrl: null, infoText: null, links: [] };
  try {
    const config = await prisma.allStarPageConfig.findUnique({
      where: { organizationId: org },
      select: { paypalLinkLabel: true, paypalLinkUrl: true, infoText: true, links: true },
    });
    return NextResponse.json({ config: config ?? empty });
  } catch {
    return NextResponse.json({ config: empty });
  }
}

export async function PATCH(request: NextRequest) {
  const adminUser = await getAdminUserFromRequest(request);
  if (!adminUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = resolveOrg(request, adminUser);
  if (!org) return NextResponse.json({ error: "Invalid org" }, { status: 400 });

  const { canManageAllStarVaultUi } = await resolveAllStarVaultAccessForAdmin({
    isMaster: adminUser.isMaster,
    email: adminUser.email,
    organizationId: org as "gonzales" | "ascension",
  });
  if (!canManageAllStarVaultUi) return NextResponse.json({ error: "Forbidden — vault manage required" }, { status: 403 });

  const body = (await request.json()) as {
    paypalLinkLabel?: string | null;
    paypalLinkUrl?: string | null;
    infoText?: string | null;
    links?: { label: string; url: string; imageUrl?: string; activeFrom?: string; activeTo?: string }[];
  };

  // Validate URL: must be https:// and on a paypal.com domain (paypal.com, www.paypal.com, paypal.me)
  const url = body.paypalLinkUrl?.trim() || null;
  if (url) {
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (parsed.protocol !== "https:") {
      return NextResponse.json({ error: "URL must use HTTPS" }, { status: 400 });
    }
    const host = parsed.hostname.toLowerCase();
    const allowed = ["paypal.com", "www.paypal.com", "paypal.me", "www.paypal.me"];
    if (!allowed.some((h) => host === h || host.endsWith("." + h))) {
      return NextResponse.json({ error: "URL must be a paypal.com or paypal.me link" }, { status: 400 });
    }
  }

  // Validate additional links — must be https:// paypal.com/paypal.me URLs
  const rawLinks = Array.isArray(body.links) ? body.links.slice(0, 20) : [];
  const safeLinks = rawLinks
    .filter((l) => l.label?.trim() && l.url?.trim())
    .map((l) => {
      try {
        const p = new URL(l.url.trim());
        if (p.protocol !== "https:") return null;
        const host = p.hostname.toLowerCase();
        const allowed = ["paypal.com", "www.paypal.com", "paypal.me", "www.paypal.me"];
        if (!allowed.some((h) => host === h || host.endsWith("." + h))) return null;
        // Validate optional image URL — must be https:// (any domain)
        let imageUrl: string | undefined;
        if (l.imageUrl?.trim()) {
          try {
            const img = new URL(l.imageUrl.trim());
            if (img.protocol === "https:") imageUrl = l.imageUrl.trim();
          } catch { /* invalid — skip */ }
        }
        const activeFrom = l.activeFrom?.trim() || undefined;
        const activeTo = l.activeTo?.trim() || undefined;
        return { label: l.label.trim(), url: l.url.trim(), ...(imageUrl ? { imageUrl } : {}), ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
      } catch { return null; }
    })
    .filter(Boolean) as { label: string; url: string }[];

  let config;
  try {
    config = await prisma.allStarPageConfig.upsert({
      where: { organizationId: org },
      create: {
        organizationId: org,
        paypalLinkLabel: body.paypalLinkLabel?.trim() || null,
        paypalLinkUrl: url,
        infoText: body.infoText?.trim() || null,
        links: safeLinks,
      },
      update: {
        paypalLinkLabel: body.paypalLinkLabel?.trim() || null,
        paypalLinkUrl: url,
        infoText: body.infoText?.trim() || null,
        links: safeLinks,
      },
      select: { paypalLinkLabel: true, paypalLinkUrl: true, infoText: true, links: true },
    });
  } catch {
    return NextResponse.json({ error: "Settings not available — database migration pending" }, { status: 503 });
  }

  return NextResponse.json({ config });
}
