/**
 * Publish / update Gonzales DYB 11U pool-play news (homepage rotator).
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/publish-11u-pool-play-news.ts
 *
 * Easy to re-run when times/opponents change — upserts by slug.
 */
import { PrismaClient } from "@prisma/client";
import { createDatabaseAdapter } from "../lib/databaseAdapter";

const ORG = "gonzales";
const SLUG = "11u-pool-play-montgomery-july-2026";

const TITLE = "11U Pool Play Schedule — Lagoon Park, Montgomery";
const EXCERPT =
  "July 15–19 at Lagoon Park (Montgomery, AL). Four pool games Thursday–Friday; bracket play Saturday morning. GameChanger link inside.";
const AUTHOR = "Trent Templet";
const IMAGE_URL = "/images/news/11u-pool-play-montgomery-july-2026.png";

/** Game 4 source said "Friday July 14" — corrected to Friday July 17 (tournament window July 15–19). */
const CONTENT = `
<p><strong>Gonzales Diamond Baseball 11U</strong> heads to Montgomery for pool play and bracket play.</p>

<h2>Tournament info</h2>
<ul>
  <li><strong>Dates:</strong> July 15–19</li>
  <li><strong>Venue:</strong> Lagoon Park</li>
  <li><strong>Address:</strong> 2855 Lagoon Park Drive, Montgomery, AL</li>
</ul>

<h2>Pool play schedule</h2>
<table>
  <thead>
    <tr>
      <th>Game</th>
      <th>Day</th>
      <th>Time</th>
      <th>Opponent</th>
      <th>Field</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Game 1</td>
      <td>Thursday, July 16</td>
      <td>10:15 AM</td>
      <td>Pascagoula, MS</td>
      <td>Field 3</td>
    </tr>
    <tr>
      <td>Game 2</td>
      <td>Thursday, July 16</td>
      <td>2:00 PM</td>
      <td>Paris, TX</td>
      <td>Field 3</td>
    </tr>
    <tr>
      <td>Game 3</td>
      <td>Friday, July 17</td>
      <td>9:15 AM</td>
      <td>Monticello, AR</td>
      <td>Field 2</td>
    </tr>
    <tr>
      <td>Game 4</td>
      <td>Friday, July 17</td>
      <td>1:00 PM</td>
      <td>Mont American, AL</td>
      <td>Field 2</td>
    </tr>
  </tbody>
</table>

<p><strong>Bracket play</strong> begins Saturday morning.</p>

<h2>Follow live on GameChanger</h2>
<p>
  <a href="https://web.gc.com/teams/QenEEw6BubLt/live?pid=Email&amp;c=team_share_link" target="_blank" rel="noopener noreferrer">
    <strong>Open 11U GameChanger live scoreboard →</strong>
  </a>
</p>

<p><em>Schedules can change at the park — check GameChanger and coach updates for the latest times.</em></p>
`.trim();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const prisma = new PrismaClient({
    adapter: createDatabaseAdapter(url),
  });

  const data = {
    title: TITLE,
    excerpt: EXCERPT,
    content: CONTENT,
    imageUrl: IMAGE_URL,
    author: AUTHOR,
    featured: true,
    rotatorEnabled: true,
    status: "PUBLISHED" as const,
    publishedAt: new Date(),
  };

  const existing = await prisma.newsPost.findUnique({
    where: {
      organizationId_slug: { organizationId: ORG, slug: SLUG },
    },
    select: { id: true },
  });

  if (existing) {
    const updated = await prisma.newsPost.update({
      where: { id: existing.id },
      data,
    });
    console.log(
      JSON.stringify(
        {
          action: "updated",
          id: updated.id,
          slug: SLUG,
          rotatorEnabled: updated.rotatorEnabled,
          imageUrl: updated.imageUrl,
          url: `https://dyb.apbaseball.com/news/${SLUG}`,
        },
        null,
        2,
      ),
    );
  } else {
    const created = await prisma.newsPost.create({
      data: {
        organizationId: ORG,
        slug: SLUG,
        ...data,
      },
    });
    console.log(
      JSON.stringify(
        {
          action: "created",
          id: created.id,
          slug: SLUG,
          rotatorEnabled: created.rotatorEnabled,
          imageUrl: created.imageUrl,
          url: `https://dyb.apbaseball.com/news/${SLUG}`,
        },
        null,
        2,
      ),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
