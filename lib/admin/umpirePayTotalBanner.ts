import type { jsPDF } from "jspdf";

export const UMPIRE_PAY_CASH_NEEDED_LABEL = "Cash needed to fulfill weekly umpire pay";

export function formatUmpirePayMoney(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

/** Grand-total bar under the letterhead on page 1 of umpire pay PDFs. */
export function writeUmpirePayTotalBanner(
  doc: jsPDF,
  y: number,
  margin: number,
  contentWidth: number,
  totalPay: number,
): number {
  const height = 36;
  doc.setFillColor(20, 83, 45);
  doc.rect(margin, y, contentWidth, height, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("Total Pay", margin + 10, y + 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 252, 231);
  doc.text(UMPIRE_PAY_CASH_NEEDED_LABEL, margin + 10, y + 27);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(formatUmpirePayMoney(totalPay), margin + contentWidth - 10, y + 23, { align: "right" });
  return y + height + 10;
}
