// Never prerender — queried DB tables may not exist in all environments yet
export const dynamic = "force-dynamic";

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

  type PageLink = { label: string; url: string; imageUrl?: string; activeFrom?: string; activeTo?: string; enabled?: boolean };
  type PageConfig = { paypalLinkUrl: string | null; paypalLinkLabel: string | null; infoText: string | null; links: PageLink[] };
  let config: PageConfig | null = null;
  let payments: { playerFullName: string; team: string; rosterTag: string | null }[] = [];
  try {
    const [rawConfig, rawPayments] = await Promise.all([
      prisma.allStarPageConfig.findUnique({ where: { organizationId: orgId } }),
      prisma.allStarPayment.findMany({
        where: { organizationId: orgId },
        select: { playerFullName: true, team: true, rosterTag: true },
        orderBy: [{ rosterTag: "asc" }, { playerFullName: "asc" }],
      }),
    ]);
    config = rawConfig ? { ...rawConfig, links: (rawConfig.links as PageLink[]) ?? [] } : null;
    payments = rawPayments;
  } catch {
    redirect("/");
  }

  const safePayPalUrl = isSafePayPalUrl(config?.paypalLinkUrl) ? config!.paypalLinkUrl! : null;
  const hasPayPal = !!safePayPalUrl;
  function isLinkActive(link: PageLink): boolean {
    if (link.enabled === false) return false;
    const now = new Date();
    if (link.activeFrom && new Date(link.activeFrom) > now) return false;
    if (link.activeTo && new Date(link.activeTo) < now) return false;
    return true;
  }
  const safeLinks = (config?.links ?? [])
    .filter((l): l is PageLink => typeof l.label === "string" && isSafePayPalUrl(l.url))
    .filter(isLinkActive)
    .map((l) => ({
      ...l,
      imageUrl: l.imageUrl && /^https:\/\//i.test(l.imageUrl) ? l.imageUrl : undefined,
    }));
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

  const USSSA_AGE_GROUPS = new Set(["7U", "8U"]);
  const byAge = (tag: string) => parseInt((/([0-9]+)U/i.exec(tag) ?? ["", "0"])[1], 10);
  const allEntries = Array.from(byRoster.entries());
  const llGroups = allEntries
    .filter(([tag]) => !USSSA_AGE_GROUPS.has(parseAgeGroup(tag)))
    .sort(([a], [b]) => byAge(b) - byAge(a));
  const usssaGroups = orgId === "ascension"
    ? allEntries
        .filter(([tag]) => USSSA_AGE_GROUPS.has(parseAgeGroup(tag)))
        .sort(([a], [b]) => byAge(a) - byAge(b))
    : [];

  return (
    <main className="min-h-screen bg-zinc-950 py-8 text-white sm:py-12">
      <section className="mx-auto max-w-4xl px-4 sm:px-6 space-y-6">

        {/* Page header */}
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">All-Stars</h1>
          {hasInfo && (
            <p className="text-zinc-300 text-base max-w-2xl mx-auto mt-4 leading-relaxed">
              {config!.infoText}
            </p>
          )}
        </div>

        {/* PayPal section — primary / prominent */}
        {hasPayPal && (
          <div className="rounded-xl border border-zinc-600 bg-zinc-900/70 px-4 py-6 sm:px-8 ring-1 ring-zinc-600/30">
            <p className="text-base font-bold text-center text-white mb-5">
              {config!.paypalLinkLabel ?? "All-Star Payment"}
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-6">
              {/* Pay button */}
              <a
                href={safePayPalUrl!}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[#0070ba] hover:bg-[#003087] transition-colors px-5 py-2.5 text-white font-semibold text-sm shadow"
              >
                <PayPalIcon />
                Pay with PayPal
              </a>

              {/* Divider */}
              <div className="flex items-center gap-2 text-zinc-600 select-none w-full sm:w-auto sm:flex-col sm:self-stretch">
                <div className="flex-1 h-px sm:h-full sm:w-px bg-zinc-700" />
                <span className="text-xs">or</span>
                <div className="flex-1 h-px sm:h-full sm:w-px bg-zinc-700" />
              </div>

              {/* QR code */}
              <div className="flex flex-col items-center gap-1.5">
                <p className="text-xs text-zinc-500">Scan to pay</p>
                <AllStarQRCode url={safePayPalUrl!} label={config!.paypalLinkLabel ?? "all-star-payment"} />
              </div>
            </div>
            <p className="text-xs text-zinc-600 text-center mt-3">Opens in a new tab</p>
          </div>
        )}

        {/* Additional purchase links — landscape secondary cards */}
        {safeLinks.map((link) => (
          <div key={link.url} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden flex flex-row h-36">
            {/* Image */}
            {link.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={link.imageUrl}
                alt={link.label}
                className="w-36 sm:w-44 object-cover shrink-0"
              />
            )}
            {/* Content */}
            <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-3 py-3 min-w-0">
              <p className="text-xs font-semibold text-zinc-300 truncate w-full text-center">{link.label}</p>
              <div className="flex items-center gap-3">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#0070ba]/90 hover:bg-[#003087] transition-colors px-3 py-2 text-white font-medium text-xs shadow whitespace-nowrap"
                >
                  <PayPalIcon />
                  Pay with PayPal
                </a>
                <div className="h-10 w-px bg-zinc-700/60 shrink-0" />
                <AllStarQRCode url={link.url} label={link.label} size={72} />
              </div>
            </div>
          </div>
        ))}

        {/* Little League Rosters */}
        {llGroups.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-white">All-Star Rosters</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {llGroups.map(([tag, players]) => (
                <RosterCard key={tag} tag={tag} players={players} />
              ))}
            </div>
          </div>
        )}

        {/* USSSA Rosters — Ascension only */}
        {usssaGroups.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <h2 className="text-xl font-semibold text-white">USSSA</h2>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {usssaGroups.map(([tag, players], idx) => {
                const lone = usssaGroups.length % 2 === 1 && idx === usssaGroups.length - 1;
                return (
                  <div key={tag} className={lone ? "sm:col-span-2" : ""}>
                    <RosterCard tag={tag} players={players} wide={lone} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}


const AGE_GROUP_LABELS: Record<string, string> = {
  "6U": "Coaches Pitch",
  "8U MAJ": "Coaches Pitch",
  "6U Mod": "Tee-ball",
};

function parseAgeGroup(tag: string): string {
  const parts = tag.split(" - ");
  if (parts.length < 3) return tag;
  return parts.slice(1, -1).join(" - ")
    .replace(/\bLLB\b/g, "").replace(/\bDYB\b/g, "").replace(/\s{2,}/g, " ").trim();
}

function formatRosterTag(tag: string): string {
  const parts = tag.split(" - ");
  if (parts.length < 3) return tag;
  const ageGroup = parseAgeGroup(tag);
  const label = AGE_GROUP_LABELS[ageGroup] ?? ageGroup;
  const color = parts[parts.length - 1];
  const titleColor = color.charAt(0).toUpperCase() + color.slice(1).toLowerCase();
  return `${label} | ${titleColor}`;
}

function RosterCard({ tag, players, wide = false }: { tag: string; players: RosterEntry[]; wide?: boolean }) {
  const label = formatRosterTag(tag);
  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/40 overflow-hidden h-full">
      <div className="px-5 py-3 border-b border-zinc-700/50 bg-zinc-800/30">
        <h3 className="text-sm font-semibold text-zinc-200 truncate">{label}</h3>
        <p className="text-xs text-zinc-500 mt-0.5">{players.length} player{players.length !== 1 ? "s" : ""}</p>
      </div>
      <div className="px-5 py-3">
        <ul className={wide ? "grid grid-cols-2 gap-x-8 gap-y-1" : "space-y-1"}>
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
      <path d="M15.607 4.653H8.941L6.645 19.251H1.82L4.862 0h7.995c3.754 0 6.375 2.294 6.473 5.513-.648-.478-2.105-.86-3.722-.86m6.57 5.546c0 3.41-3.01 6.853-6.958 6.853h-2.493L11.595 24H6.74l1.845-11.538h3.592c4.208 0 7.346-3.634 7.153-6.949a5.24 5.24 0 0 1 2.848 4.686M9.653 5.546h6.408c.907 0 1.942.222 2.363.541-.195 2.741-2.655 5.483-6.441 5.483H8.714Z" />
    </svg>
  );
}
