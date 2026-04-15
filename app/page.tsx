// app/page.tsx
import Image from "next/image";
import ScheduleTable from "@/components/ScheduleTable";
import { fetchGames, type Game } from "@/lib/fetchGames";
import { isRegistrationOpen } from "@/lib/registrationStatus";
import logo from "@/public/images/logo.png";

type ViewMode = "thisWeek" | "nextWeek" | "fullSeason";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const viewMode = (resolvedSearchParams.view as ViewMode) || "thisWeek";
  const regOpen = isRegistrationOpen();

  // Calculate date range based on view mode
  let startDate: string;
  let endDate: string;
  const now = new Date();

  if (viewMode === "thisWeek") {
    const startOfWeek = new Date(now);
    startOfWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1),
    );
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    startDate = startOfWeek.toISOString().split("T")[0];
    endDate = endOfWeek.toISOString().split("T")[0];
  } else if (viewMode === "nextWeek") {
    const startOfNextWeek = new Date(now);
    startOfNextWeek.setDate(
      now.getDate() - now.getDay() + (now.getDay() === 0 ? 1 : 8),
    );
    const endOfNextWeek = new Date(startOfNextWeek);
    endOfNextWeek.setDate(startOfNextWeek.getDate() + 6);
    startDate = startOfNextWeek.toISOString().split("T")[0];
    endDate = endOfNextWeek.toISOString().split("T")[0];
  } else {
    // Full Season
    startDate = "2026-03-01";
    endDate = "2026-06-30";
  }

  let games: Game[] = [];
  let error: string | null = null;

  try {
    games = await fetchGames({
      startDate,
      endDate,
      leagueId: 515712,
    });
  } catch (err: unknown) {
    error = err instanceof Error ? err.message : "Failed to load game data";
    console.error(err);
  }

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[75vh] p-4 flex items-center justify-center bg-black overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.18),transparent_50%),radial-gradient(circle_at_80%_80%,rgba(124,58,237,0.2),transparent_55%),linear-gradient(145deg,#09090b,#18181b)]" />
        <div className="absolute inset-0 opacity-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.12)_1px,transparent_1px)] bg-size-[48px_48px]" />
        <Image
          src={logo}
          alt="Gonzales Diamond Baseball"
          fill
          priority
          className="object-contain opacity-15 scale-[1.35] blur-[1px]"
        />
        <div className="absolute inset-0 bg-black/45" />

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full mb-6">
            SPRING 2026 SEASON
          </div>

          <h1 className="text-6xl md:text-7xl font-bold mb-6 tracking-tighter leading-none">
            Gonzales Diamond Baseball
          </h1>

          <p className="text-2xl md:text-3xl mb-10 text-brand-gold max-w-2xl mx-auto">
            Fun, development, and competition for kids ages 3–12 in Ascension
            Parish
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {regOpen && (
              <a
                href="#register"
                className="bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold text-xl px-12 py-5 rounded-xl transition-all active:scale-95"
              >
                Register Now
              </a>
            )}
            <a
              href="#schedule"
              className="border-2 border-white hover:bg-white hover:text-black font-semibold text-xl px-12 py-5 rounded-xl transition-all"
            >
              View Schedules
            </a>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="py-16 bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-3 gap-10 text-center">
          <div>
            <div className="text-6xl mb-3">🏟️</div>
            <h3 className="font-semibold text-xl mb-1">
              Tee-Joe Gonzales Park
            </h3>
            <p className="text-zinc-400">Primary home fields</p>
          </div>
          <div>
            <div className="text-6xl mb-3">📅</div>
            <h3 className="font-semibold text-xl mb-1">Registration</h3>
            <p className="text-brand-gold">
              {regOpen ? "Spring 2026 Season" : "Closed"}
            </p>
          </div>
          <div>
            <div className="text-6xl mb-3">📱</div>
            <h3 className="font-semibold text-xl mb-1">Live Scores</h3>
            <p className="text-zinc-400">Integrated with GameChanger</p>
          </div>
        </div>
      </section>

      {/* Schedule Table */}
      <ScheduleTable
        initialGames={games}
        initialError={error}
        currentViewMode={viewMode}
      />
    </main>
  );
}
