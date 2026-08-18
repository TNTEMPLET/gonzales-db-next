import Link from "next/link";
import { redirect } from "next/navigation";

import CoachingInterestForm from "@/components/coaching-interest/CoachingInterestForm";
import { isCoachingInterestEnabled } from "@/lib/org/capabilities";
import { getDefaultContentOrg, getSiteConfig } from "@/lib/siteConfig";
import { getSportsConnectVolunteerRegistrationUrl } from "@/lib/sportsConnect/registrationUrl";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Coaching Interest | ${site.name}`,
    description: `Raise your hand to coach with ${site.name}.`,
  };
}

export default function CoachingInterestPage() {
  const site = getSiteConfig();
  const org = getDefaultContentOrg();
  const volunteerRegistrationUrl = getSportsConnectVolunteerRegistrationUrl();

  if (!isCoachingInterestEnabled(org)) redirect("/");

  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-zinc-100 text-zinc-950">
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:py-16">
        <div className="space-y-6">
          <Link href="/" className="text-sm font-semibold text-brand-purple hover:text-brand-purple-dark">
            Back to {site.name}
          </Link>
          <div className="space-y-4">
            <p className="inline-flex rounded-full bg-brand-purple/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-purple">
              Fall Ball Coach Pipeline
            </p>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              Interested in coaching this Fall?
            </h1>
            <p className="max-w-xl text-lg leading-8 text-zinc-600">
              Tell us where you are interested in helping this Fall so we can include you
              in coach communications as registration gets closer and teams begin to form.
            </p>
          </div>

          <div className="rounded-3xl border border-brand-gold/40 bg-brand-gold/10 p-5">
            <h2 className="text-lg font-bold text-zinc-900">
              Ready to officially register?
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              This form is just to raise your hand early. Official Volunteer
              Registration for Coaches &amp; Umpires happens on APBaseball.com.
            </p>
            <a
              href={volunteerRegistrationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex rounded-xl bg-brand-purple px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-purple-dark"
            >
              Volunteer Registration (Coaches &amp; Umpires)
            </a>
          </div>

          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">What happens next?</h2>
            <div className="mt-4 space-y-3 text-sm leading-6 text-zinc-600">
              <p>
                This form does not automatically make you an active coach or grant administrator access.
                It gives league administrators a clean list of interested coaches to contact.
              </p>
              <p>
                We will use your preferred age group, role, and past division notes to help with
                early planning and next-step communications.
              </p>
            </div>
          </div>
        </div>

        <CoachingInterestForm />
      </section>
    </main>
  );
}
