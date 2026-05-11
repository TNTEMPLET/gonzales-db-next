import Link from "next/link";
import { notFound } from "next/navigation";

import { getMetaPrivacyPolicyUrl } from "@/lib/privacy/metaPrivacyPolicyUrl";
import { getSiteConfig, isMasterDeployment } from "@/lib/siteConfig";

const lastUpdated = "May 11, 2026";
const contactEmail = "info@apbaseball.com";
const developerPrivacyUrl = "https://duckroostdigital.com/privacy";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Privacy Policy | ${site.name}`,
    description: `How ${site.name} handles administrator and integration data, including Meta Facebook Page publishing.`,
    alternates: {
      canonical: getMetaPrivacyPolicyUrl(),
    },
  };
}

const sections = [
  {
    title: "Who operates this site",
    body: [
      "This privacy policy applies to the AP Baseball master administration site at admin.apbaseball.com and related administrative tools operated for Ascension Parish Baseball / AP Baseball.",
      `Questions about this policy: ${contactEmail}.`,
    ],
  },
  {
    title: "Scope",
    body: [
      "This page covers data handled through the master admin control plane, including the Social media module that publishes to the shared AP Baseball Facebook Page.",
      "Public league program sites (for example Gonzales DYB and Ascension Little League) may have their own practices for families and coaches. This policy does not replace notices on those sites.",
    ],
  },
  {
    title: "Information we collect",
    body: [
      "Administrator account information such as name, email address, role, and organization access.",
      "Content submitted through admin tools, including social posts, uploaded images, news drafts, operational records, and moderation actions.",
      "Technical data such as IP address, browser type, device information, and server logs used for security, troubleshooting, and performance.",
      "When you authorize Meta (Facebook) integrations, Meta may share Page identifiers, Page access tokens, and related metadata needed to publish or sync content. We do not receive your Facebook password.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "Authenticate administrators and enforce role-based access.",
      "Operate league administration features across supported organizations.",
      "Publish or manage Facebook Page content when an authorized admin uses connected features.",
      "Respond to support requests and comply with law.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "We use infrastructure providers (for example hosting, databases, and file storage) that process data on our behalf under contract.",
      "Meta processes data according to its own terms when you connect Facebook features.",
      "We do not sell personal information.",
    ],
  },
  {
    title: "Retention and security",
    body: [
      "We keep information only as long as needed for the purposes above, unless a longer period is required by law or legitimate operational needs.",
      "We use reasonable administrative, technical, and organizational safeguards. No method of transmission or storage is completely secure.",
    ],
  },
  {
    title: "Your choices",
    body: [
      "You may contact us to request access, correction, or deletion of information we control, subject to legal and operational limits.",
      "You can revoke Meta permissions in your Facebook settings. Removing access may disable features that depend on those permissions.",
    ],
  },
  {
    title: "Children",
    body: [
      "Master admin tools are intended for adults managing league operations. They are not directed to children under 13, and we do not knowingly collect personal information from children under 13 through this site.",
    ],
  },
  {
    title: "Application developer",
    body: [
      `Custom software for this site is developed and maintained by DuckRoost Digital. See ${developerPrivacyUrl} for developer-hosted privacy practices that support client applications and integrations.`,
    ],
  },
  {
    title: "Changes",
    body: [
      "We may update this policy from time to time. The Last updated date at the top of this page will change when we do.",
    ],
  },
] as const;

export default function PrivacyPage() {
  if (!isMasterDeployment()) {
    notFound();
  }

  const site = getSiteConfig();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14">
      <section className="max-w-3xl mx-auto px-6">
        <p className="text-sm text-zinc-500">Last updated {lastUpdated}</p>
        <h1 className="mt-3 text-4xl md:text-5xl font-bold tracking-tight mb-3">
          Privacy Policy
        </h1>
        <p className="text-zinc-400 leading-relaxed">
          This page explains how {site.name} handles information for administrative
          features and Meta integrations, including Facebook Page publishing from the
          Social media module.
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title} aria-labelledby={`privacy-${section.title}`}>
              <h2
                id={`privacy-${section.title}`}
                className="text-2xl font-semibold text-white"
              >
                {section.title}
              </h2>
              <div className="mt-4 space-y-4 text-base leading-relaxed text-zinc-400">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-12 text-sm text-zinc-500">
          Contact:{" "}
          <a
            href={`mailto:${contactEmail}`}
            className="text-brand-gold underline-offset-4 hover:underline"
          >
            {contactEmail}
          </a>
          . Return to the{" "}
          <Link href="/" className="text-brand-gold underline-offset-4 hover:underline">
            home page
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
