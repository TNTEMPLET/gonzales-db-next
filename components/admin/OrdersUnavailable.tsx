import Link from "next/link";

import { ORDERS_UNAVAILABLE_MESSAGE } from "@/lib/auth/ordersModule";

/** Friendly stand-in for hidden cap/shirt order routes. No order data is loaded. */
export default function OrdersUnavailable() {
  return (
    <main className="min-h-screen bg-zinc-950 py-16 text-white">
      <section className="mx-auto max-w-xl px-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Orders</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{ORDERS_UNAVAILABLE_MESSAGE}</h1>
        <p className="mt-3 text-zinc-400">
          Cap and shirt ordering is turned off. Saved orders are still on file, and new PayPal
          payments are still recorded.
        </p>
        <Link href="/admin" className="mt-6 inline-block text-sm text-sky-300 hover:underline">
          Back to the admin dashboard
        </Link>
      </section>
    </main>
  );
}
