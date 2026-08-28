import { getAccessToken } from "@/lib/paypal/client";

const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

/**
 * Verify a PayPal webhook event signature via the PayPal verify API.
 * Returns true only when PayPal confirms the event is authentic.
 */
export async function verifyPayPalWebhookSignature(
  headers: Record<string, string | undefined>,
  rawBody: string,
  webhookId: string,
): Promise<boolean> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: headers["paypal-auth-algo"],
        cert_url: headers["paypal-cert-url"],
        transmission_id: headers["paypal-transmission-id"],
        transmission_sig: headers["paypal-transmission-sig"],
        transmission_time: headers["paypal-transmission-time"],
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody) as unknown,
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { verification_status?: string };
    return data.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

// ─── Normalised view of a completed PayPal payment, regardless of event type ─

export type IncomingPayment = {
  txId: string;
  amountCents: number;
  note: string | null;
  txDate: Date;
  /** Soft descriptor / invoice / custom when present on the resource. */
  customId: string | null;
  invoiceId: string | null;
  payerEmail: string | null;
  payerName: string | null;
  /** Item name if PayPal included cart details on the webhook resource. */
  itemName: string | null;
  itemQuantity: number | null;
};

function parseMoneyCents(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw * 100);
  if (typeof raw === "string") return Math.round(parseFloat(raw || "0") * 100);
  if (typeof raw === "object") {
    const o = raw as { value?: string; total?: string };
    if (o.value != null) return Math.round(parseFloat(String(o.value) || "0") * 100);
    if (o.total != null) return Math.round(parseFloat(String(o.total) || "0") * 100);
  }
  return 0;
}

function readPayer(resource: Record<string, unknown>): {
  payerEmail: string | null;
  payerName: string | null;
} {
  const payer = resource.payer as
    | {
        email_address?: string;
        name?: { given_name?: string; surname?: string };
      }
    | undefined;
  const email = payer?.email_address?.trim() || null;
  const given = payer?.name?.given_name ?? "";
  const surname = payer?.name?.surname ?? "";
  const name = `${given} ${surname}`.trim() || null;
  return { payerEmail: email, payerName: name };
}

function readItemFromResource(resource: Record<string, unknown>): {
  itemName: string | null;
  itemQuantity: number | null;
} {
  // SALE resources sometimes nest purchase_units differently than CAPTURE.
  const units =
    (resource.purchase_units as Array<Record<string, unknown>> | undefined) ??
    ((resource.supplementary_data as { related_ids?: unknown } | undefined) &&
      undefined);

  const fromUnits = Array.isArray(units) ? units : [];
  for (const unit of fromUnits) {
    const items = (unit.items as Array<Record<string, unknown>> | undefined) ?? [];
    const first = items[0];
    if (first) {
      const qtyRaw = first.quantity;
      const qty =
        typeof qtyRaw === "string" || typeof qtyRaw === "number"
          ? parseInt(String(qtyRaw), 10) || null
          : null;
      return {
        itemName: typeof first.name === "string" ? first.name : null,
        itemQuantity: qty,
      };
    }
    const desc = unit.description;
    if (typeof desc === "string" && desc.trim()) {
      return { itemName: desc.trim(), itemQuantity: null };
    }
  }

  // Classic SALE payload occasionally has item_list
  const itemList = resource.item_list as
    | { items?: Array<{ name?: string; quantity?: string }> }
    | undefined;
  const classic = itemList?.items?.[0];
  if (classic) {
    return {
      itemName: classic.name ?? null,
      itemQuantity: classic.quantity ? parseInt(classic.quantity, 10) || null : null,
    };
  }

  return { itemName: null, itemQuantity: null };
}

export function extractPayment(
  eventType: string,
  resource: Record<string, unknown>,
): IncomingPayment | null {
  const txId = resource.id as string | undefined;
  if (!txId) return null;

  let amountCents = 0;
  let note: string | null = null;
  let txDate = new Date();

  if (eventType === "PAYMENT.SALE.COMPLETED") {
    amountCents = parseMoneyCents(resource.amount);
    note =
      (resource.note_to_payer as string | undefined) ??
      (resource.custom as string | undefined) ??
      null;
    txDate = new Date((resource.create_time as string | undefined) ?? Date.now());
  } else {
    // PAYMENT.CAPTURE.COMPLETED
    amountCents = parseMoneyCents(resource.amount);
    note =
      (resource.note_to_payer as string | undefined) ??
      (resource.custom_id as string | undefined) ??
      null;
    txDate = new Date((resource.create_time as string | undefined) ?? Date.now());
  }

  const { payerEmail, payerName } = readPayer(resource);
  const { itemName, itemQuantity } = readItemFromResource(resource);

  const customId =
    (typeof resource.custom_id === "string" && resource.custom_id) ||
    (typeof resource.custom === "string" && resource.custom) ||
    null;
  const invoiceId =
    (typeof resource.invoice_id === "string" && resource.invoice_id) || null;

  return {
    txId,
    amountCents,
    note,
    txDate,
    customId,
    invoiceId,
    payerEmail,
    payerName,
    itemName,
    itemQuantity,
  };
}
