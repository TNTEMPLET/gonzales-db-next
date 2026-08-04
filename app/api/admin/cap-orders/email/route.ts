import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import {
  getAllowedFromAddresses,
  getDefaultFromAddress,
  resolveFromAddress,
} from "@/lib/communications/fromAddresses";
import { sendOrderReportEmail } from "@/lib/communications/orderReportEmail";
import {
  buildCapOrdersCsv,
  type CapOrdersExportOrg,
} from "@/lib/merch/capOrdersExport";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MAX_RECIPIENTS = 10;

function parseRecipients(raw: unknown): string[] {
  if (typeof raw === "string") {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Options for the in-module email form (Communications From list + provider status). */
export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const [fromOptions, defaultFrom] = await Promise.all([
    getAllowedFromAddresses(),
    getDefaultFromAddress(),
  ]);

  const emailConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      (defaultFrom || process.env.COMMUNICATIONS_EMAIL_FROM || process.env.RESEND_FROM_EMAIL),
  );

  return NextResponse.json({
    fromOptions,
    defaultFrom,
    emailConfigured,
  });
}

/**
 * Email the cap-orders vendor CSV using Communications From addresses + Resend.
 * Mirrors app/api/admin/shirt-orders/email/route.ts — stays on the cap-orders
 * desk, no need to open the Communications module. Both routes go through
 * lib/communications/orderReportEmail.ts for suppression checks + audit trail.
 */
export async function POST(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const admin = await getAdminUserFromRequest(request);
  const body = (await request.json()) as {
    to?: unknown;
    subject?: string;
    message?: string;
    org?: string;
    itemName?: string | null;
    openOnly?: boolean;
    fromEmail?: string | null;
  };

  const recipients = [...new Set(parseRecipients(body.to))];
  if (recipients.length === 0) {
    return NextResponse.json({ error: "Add at least one recipient email" }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json(
      { error: `Too many recipients (max ${MAX_RECIPIENTS})` },
      { status: 400 },
    );
  }
  const invalid = recipients.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Invalid email address: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  const orgFilter: CapOrdersExportOrg =
    body.org === "gonzales" || body.org === "ascension" ? body.org : "all";
  const openOnly = Boolean(body.openOnly);
  const itemName = (body.itemName ?? "").trim() || null;

  const exportResult = await buildCapOrdersCsv({ orgFilter, openOnly, itemName });
  if (exportResult.orderCount === 0) {
    return NextResponse.json(
      {
        error: itemName
          ? openOnly
            ? "No open cap orders for that product"
            : "No cap orders for that product"
          : openOnly
            ? "No open cap orders to email"
            : "No cap orders to email",
      },
      { status: 400 },
    );
  }

  const fromAddress = await resolveFromAddress(body.fromEmail);
  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const productLabel = exportResult.itemLabel ?? "All products";
  const subject =
    (body.subject ?? "").trim() ||
    `Cap orders – ${exportResult.orgLabel} – ${productLabel} – ${dateLabel}${openOnly ? " (open)" : ""}`;

  const customMessage = (body.message ?? "").trim();
  const summaryLines = [
    `Cap order report for ${exportResult.orgLabel}.`,
    `Product: ${productLabel}`,
    `Orders: ${exportResult.orderCount}`,
    `Caps: ${exportResult.capCount}` +
      (openOnly ? ` (${exportResult.openCapCount} still open)` : ""),
    openOnly ? "Scope: open (unfulfilled) only" : "Scope: all orders",
    `Attached: ${exportResult.filename}`,
  ];
  if (admin?.email) {
    summaryLines.push(`Sent by: ${admin.email}`);
  }

  const textParts = [
    customMessage || null,
    customMessage ? "" : null,
    ...summaryLines,
    "",
    "This report was sent from the AP Baseball Cap Orders admin desk.",
  ].filter((line): line is string => line !== null);

  const text = textParts.join("\n");
  const html = [
    customMessage
      ? `<p style="font-family:system-ui,sans-serif;line-height:1.5">${escapeHtml(customMessage).replaceAll("\n", "<br/>")}</p>`
      : "",
    `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">`,
    `<p><strong>Cap order report</strong> — ${escapeHtml(exportResult.orgLabel)}</p>`,
    `<ul>`,
    `<li>Product: ${escapeHtml(productLabel)}</li>`,
    `<li>Orders: ${exportResult.orderCount}</li>`,
    `<li>Caps: ${exportResult.capCount}${openOnly ? ` (${exportResult.openCapCount} open)` : ""}</li>`,
    `<li>Scope: ${openOnly ? "open (unfulfilled) only" : "all orders"}</li>`,
    `<li>Attachment: <code>${escapeHtml(exportResult.filename)}</code></li>`,
    admin?.email ? `<li>Sent by: ${escapeHtml(admin.email)}</li>` : "",
    `</ul>`,
    `<p style="color:#71717a;font-size:13px">Sent from the AP Baseball Cap Orders desk using league Communications email.</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("");

  const csvBase64 = Buffer.from(exportResult.csv, "utf8").toString("base64");

  try {
    const result = await sendOrderReportEmail({
      actorAdminId: admin?.id ?? null,
      actorEmail: admin?.email ?? null,
      organizationId: orgFilter === "all" ? null : orgFilter,
      campaignTitlePrefix: "Cap Orders",
      sourceType: "CAP_ORDER_MANUAL",
      recipients,
      subject,
      html,
      text,
      fromEmail: fromAddress,
      replyTo: admin?.email ?? null,
      attachments: [
        {
          filename: exportResult.filename,
          content: csvBase64,
          contentType: "text/csv; charset=utf-8",
        },
      ],
    });

    return NextResponse.json({
      ok: true,
      providerMessageId: result.providerMessageId,
      to: recipients,
      skippedSuppressed: result.skippedSuppressed,
      from: fromAddress,
      filename: exportResult.filename,
      orderCount: exportResult.orderCount,
      capCount: exportResult.capCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email send failed" },
      { status: 502 },
    );
  }
}
