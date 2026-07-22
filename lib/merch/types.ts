import type { ContentOrgId } from "@/lib/siteConfig";

/** Which admin order desk fulfills this SKU after PayPal payment. */
export type MerchFulfillmentDesk = "shirt-orders" | "cap-orders" | "none";

export type MerchProduct = {
  /** Stable id for keys and future DB migration. */
  id: string;
  /** Orgs that list this product on /shop. */
  orgs: ContentOrgId[];
  name: string;
  /** Short card blurb. */
  summary: string;
  /** Longer detail under the fold / on card expand. */
  description?: string;
  /** Display price in cents (must match PayPal NCP button). */
  priceCents: number;
  /** PayPal NCP or hosted button checkout URL. */
  paypalUrl: string;
  /** Optional local path or https image. */
  imageUrl?: string | null;
  /** Badge on the card, e.g. "State Champs". */
  badge?: string | null;
  /** Shown near Buy — sizes, name note, pickup, etc. */
  checkoutHints?: string[];
  /** Max qty advertised (NCP quantity_option). */
  maxQuantity?: number | null;
  fulfillment: MerchFulfillmentDesk;
  /** When false, hidden from public shop (still visible in admin). */
  active: boolean;
  /** Sort ascending. */
  sortOrder: number;
};

export type MerchCatalogMeta = {
  /** Optional shop intro override per org. */
  introByOrg?: Partial<Record<ContentOrgId, string>>;
};
