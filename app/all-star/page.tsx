import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";
import AllStarQRCode from "@/components/allStar/AllStarQRCode";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `All-Stars | ${site.name}`,
    description: `All-Star information, payment links, and rosters for ${site.name}.`,
  };
}

type RosterEntry = { playerFullName: string; team: string };

function isSafePayPalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const p = new URL(url);
    if (p.protocol !== "https:") return false;
    const host = p.hostname.toLowerCase();
    const allowed = ["paypal.com", "www.paypal.com", "paypal.me", "www.paypal.me"];
    return allowed.some((h) => host === h || host.endsWith("." + h));
  } catch {
    return false;
  }
}

export default async function AllStarPage() {
  if (isMasterDeployment()) redirect("/admin");

  const site = getSiteConfig();
  const orgId = site.orgId === "ascension" ? "ascension" : "gonzales";

  const [config, payments] = await Promise.all([
    prisma.allStarPageConfig.findUnique({ where: { organizationId: orgId } }),
    prisma.allStarPayment.findMany({
      where: { organizationId: orgId },
      select: { playerFullName: true, team: true, rosterTag: true },
      orderBy: [{ rosterTag: "asc" }, { playerFullName: "asc" }],
    }),
  ]);

  const safePayPalUrl = isSafePayPalUrl(config?.paypalLinkUrl) ? config!.paypalLinkUrl! : null;
  const hasPayPal = !!safePayPalUrl;
  const hasRosters = payments.length > 0;
  const hasInfo = !!config?.infoText?.trim();

  // Redirect if nothing to show
  if (!hasPayPal && !hasRosters && !hasInfo) redirect("/");

  // Group payments by rosterTag
  const byRoster = new Map<string, RosterEntry[]>();
  for (const p of payments) {
    const tag = p.rosterTag ?? "All-Stars";
    const list = byRoster.get(tag) ?? [];
    list.push({ playerFullName: p.playerFullName, team: p.team });
    byRoster.set(tag, list);
  }

  const rosterGroups = Array.from(byRoster.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    <main className="min-h-screen bg-zinc-950 py-12 text-white sm:py-16">
      <section className="mx-auto max-w-4xl px-4 sm:px-6 space-y-10">

        {/* Page header */}
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-brand-gold font-semibold mb-2 opacity-80">
            {site.shortName}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">All-Stars</h1>
          {hasInfo && (
            <p className="text-zinc-300 text-base max-w-2xl mx-auto mt-4 leading-relaxed">
              {config!.infoText}
            </p>
          )}
        </div>

        {/* PayPal section */}
        {hasPayPal && (
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/50 p-8">
            <h2 className="text-xl font-semibold text-center mb-6 text-white">
              {config!.paypalLinkLabel ?? "All-Star Payment"}
            </h2>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
              {/* Pay button */}
              <div className="flex flex-col items-center gap-4">
                <a
                  href={safePayPalUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0070ba] hover:bg-[#003087] transition-colors px-8 py-4 text-white font-semibold text-lg shadow-lg"
                >
                  <PayPalIcon />
                  Pay with PayPal
                </a>
                <p className="text-xs text-zinc-500">Opens in a new tab</p>
              </div>

              {/* Divider */}
              <div className="hidden sm:flex flex-col items-center gap-2 text-zinc-600 select-none">
                <div className="h-16 w-px bg-zinc-700" />
                <span className="text-xs">or</span>
                <div className="h-16 w-px bg-zinc-700" />
              </div>
              <div className="sm:hidden flex items-center gap-3 text-zinc-600 select-none w-full">
                <div className="flex-1 h-px bg-zinc-700" />
                <span className="text-xs">or scan QR code</span>
                <div className="flex-1 h-px bg-zinc-700" />
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-zinc-400 mb-1">Scan to pay</p>
                <AllStarQRCode url={safePayPalUrl!} label={config!.paypalLinkLabel ?? "all-star-payment"} />
              </div>
            </div>
          </div>
        )}

        {/* Rosters */}
        {hasRosters && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white">All-Star Rosters</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {rosterGroups.map(([tag, players]) => (
                <RosterCard key={tag} tag={tag} players={players} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function RosterCard({ tag, players }: { tag: string; players: RosterEntry[] }) {
  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-700/50 bg-zinc-800/30">
        <h3 className="text-sm font-semibold text-zinc-200 truncate">{tag}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{players.length} player{players.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="px-5 py-3">
        <ul className="space-y-1">
          {players.map((p, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className="text-zinc-200">{p.playerFullName}</span>
              {p.team && <span className="text-zinc-500 text-xs truncate ml-4">{p.team}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function PayPalIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white" aria-hidden>
      <path d="M19.554 9.488c.121.563.106 1.246-.04 2.051-.582 2.978-2.477 4.466-5.683 4.466h-.442a.666.666 0 0 0-.444.166.72.72 0 0 0-.239.427l-.041.189-.476 3.05-.022.114a.718.718 0 0 1-.239.427.666.666 0 0 1-.444.166H9.273a.395.395 0 0 1-.416-.479l.492-3.137.008-.042a.72.72 0 0 1 .239-.427.666.666 0 0 1 .444-.166h.442c3.206 0 5.1-1.488 5.683-4.466.146-.805.161-1.488.04-2.051C17.97 9.01 18.764 9.095 19.554 9.488zM9.33 3.75a.666.666 0 0 1 .444.166.72.72 0 0 1 .239.427l.012.07 1.044 6.621a.72.72 0 0 1-.239.427.666.666 0 0 1-.444.166H8.26a.72.72 0 0 1-.23-.039 2.032 2.032 0 0 0-.454-.01L4.68 11.91a.397.397 0 0 1-.398-.324l-1.67-10.6a.395.395 0 0 1 .416-.479h3.64a.666.666 0 0 1 .444.166.72.72 0 0 1 .239.427L6.89 1.5h.44l.4 2.25H9.33z" />
    </svg>
  );
}
