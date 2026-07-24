import TripParentForm from "@/components/trip/TripParentForm";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Travel Form | ${site.name}`,
    description: "Submit All-Star travel roster information for your player.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-zinc-950 py-10 text-white sm:py-14">
      <section className="mx-auto max-w-lg px-4 sm:px-6">
        <TripParentForm token={token} />
      </section>
    </main>
  );
}
