import { NextRequest, NextResponse } from "next/server";

import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import { getAdminUserFromRequest } from "@/lib/auth/adminSession";
import {
  getAllowedFromAddresses,
  getDefaultFromAddress,
  resolveFromAddress,
} from "@/lib/communications/fromAddresses";
import { sendEmailViaResend } from "@/lib/communications/providers/resend";
import {
  buildShirtOrdersCsv,
  type ShirtOrdersExportOrg,
} from "@/lib/merch/shirtOrdersExport";

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
 * Email the shirt-orders vendor CSV using Communications From addresses + Resend.
 * Stays on the shirt-orders desk — no need to open the Communications module.
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
    /** Exact PayPal item title — one NCP button / product link per email. */
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

  const orgFilter: ShirtOrdersExportOrg =
    body.org === "gonzales" || body.org === "ascension" ? body.org : "all";
  const openOnly = Boolean(body.openOnly);
  const itemName = (body.itemName ?? "").trim() || null;

  const exportResult = await buildShirtOrdersCsv({ orgFilter, openOnly, itemName });
  if (exportResult.orderCount === 0) {
    return NextResponse.json(
      {
        error: itemName
          ? openOnly
            ? "No open shirt orders for that product"
            : "No shirt orders for that product"
          : openOnly
            ? "No open shirt orders to email"
            : "No shirt orders to email",
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
    `Shirt orders – ${exportResult.orgLabel} – ${productLabel} – ${dateLabel}${openOnly ? " (open)" : ""}`;

  const customMessage = (body.message ?? "").trim();
  const summaryLines = [
    `Shirt order report for ${exportResult.orgLabel}.`,
    `Product: ${productLabel}`,
    `Orders: ${exportResult.orderCount}`,
    `Shirts: ${exportResult.shirtCount}` +
      (openOnly ? ` (${exportResult.openShirtCount} still open)` : ""),
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
    "This report was sent from the AP Baseball Shirt Orders admin desk.",
  ].filter((line): line is string => line !== null);

  const text = textParts.join("\n");
  const html = [
    customMessage
      ? `<p style="font-family:system-ui,sans-serif;line-height:1.5">${escapeHtml(customMessage).replaceAll("\n", "<br/>")}</p>`
      : "",
    `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#18181b">`,
    `<p><strong>Shirt order report</strong> — ${escapeHtml(exportResult.orgLabel)}</p>`,
    `<ul>`,
    `<li>Product: ${escapeHtml(productLabel)}</li>`,
    `<li>Orders: ${exportResult.orderCount}</li>`,
    `<li>Shirts: ${exportResult.shirtCount}${openOnly ? ` (${exportResult.openShirtCount} open)` : ""}</li>`,
    `<li>Scope: ${openOnly ? "open (unfulfilled) only" : "all orders"}</li>`,
    `<li>Attachment: <code>${escapeHtml(exportResult.filename)}</code></li>`,
    admin?.email ? `<li>Sent by: ${escapeHtml(admin.email)}</li>` : "",
    `</ul>`,
    `<p style="color:#71717a;font-size:13px">Sent from the AP Baseball Shirt Orders desk using league Communications email.</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("");

  const csvBase64 = Buffer.from(exportResult.csv, "utf8").toString("base64");

  try {
    const result = await sendEmailViaResend({
      to: recipients,
      subject,
      html,
      text,
      from: fromAddress,
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
      from: fromAddress,
      filename: exportResult.filename,
      orderCount: exportResult.orderCount,
      shirtCount: exportResult.shirtCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Email send failed" },
      { status: 502 },
    );
  }
}
