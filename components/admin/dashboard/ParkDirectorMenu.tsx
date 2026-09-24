import Link from "next/link";

import type { ContentOrgId } from "@/lib/siteConfig";

export default function ParkDirectorMenu({ org }: { org: ContentOrgId }) {
  const query = `?org=${org}`;
  const steps = [
    {
      title: "Scoreboard controllers",
      detail: "Enter the volunteer’s full name, check a controller out to their team, and check it back in.",
      href: `/admin/field-desk${query}#controllers`,
      action: "Check in / out",
    },
    {
      title: "Where the umpires are calling",
      detail: "Park, field, and time for the crew. Umpire names stay in Assignr.",
      href: `/admin/field-desk${query}#where`,
      action: "Open the list",
    },
    {
      title: "Umpire score cards",
      detail: "This week’s games, in the order of the boxes on the printed card.",
      href: `/admin/field-desk${query}#cards`,
      action: "Open the list",
    },
    {
      title: "Enter scores",
      detail: "After the game, put the final score in the book.",
      href: `/admin/scores${query}`,
      action: "Enter scores",
    },
    {
      title: "Umpire pay",
      detail: "Umpires working the selected park on the selected day, with games and pay.",
      href: "#umpire-pay",
      action: "Open pay",
    },
  ];

  return (
    <section className="space-y-4" data-park-director-menu="true">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Your work</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Game day is above. Then take the jobs in order. Season setup stays available when you are not on a game.
        </p>
      </div>
      <ol className="space-y-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <h3 className="text-base font-semibold text-white">
                <span className="mr-2 text-zinc-500">{index + 1}.</span>
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-400">{step.detail}</p>
            </div>
            <Link
              href={step.href}
              className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand-gold hover:text-brand-gold/80 sm:mt-0"
            >
              {step.action}
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-sm text-zinc-500">
        <Link href={`/admin/season-setup${query}`} className="font-semibold text-zinc-300 underline-offset-2 hover:underline">
          Season setup
        </Link>
        <span> is registration, coaches, jerseys, and the schedule. It is not part of game day.</span>
      </p>
    </section>
  );
}
