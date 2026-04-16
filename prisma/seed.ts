import { PrismaClient } from "@prisma/client";
import { NewsStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const posts = [
    {
      title: "Spring Opening Day Parade Announced",
      slug: "spring-opening-day-parade-announced",
      excerpt:
        "Join us Saturday morning for player introductions and first pitch.",
      content:
        "Opening Day starts at 8:30 AM with team check-in, followed by a parade of teams and first games at 10:00 AM.",
      author: "League Staff",
      status: NewsStatus.PUBLISHED,
      featured: true,
      publishedAt: new Date(),
    },
    {
      title: "Weather Policy And Rainout Alerts",
      slug: "weather-policy-and-rainout-alerts",
      excerpt:
        "How and where weather updates will be posted during the season.",
      content:
        "Rainout updates will be posted to the schedule board and announced through league communication channels as conditions change.",
      author: "Board of Directors",
      status: NewsStatus.PUBLISHED,
      featured: false,
      publishedAt: new Date(),
    },
  ];

  for (const post of posts) {
    await prisma.newsPost.upsert({
      where: { slug: post.slug },
      create: post,
      update: {
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        author: post.author,
        status: post.status,
        featured: post.featured,
        publishedAt: post.publishedAt,
      },
    });
  }

  console.log(`Seeded ${posts.length} news posts`);

  const bootstrapEmail =
    process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (bootstrapEmail && bootstrapPassword) {
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

    await prisma.adminUser.upsert({
      where: { email: bootstrapEmail },
      create: {
        email: bootstrapEmail,
        name: "Site Admin",
        passwordHash,
      },
      update: {
        passwordHash,
      },
    });

    console.log(`Bootstrapped admin: ${bootstrapEmail}`);
  } else {
    console.log(
      "No bootstrap admin created. Use `npm run admin:create -- <email> [password] [name]`.",
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
