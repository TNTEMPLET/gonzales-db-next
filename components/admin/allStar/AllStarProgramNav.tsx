import Link from "next/link";

import type { ContentOrgId } from "@/lib/siteConfig";

export type AllStarProgramStage = "vault" | "payments" | "cap-orders" | "shirt-orders" | "shop";

const STAGES: Array<{
  id: AllStarProgramStage;
  label: string;
  path: string;
  description: string;
}> = [
  {
    id: "vault",
    label: "Vault",
    path: "/admin/all-star",
    description: "Cycles, ballots, rosters",
  },
  {
    id: "payments",
    label: "Payments",
    path: "/admin/payments",
    description: "Fee tracking & PayPal",
  },
  {
    id: "cap-orders",
    label: "Cap Orders",
    path: "/admin/cap-orders",
    description: "Parent cap orders",
  },
  {
    id: "shirt-orders",
    label: "Shirt Orders",
    path: "/admin/shirt-orders",
    description: "Championship shirt orders",
  },
  {
    id: "shop",
    label: "Shop",
    path: "/admin/shop",
    description: "Public merch catalog",
  },
];

export default function AllStarProgramNav({
  stage,
  org,
  allSites = false,
}: {
  stage: AllStarProgramStage;
  org: ContentOrgId | null;
  /** Master All Sites mode (payments) — omit org on links where supported. */
  allSites?: boolean;
}) {
  const orgQuery = allSites || !org ? "" : `?org=${encodeURIComponent(org)}`;

  return (
    <nav
      className="mb-6 flex flex-wrap gap-2 border-b border-zinc-800 pb-3"
      aria-label="All-Star program stages"
    >
      {STAGES.map((item) => {
        const active = item.id === stage;
        return (
          <Link
            key={item.id}
            href={`${item.path}${orgQuery}`}
            className={
              active
                ? "rounded-lg border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-sm font-medium text-amber-100"
                : "rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
            }
            aria-current={active ? "page" : undefined}
            title={item.description}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
