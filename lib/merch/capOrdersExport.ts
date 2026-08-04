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

export type CapOrdersExportOrg = "all" | "gonzales" | "ascension";

export type CapOrdersExportOptions = {
  orgFilter?: CapOrdersExportOrg;
  /** Filter to a single PayPal item title. Case-insensitive trim match. */
  itemName?: string | null;
  /** When true, only rows with remaining (unfulfilled) caps. */
  openOnly?: boolean;
};

export type CapOrdersExportResult = {
  csv: string;
  filename: string;
  orderCount: number;
  capCount: number;
  openCapCount: number;
  orgLabel: string;
  itemLabel: string | null;
};

/** Filename-safe slug from a PayPal item title. */
export function slugifyCapItemName(itemName: string): string {
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

/** Shared CSV builder for both the cap-orders export route and email route. */
export async function buildCapOrdersCsv(
  options: CapOrdersExportOptions = {},
): Promise<CapOrdersExportResult> {
  const orgFilter = options.orgFilter ?? "all";
  const itemFilter = (options.itemName ?? "").trim();
  const where = orgFilter === "all" ? {} : { org: orgFilter };

  const records = await prisma.capOrderRecord.findMany({
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
    "Hat Size / Note",
    "Qty",
    "Amount",
    "Fulfilled",
    "Remaining",
    "Item Name",
    "TxId",
  ].join(",");

  const rows = filtered.map((r) => {
    const fulfilledCount = r.items.filter((i) => i.status === "fulfilled").length;
    return [
      escapeCsv(fmtDate(r.txDate)),
      escapeCsv(
        r.org === "gonzales" ? "Gonzales DYB" : r.org === "ascension" ? "Ascension LLB" : r.org,
      ),
      escapeCsv(r.payerName),
      escapeCsv(r.payerEmail),
      escapeCsv(r.note),
      String(r.quantity),
      escapeCsv(fmtMoney(r.amountCents)),
      String(fulfilledCount),
      String(r.quantity - fulfilledCount),
      escapeCsv(r.itemName),
      escapeCsv(r.txId),
    ].join(",");
  });

  const orgLabel =
    orgFilter === "gonzales"
      ? "Gonzales DYB"
      : orgFilter === "ascension"
        ? "Ascension LLB"
        : "All Orgs";

  const itemLabel = itemFilter
    ? filtered[0]?.itemName?.trim() || scoped[0]?.itemName?.trim() || itemFilter
    : null;

  const scopeNote = [
    options.openOnly ? "open only" : "all orders",
    itemLabel ? `product: ${itemLabel}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const csv = [
    `# Parent Cap Orders – ${orgLabel}${itemLabel ? ` – ${itemLabel}` : ""} (${scopeNote})`,
    header,
    ...rows,
  ].join("\r\n");

  const dateStr = new Date().toISOString().slice(0, 10);
  const orgPart = orgFilter === "all" ? "All" : orgFilter === "gonzales" ? "Gonzales" : "Ascension";
  const openPart = options.openOnly ? "_Open" : "";
  const itemPart = itemLabel ? `_${slugifyCapItemName(itemLabel)}` : "";
  const filename = `CapOrders_${orgPart}${itemPart}${openPart}_${dateStr}.csv`;

  let capCount = 0;
  let openCapCount = 0;
  for (const r of filtered) {
    capCount += r.quantity;
    openCapCount += r.items.filter((i) => i.status !== "fulfilled").length;
  }

  return {
    csv,
    filename,
    orderCount: filtered.length,
    capCount,
    openCapCount,
    orgLabel,
    itemLabel,
  };
}
