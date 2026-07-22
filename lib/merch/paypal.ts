/** PayPal hosts allowed for storefront checkout links. */
const PAYPAL_HOSTS = [
  "paypal.com",
  "www.paypal.com",
  "paypal.me",
  "www.paypal.me",
] as const;

export function isSafePayPalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return PAYPAL_HOSTS.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export function fmtMerchPrice(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
