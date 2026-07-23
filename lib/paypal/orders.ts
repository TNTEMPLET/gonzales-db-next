import "server-only";

import { getAccessToken } from "@/lib/paypal/client";

const PAYPAL_API_BASE =
  process.env.PAYPAL_MODE === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export function getPayPalMode(): "live" | "sandbox" {
  return process.env.PAYPAL_MODE === "live" ? "live" : "sandbox";
}

/** Browser SDK client id (public). Falls back to server CLIENT_ID. */
export function getPayPalBrowserClientId(): string | null {
  const id =
    process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() ||
    process.env.PAYPAL_CLIENT_ID?.trim() ||
    "";
  return id || null;
}

export function isPayPalOrdersConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() && process.env.PAYPAL_CLIENT_SECRET?.trim(),
  );
}

export type CreatePayPalOrderInput = {
  /** Our draft code — stored as custom_id for matching. */
  draftCode: string;
  /** Human description on the PayPal receipt. */
  description: string;
  /** SKU / product id. */
  sku?: string;
  amountCents: number;
  quantity: number;
  /** Soft descriptor / invoice id (max lengths enforced by PayPal). */
  invoiceId?: string;
};

export type PayPalOrderResult = {
  id: string;
  status: string;
  raw: unknown;
};

export type PayPalCaptureResult = {
  orderId: string;
  status: string;
  captureId: string | null;
  amountCents: number | null;
  payerName: string | null;
  payerEmail: string | null;
  customId: string | null;
  raw: unknown;
};

function centsToPayPalValue(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

async function paypalFetch<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const token = init.token ?? (await getAccessToken());
  const { token: _t, ...rest } = init;
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: string }).message)
        : text.slice(0, 400);
    throw new Error(`PayPal ${path} failed (${res.status}): ${msg}`);
  }
  return body as T;
}

/**
 * Create a PayPal order for embedded JS SDK buttons (intent: CAPTURE).
 * custom_id = draft code so capture/webhook can resolve the merch draft.
 */
export async function createPayPalOrder(
  input: CreatePayPalOrderInput,
): Promise<PayPalOrderResult> {
  if (!isPayPalOrdersConfigured()) {
    throw new Error("PayPal Orders API is not configured (CLIENT_ID / SECRET)");
  }

  const value = centsToPayPalValue(input.amountCents);
  const unitValue = centsToPayPalValue(
    Math.round(input.amountCents / Math.max(1, input.quantity)),
  );

  // invoice_id max 127; custom_id max 127
  const customId = input.draftCode.slice(0, 127);
  const invoiceId = (input.invoiceId ?? input.draftCode).slice(0, 127);
  const description = input.description.slice(0, 127);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: customId,
        description,
        custom_id: customId,
        invoice_id: invoiceId,
        amount: {
          currency_code: "USD",
          value,
          breakdown: {
            item_total: { currency_code: "USD", value },
          },
        },
        items: [
          {
            name: description.slice(0, 127),
            sku: (input.sku ?? customId).slice(0, 127),
            quantity: String(Math.max(1, input.quantity)),
            unit_amount: { currency_code: "USD", value: unitValue },
            category: "PHYSICAL_GOODS",
          },
        ],
      },
    ],
    application_context: {
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
      brand_name: "AP Baseball",
    },
  };

  // If unit * qty drifts a cent, use single line total equal to order amount.
  const recomputed = Math.round(parseFloat(unitValue) * 100) * input.quantity;
  if (recomputed !== input.amountCents) {
    body.purchase_units[0].items = [
      {
        name: description.slice(0, 127),
        sku: (input.sku ?? customId).slice(0, 127),
        quantity: "1",
        unit_amount: { currency_code: "USD", value },
        description: `${input.quantity} × shirt(s)`,
        category: "PHYSICAL_GOODS",
      },
    ];
  }

  const data = await paypalFetch<{ id: string; status: string }>(
    "/v2/checkout/orders",
    { method: "POST", body: JSON.stringify(body) },
  );

  return { id: data.id, status: data.status, raw: data };
}

/** Capture an approved PayPal order (called from onApprove). */
export async function capturePayPalOrder(orderId: string): Promise<PayPalCaptureResult> {
  if (!isPayPalOrdersConfigured()) {
    throw new Error("PayPal Orders API is not configured (CLIENT_ID / SECRET)");
  }
  if (!orderId?.trim()) {
    throw new Error("orderId is required");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await paypalFetch<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: "{}",
  });

  const pu = data?.purchase_units?.[0];
  const capture = pu?.payments?.captures?.[0];
  const payer = data?.payer;
  const amountStr: string | undefined = capture?.amount?.value;
  const customId: string | null =
    pu?.custom_id ?? pu?.reference_id ?? capture?.custom_id ?? null;

  const payerName = payer?.name
    ? `${payer.name.given_name ?? ""} ${payer.name.surname ?? ""}`.trim() || null
    : null;

  return {
    orderId: data?.id ?? orderId,
    status: data?.status ?? capture?.status ?? "UNKNOWN",
    captureId: capture?.id ?? null,
    amountCents: amountStr ? Math.round(parseFloat(amountStr) * 100) : null,
    payerName,
    payerEmail: payer?.email_address ?? null,
    customId: customId ? String(customId) : null,
    raw: data,
  };
}

/** GET order details (status / custom_id) without capturing. */
export async function getPayPalOrder(orderId: string): Promise<{
  id: string;
  status: string;
  customId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await paypalFetch<any>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    method: "GET",
  });
  const pu = data?.purchase_units?.[0];
  return {
    id: data?.id ?? orderId,
    status: data?.status ?? "UNKNOWN",
    customId: pu?.custom_id ?? pu?.reference_id ?? null,
    raw: data,
  };
}
