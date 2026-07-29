import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

const ORG = "fallball";
const SLUG = "fall-ball-2026-registration-age-cutoff";

const TITLE = "Fall Ball Registration Opens August 1 — Age Cut-Off Update";
const EXCERPT =
  "Registration opens August 1. New families: create your APBaseball.com account now. Age cut-off for Fall Ball 2026 moves to April 30, 2027.";
const AUTHOR = "AP Baseball";
const IMAGE_URL = process.env.FLYER_URL || "";
const FB_POST = "https://www.facebook.com/share/p/1BhCRcuqVV/";
const APBASEBALL = "https://www.apbaseball.com";

const CONTENT = `
<p><strong>FALL BALL REGISTRATION WILL OPEN AUGUST 1st</strong></p>

<p>⚾ <strong>Important Fall Ball Age Cut-Off Update</strong> ⚾</p>

<p>For the 2026 AP Baseball Fall Ball season, we are making a <strong>one-season adjustment</strong> to our age cut-off date.</p>

<h2>Next steps for new players</h2>
<p>Registration is handled on <a href="${APBASEBALL}" target="_blank" rel="noopener noreferrer"><strong>APBaseball.com</strong></a>. If your family is new to the league, create an account <strong>before August 1</strong> so you can register as soon as the window opens.</p>
<ol>
  <li><strong>Create an account</strong> at <a href="${APBASEBALL}" target="_blank" rel="noopener noreferrer">APBaseball.com</a> (returning families can sign in).</li>
  <li><strong>Add your player(s)</strong> to your family profile.</li>
  <li><strong>On or after August 1</strong>, complete Fall Ball registration and payment on APBaseball.com.</li>
</ol>
<p>
  <a href="${APBASEBALL}" target="_blank" rel="noopener noreferrer"><strong>Create account / sign in at APBaseball.com →</strong></a>
  &nbsp;·&nbsp;
  <a href="/registration"><strong>Full registration checklist →</strong></a>
</p>

<h2>Age cut-off dates</h2>
<ul>
  <li><strong>Previous Fall Ball cut-off:</strong> August 31, 2027</li>
  <li><strong>New Fall Ball 2026 cut-off:</strong> April 30, 2027</li>
</ul>

<h2>Why the change?</h2>
<p>At AP Baseball, players traditionally move up to their next age division during Fall Ball. Since Fall Ball is designed as a developmental season—focused on learning, skill development, and preparing for the spring—we want to better align our age groups with the upcoming spring season.</p>

<h2>What does this mean for my player?</h2>
<p>If your child has a birthday <strong>after April 30, 2027</strong>, they will remain in the same age division they played in this past spring for Fall Ball 2026.</p>
<p>The players most affected by this change are those with birthdays between <strong>May 1 and August 31</strong>.</p>
<p>This change will help ensure players are developing alongside others who will be in the same division when the regular season begins.</p>

<p>We understand this is a change from previous years and appreciate everyone's patience as we work to provide the best possible experience for our players.</p>

<p>If you're unsure which division your player will be in, please don't hesitate to reach out—we're happy to help!</p>

<p><strong>Questions:</strong> <a href="mailto:info@apbaseball.com">info@apbaseball.com</a></p>

<p>❤️⚾ Thank you for being part of the AP Baseball family!</p>

<p><em>Source: <a href="${FB_POST}" target="_blank" rel="noopener noreferrer">AP Baseball Facebook announcement</a></em></p>
`.trim();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(url),
  });

  const existing = await prisma.newsPost.findUnique({
    where: {
      organizationId_slug: { organizationId: ORG, slug: SLUG },
    },
    select: { id: true, imageUrl: true },
  });

  const data = {
    title: TITLE,
    excerpt: EXCERPT,
    content: CONTENT,
    imageUrl: IMAGE_URL || existing?.imageUrl || null,
    author: AUTHOR,
    featured: true,
    rotatorEnabled: true,
    status: "PUBLISHED" as const,
    publishedAt: new Date(),
  };

  if (!data.imageUrl) {
    throw new Error("FLYER_URL is required when creating a new post (or set image on existing)");
  }

  if (existing) {
    const updated = await prisma.newsPost.update({
      where: { id: existing.id },
      data,
    });
    console.log(JSON.stringify({ action: "updated", id: updated.id, slug: SLUG, imageUrl: updated.imageUrl, url: `https://fallball.apbaseball.com/news/${SLUG}` }, null, 2));
  } else {
    const created = await prisma.newsPost.create({
      data: { organizationId: ORG, slug: SLUG, ...data },
    });
    console.log(JSON.stringify({ action: "created", id: created.id, slug: SLUG, imageUrl: created.imageUrl, url: `https://fallball.apbaseball.com/news/${SLUG}` }, null, 2));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
