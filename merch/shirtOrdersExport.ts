import { resolvedSizeLabelsForOrder, splitShirtNote } from "@/lib/merch/shirtSizes";
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

export type ShirtOrdersExportOrg = "all" | "gonzales" | "ascension";

export type ShirtOrdersExportOptions = {
  orgFilter?: ShirtOrdersExportOrg;
  /**
   * Filter to a single PayPal product / NCP button by exact item title
   * (e.g. "7-8U, AP LL - State Champs Shirt"). Case-insensitive trim match.
   */
  itemName?: string | null;
  /** When true, only rows with remaining (unfulfilled) shirts. */
  openOnly?: boolean;
};

export type ShirtOrdersExportResult = {
  csv: string;
  filename: string;
  orderCount: number;
  shirtCount: number;
  openShirtCount: number;
  orgLabel: string;
  itemLabel: string | null;
};

/** Filename-safe slug from a PayPal item title. */
export function slugifyShirtItemName(itemName: string): string {
  const slug = itemName
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return slug || "Product";
}

function normalizeItemName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export async function buildShirtOrdersCsv(
  options: ShirtOrdersExportOptions = {},
): Promise<ShirtOrdersExportResult> {
  const orgFilter = options.orgFilter ?? "all";
  const itemFilter = (options.itemName ?? "").trim();
  const where = orgFilter === "all" ? {} : { org: orgFilter };

  const records = await prisma.shirtOrderRecord.findMany({
    where,
    include: { items: { orderBy: { seq: "asc" } } },
    orderBy: { txDate: "asc" },
  });

  let scoped = records;
  if (itemFilter) {
    const want = normalizeItemName(itemFilter);
    scoped = records.filter((r) => normalizeItemName(r.itemName) === want);
  }

  const filtered = options.openOnly
    ? scoped.filter((r) => r.items.some((i) => i.status !== "fulfilled"))
    : scoped;

  const header = [
    "Date",
    "Org",
    "Payer Name",
    "Email",
    "Player Name",
    "Size(s)",
    "Sizes Expanded",
    "Full Note",
    "Qty",
    "Amount",
    "Fulfilled",
    "Remaining",
    "Item Name",
    "TxId",
  ].join(",");

  const rows = filtered.map((r) => {
    const fulfilledCount = r.items.filter((i) => i.status === "fulfilled").length;
    const { player, sizes, raw } = splitShirtNote(r.note);
    const expanded = resolvedSizeLabelsForOrder(r.note, r.quantity, r.items).filter(Boolean);
    return [
      escapeCsv(fmtDate(r.txDate)),
      escapeCsv(
        r.org === "gonzales" ? "Gonzales DYB" : r.org === "ascension" ? "Ascension LLB" : r.org,
      ),
      escapeCsv(r.payerName),
      escapeCsv(r.payerEmail),
      escapeCsv(player),
      escapeCsv(sizes || raw),
      escapeCsv(expanded.join(", ")),
      escapeCsv(raw),
      String(r.quantity),
      escapeCsv(fmtMoney(r.amountCents)),
      String(fulfilledCount),
      String(r.quantity - fulfilledCount),
      escapeCsv(r.itemName),
      escapeCsv(r.txId),
    ].join(",");
  });

  const sizeTally = new Map<string, number>();
  for (const r of filtered) {
    const labels = resolvedSizeLabelsForOrder(r.note, r.quantity, r.items);
    const usable = labels.filter((l) => l.trim());
    if (usable.length === 0) {
      const remaining = options.openOnly
        ? r.items.filter((i) => i.status !== "fulfilled").length
        : r.quantity;
      sizeTally.set("(no size)", (sizeTally.get("(no size)") ?? 0) + remaining);
      continue;
    }
    // When openOnly, only count unfulfilled item slots by seq
    if (options.openOnly) {
      const openSeqs = new Set(
        r.items.filter((i) => i.status !== "fulfilled").map((i) => i.seq),
      );
      for (let seq = 1; seq <= labels.length; seq++) {
        if (!openSeqs.has(seq)) continue;
        const label = (labels[seq - 1] || "(no size)").trim() || "(no size)";
        sizeTally.set(label, (sizeTally.get(label) ?? 0) + 1);
      }
    } else {
      for (const label of usable) {
        sizeTally.set(label, (sizeTally.get(label) ?? 0) + 1);
      }
    }
  }

  const tallyHeader = ["Size", "Total Qty"].join(",");
  const tallyRows = [...sizeTally.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([size, qty]) => [escapeCsv(size), String(qty)].join(","));

  const orgLabel =
    orgFilter === "gonzales"
      ? "Gonzales DYB"
      : orgFilter === "ascension"
        ? "Ascension LLB"
        : "All Orgs";

  // Prefer the stored PayPal title from matched rows; fall back to the filter string.
  const itemLabel =
    itemFilter
      ? filtered[0]?.itemName?.trim() ||
        scoped[0]?.itemName?.trim() ||
        itemFilter
      : null;

  const scopeNote = [
    options.openOnly ? "open only" : "all orders",
    itemLabel ? `product: ${itemLabel}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const csv = [
    `# Shirt Orders – ${orgLabel}${itemLabel ? ` – ${itemLabel}` : ""} (${scopeNote})`,
    header,
    ...rows,
    "",
    "# Vendor tally (by size)",
    tallyHeader,
    ...tallyRows,
  ].join("\r\n");

  const dateStr = new Date().toISOString().slice(0, 10);
  const orgPart =
    orgFilter === "all" ? "All" : orgFilter === "gonzales" ? "Gonzales" : "Ascension";
  const openPart = options.openOnly ? "_Open" : "";
  const itemPart = itemLabel ? `_${slugifyShirtItemName(itemLabel)}` : "";
  const filename = `ShirtOrders_${orgPart}${itemPart}${openPart}_${dateStr}.csv`;

  let shirtCount = 0;
  let openShirtCount = 0;
  for (const r of filtered) {
    shirtCount += r.quantity;
    openShirtCount += r.items.filter((i) => i.status !== "fulfilled").length;
  }

  return {
    csv,
    filename,
    orderCount: filtered.length,
    shirtCount,
    openShirtCount,
    orgLabel,
    itemLabel,
  };
}
