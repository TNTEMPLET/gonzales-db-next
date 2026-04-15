import Link from "next/link";
import { isRegistrationOpen } from "@/lib/registrationStatus";

export const metadata = {
  title: "Registration | Gonzales Diamond Baseball",
  description:
    "Register your player for the Gonzales Diamond Youth Baseball League Spring 2026 Season.",
};

export default function RegistrationPage() {
  const regOpen = isRegistrationOpen();

  if (!regOpen) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center px-6 max-w-2xl">
          <div className="text-7xl mb-6">🚫</div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Registration Closed
          </h1>
          <p className="text-zinc-300 text-xl mb-8">
            Registration for the Spring 2026 season is now closed. Thank you for
            your interest in Gonzales Diamond Baseball!
          </p>
          <Link
            href="/"
            className="bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold px-8 py-3 rounded-lg transition"
          >
            Return to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      {/* Hero */}
      <section className="bg-zinc-900 border-b border-zinc-800 py-14 px-6 text-center">
        <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full mb-6">
          SPRING 2026 SEASON
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Player Registration
        </h1>
        <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
          Gonzales Diamond Youth Baseball League &mdash; Ages 3–17
        </p>
      </section>

      <div className="max-w-3xl mx-auto px-6 py-12 space-y-10">
        {/* Important Notice */}
        <div className="border border-brand-gold/40 bg-brand-gold/5 rounded-xl p-5">
          <p className="font-bold text-brand-gold text-center tracking-wide">
            PLEASE READ THIS ENTIRE PAGE BEFORE STARTING THE REGISTRATION
            PROCESS
          </p>
        </div>

        {/* Intro */}
        <section className="space-y-4 text-zinc-300 leading-relaxed">
          <p>
            We want to express our gratitude for your interest in Gonzales
            Diamond Youth Baseball in partnership with AP Baseball. This marks
            our 2nd season of affiliation with Diamond Youth Baseball. Committed
            parents, devoted coaches, generous sponsors, and the continued
            support of the City of Gonzales Recreation Department have all come
            together to bring about positive changes!
          </p>
          <p>
            AP Baseball operates two separate/independent baseball
            organizations: Ascension Little League and Gonzales Diamond League.
            Both leagues have reached capacity in the past and we expect the
            same again this year, so it is essential to register early.
            Ascension Little League holds its team selection process first. If
            the league reaches capacity, players not assigned to an Ascension
            Little League team may then attend the Gonzales DYB showcase and
            will be placed on a team.
          </p>
          <p className="font-semibold italic">
            This primarily affects the 9–12U divisions. Because the leagues
            operate independently, players must register and pay for each league
            they wish to be considered for, and the league they do not play in
            will issue a full refund.
          </p>
          <div className="border border-zinc-600 bg-zinc-900 rounded-xl p-4">
            <span className="font-bold text-white">PLEASE NOTE: </span>
            <span>
              This is a BASEBALL LEAGUE. While girls/females are allowed and
              invited to register through 12-year-old divisions —{" "}
              <strong className="text-white">WE ARE PLAYING BASEBALL!</strong>
            </span>
          </div>
        </section>

        {/* League Description */}
        <section>
          <h2 className="text-xl font-bold text-brand-gold mb-4 uppercase tracking-wide">
            Gonzales Diamond Youth Baseball — League Description
          </h2>
          <ul className="space-y-2 text-zinc-300 list-disc list-inside">
            <li>More typical recreational-type experience</li>
            <li>No prior playing experience is necessary</li>
            <li>Typically, 8–10 teams per age division with 12 players each</li>
            <li>
              Introduces and teaches basic baseball skills and fundamentals
            </li>
            <li>
              More opportunities to develop and play multiple positions in the
              field, pitching, etc.
            </li>
            <li>
              A showcase will be held only to assess the player&apos;s skill
              level for the league draft — all players will be assigned to a
              team
            </li>
            <li>2 practices per week before regular-season games</li>
            <li>
              2 games per week, at least 12 regular-season games plus postseason
              tournament
            </li>
            <li>
              Regular-season games focus on instruction and skills development.
              The post-season tournament will determine the league champions
            </li>
            <li>
              Will offer post-season All-Star experience play through Diamond
              Youth Baseball
            </li>
          </ul>
        </section>

        {/* Age Divisions */}
        <section>
          <h2 className="text-xl font-bold text-brand-gold mb-4 uppercase tracking-wide">
            Age Group Divisions
          </h2>
          <p className="text-zinc-400 mb-1">
            <strong className="text-white">
              Diamond Youth Baseball League Age Divisions:
            </strong>{" "}
            <em>Age as of April 30th, 2026</em>
          </p>
          <p className="text-zinc-400 mb-4 text-sm italic">
            *9-year-olds with birthday between May 1st, 2026 – August 31st, 2026
            are allowed to play &quot;up&quot;
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <h3 className="font-semibold text-white mb-2">DYB Minors</h3>
              <ul className="text-zinc-400 space-y-1 text-sm">
                <li>9-year-old DYB Minors</li>
                <li>10-year-old DYB Minors</li>
                <li>11/12-year-old DYB Minors</li>
              </ul>
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <h3 className="font-semibold text-white mb-2">
                High School Age Divisions
              </h3>
              <ul className="text-zinc-400 space-y-1 text-sm">
                <li>13/15-year-old (DYB)</li>
                <li>15/17-year-old (DYB)</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Registration Details */}
        <section>
          <h2 className="text-xl font-bold text-brand-gold mb-4 uppercase tracking-wide">
            How to Register
          </h2>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-white">
                Regular Registration
              </span>
              <span className="text-2xl font-bold text-brand-gold">$95</span>
            </div>
            <div className="h-px bg-zinc-800" />
            <div className="border border-red-800 bg-red-950/40 rounded-lg p-3 text-center">
              <p className="font-bold text-red-400 tracking-wide">
                *** THERE IS NO LATE REGISTRATION THIS YEAR ***
              </p>
            </div>
            <ul className="text-zinc-300 space-y-1 text-sm list-disc list-inside">
              <li>December 1st – December 20th for ages 3–17 years old</li>
              <li>
                Registration extended until January 31st for ages 14–17 years
                old
              </li>
            </ul>
          </div>

          <p className="text-zinc-300 mb-4">
            You can easily complete your Sports Connect registration online,
            24/7, by visiting{" "}
            <a
              href="http://www.apbaseball.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-gold hover:underline"
            >
              www.apbaseball.com
            </a>
            .
          </p>

          <div className="grid sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <h3 className="font-semibold text-white mb-2">New Players</h3>
              <ol className="text-zinc-400 text-sm space-y-2 list-decimal list-inside">
                <li>
                  Create an account — click &quot;Register&quot; in the top
                  right corner of the AP Baseball website homepage
                </li>
                <li>
                  Once your account is created, click the &quot;Player
                  Registration&quot; tab in the menu
                </li>
              </ol>
            </div>
            <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
              <h3 className="font-semibold text-white mb-2">
                Returning Players
              </h3>
              <p className="text-zinc-400 text-sm">
                Log in using your existing account details and click the
                &quot;Player Registration&quot; tab in the menu.
              </p>
            </div>
          </div>

          <div className="space-y-3 text-zinc-300 text-sm">
            <p>
              The online process will ensure the player is positioned in the
              proper age division. Participation fees are paid online via debit
              or credit card during the registration process.
            </p>
            <p className="font-semibold text-white">
              Refunds are available through the end of regular registration,
              minus a $10.00 fee. NO REFUNDS AFTER REGULAR REGISTRATION CLOSES!
            </p>
            <div className="border border-brand-purple/40 bg-brand-purple/10 rounded-xl p-4">
              <p>
                Space is limited, so{" "}
                <strong className="text-white">
                  PLEASE complete the registration process AS SOON AS POSSIBLE
                </strong>
                . Once an age division is at capacity, a waitlist option will be
                offered. Players will be moved from the waitlist into the league
                on a first-come, first-served basis. Players moved from the
                waitlist will have 72 hours to pay the registration fee, or they
                will be subject to cancellation to allow for the next player on
                the list to be moved.
              </p>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-white">Questions?</h2>
          <p className="text-zinc-300 text-sm">
            If you have issues or difficulty with the online registration
            process, please email us and include your name and phone number.
          </p>
          <p className="text-zinc-300 text-sm">
            We are <strong className="text-white">VERY excited</strong> to
            provide this baseball experience to the kids of Ascension Parish and
            our surrounding neighbors. Good luck and{" "}
            <strong className="text-white">HAVE FUN!!!</strong>
          </p>
          <a
            href="mailto:info@apbaseball.com"
            className="inline-block mt-2 text-brand-gold hover:underline font-medium"
          >
            info@apbaseball.com
          </a>
        </section>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <a
            href="http://www.apbaseball.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-purple hover:bg-brand-purple-dark text-white font-semibold text-lg px-10 py-4 rounded-xl text-center transition-all active:scale-95"
          >
            Register at APBaseball.com
          </a>
          <Link
            href="/"
            className="border-2 border-white hover:bg-white hover:text-black font-semibold text-lg px-10 py-4 rounded-xl text-center transition-all"
          >
            View Schedules
          </Link>
        </div>
      </div>
    </main>
  );
}
