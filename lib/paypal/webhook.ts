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
};

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
    const amount = resource.amount as { total?: string } | undefined;
    amountCents = Math.round(parseFloat(amount?.total ?? "0") * 100);
    note = (resource.note_to_payer as string | undefined) ?? null;
    txDate = new Date((resource.create_time as string | undefined) ?? Date.now());
  } else {
    // PAYMENT.CAPTURE.COMPLETED
    const amount = resource.amount as { value?: string } | undefined;
    amountCents = Math.round(parseFloat(amount?.value ?? "0") * 100);
    note = (resource.note_to_payer as string | undefined) ?? null;
    txDate = new Date((resource.create_time as string | undefined) ?? Date.now());
  }

  return { txId, amountCents, note, txDate };
}
