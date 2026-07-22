import { NextRequest, NextResponse } from "next/server";
import { ensureAllStarVaultAdmin } from "@/lib/allStar/auth";
import prisma from "@/lib/prisma";

function escapeCsv(value: string | null | undefined): string {
  const s = value ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtMoney(cents: number): string {
  return (cents / 100).toFixed(2);
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });
}

export async function GET(request: NextRequest) {
  const auth = await ensureAllStarVaultAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });

  const url = new URL(request.url);
  const orgFilter = url.searchParams.get("org") ?? "all";

  const where = orgFilter === "all" ? {} : { org: orgFilter };

  const records = await prisma.shirtOrderRecord.findMany({
    where,
    include: { items: { orderBy: { seq: "asc" } } },
    orderBy: { txDate: "asc" },
  });

  /** NCP shirts join memos as "player name | sizes"; prefer the size side for vendor tally. */
  function splitNote(note: string | null | undefined): { player: string; sizes: string; raw: string } {
    const raw = (note ?? "").trim();
    if (!raw) return { player: "", sizes: "", raw: "" };
    const parts = raw.split(/\s*\|\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { player: parts[0] ?? "", sizes: parts.slice(1).join(" | "), raw };
    }
    return { player: "", sizes: raw, raw };
  }

  const header = [
    "Date",
    "Org",
    "Payer Name",
    "Email",
    "Player Name",
    "Size(s)",
    "Full Note",
    "Qty",
    "Amount",
    "Fulfilled",
    "Remaining",
    "Item Name",
    "TxId",
  ].join(",");

  const rows = records.map((r) => {
    const fulfilledCount = r.items.filter((i) => i.status === "fulfilled").length;
    const { player, sizes, raw } = splitNote(r.note);
    return [
      escapeCsv(fmtDate(r.txDate)),
      escapeCsv(r.org === "gonzales" ? "Gonzales DYB" : r.org === "ascension" ? "Ascension LLB" : r.org),
      escapeCsv(r.payerName),
      escapeCsv(r.payerEmail),
      escapeCsv(player),
      escapeCsv(sizes),
      escapeCsv(raw),
      String(r.quantity),
      escapeCsv(fmtMoney(r.amountCents)),
      String(fulfilledCount),
      String(r.quantity - fulfilledCount),
      escapeCsv(r.itemName),
      escapeCsv(r.txId),
    ].join(",");
  });

  // Vendor-friendly size tally (uses size portion when note is "name | sizes")
  const sizeTally = new Map<string, number>();
  for (const r of records) {
    const { sizes, raw } = splitNote(r.note);
    const key = (sizes || raw || "(no size/note)").trim();
    sizeTally.set(key, (sizeTally.get(key) ?? 0) + r.quantity);
  }
  const tallyHeader = ["Size(s)", "Total Qty"].join(",");
  const tallyRows = [...sizeTally.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([size, qty]) => [escapeCsv(size), String(qty)].join(","));

  const orgLabel =
    orgFilter === "gonzales" ? "Gonzales DYB" : orgFilter === "ascension" ? "Ascension LLB" : "All Orgs";
  const csvContent = [
    `# Shirt Orders – ${orgLabel}`,
    header,
    ...rows,
    "",
    "# Vendor tally (by size/note)",
    tallyHeader,
    ...tallyRows,
  ].join("\r\n");
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `ShirtOrders_${orgFilter === "all" ? "All" : orgFilter === "gonzales" ? "Gonzales" : "Ascension"}_${dateStr}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
