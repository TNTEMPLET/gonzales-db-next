import Image from "next/image";
import Link from "next/link";

import { fmtMerchPrice } from "@/lib/merch/paypal";
import type { MerchProduct } from "@/lib/merch/types";

function isLocalImage(src: string): boolean {
  return src.startsWith("/");
}

export default function ShopCatalog({
  products,
  emptyMessage = "No merchandise is listed right now. Check back soon.",
}: {
  products: MerchProduct[];
  emptyMessage?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-12 text-center">
        <p className="text-sm text-zinc-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.id}>
          <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
            <div className="relative aspect-[4/3] bg-zinc-950">
              {product.imageUrl ? (
                isLocalImage(product.imageUrl) ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    fill
                    className="object-contain p-4"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-contain p-4"
                  />
                )
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-600">
                  No image
                </div>
              )}
              {product.badge ? (
                <span className="absolute left-3 top-3 rounded-full border border-amber-600/50 bg-amber-950/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-100">
                  {product.badge}
                </span>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-3 p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-50">
                  {product.name}
                </h2>
                <p className="mt-1 text-sm text-zinc-400">{product.summary}</p>
              </div>

              <p className="text-2xl font-bold tabular-nums text-white">
                {fmtMerchPrice(product.priceCents)}
                {product.maxQuantity && product.maxQuantity > 1 ? (
                  <span className="ml-2 text-xs font-normal text-zinc-500">
                    each · up to {product.maxQuantity}
                  </span>
                ) : null}
              </p>

              {product.checkoutHints && product.checkoutHints.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400">
                  {product.checkoutHints.map((hint) => (
                    <li key={hint} className="flex gap-2">
                      <span className="text-brand-gold" aria-hidden>
                        •
                      </span>
                      <span>{hint}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {product.description ? (
                <p className="text-xs leading-relaxed text-zinc-500">{product.description}</p>
              ) : null}

              <div className="mt-auto pt-1">
                <a
                  href={product.paypalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0070ba] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#005ea6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                >
                  <PayPalMark />
                  Buy with PayPal
                </a>
                <p className="mt-2 text-center text-[11px] text-zinc-600">
                  Opens PayPal checkout in a new tab
                </p>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

export function ShopAdminProductTable({
  products,
  orgQuery = "",
}: {
  products: MerchProduct[];
  orgQuery?: string;
}) {
  if (products.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-500">
        No catalog products for this organization yet. Add SKUs in{" "}
        <code className="text-zinc-300">lib/merch/catalog.ts</code>.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-semibold">Product</th>
            <th className="px-4 py-3 font-semibold">Price</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Fulfillment</th>
            <th className="px-4 py-3 font-semibold">Checkout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/80">
          {products.map((p) => {
            const desk =
              p.fulfillment === "shirt-orders"
                ? `/admin/shirt-orders${orgQuery}`
                : p.fulfillment === "cap-orders"
                  ? `/admin/cap-orders${orgQuery}`
                  : null;
            return (
              <tr key={p.id} className="bg-zinc-950/40">
                <td className="px-4 py-3">
                  <p className="font-medium text-zinc-100">{p.name}</p>
                  <p className="text-xs text-zinc-500">{p.id}</p>
                </td>
                <td className="px-4 py-3 tabular-nums text-zinc-300">
                  {fmtMerchPrice(p.priceCents)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      p.active
                        ? "rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-xs text-emerald-300"
                        : "rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-500"
                    }
                  >
                    {p.active ? "Live" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {desk ? (
                    <Link href={desk} className="text-sky-300 hover:text-sky-200 hover:underline">
                      {p.fulfillment}
                    </Link>
                  ) : (
                    <span className="text-zinc-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={p.paypalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-400 hover:text-zinc-200 hover:underline"
                  >
                    Open PayPal
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PayPalMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path
        d="M7.76 22H5l1.5-9.5H3L4.5 3h7c2.5 0 4.25 1.25 4 4-.25 2.5-2 4-4.5 4H9.5L8.25 16H11l-.75 4H7.76z"
        opacity=".85"
      />
      <path d="M12.5 3h4.5c2.5 0 4 1.5 3.5 4C20 9.5 18 11 15.5 11H14l-1 6h-2.5l2-14z" />
    </svg>
  );
}
