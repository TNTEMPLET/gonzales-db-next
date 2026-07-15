import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

async function main() {
  try {
    console.log('Adding organizationId to NewsPost...');
    await prisma.$executeRawUnsafe('ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT \'gonzales\'');
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "NewsPost_slug_key"');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "NewsPost_organizationId_slug_key" ON "NewsPost"("organizationId", "slug")');

    console.log('Adding organizationId to RegisteredUser...');
    await prisma.$executeRawUnsafe('ALTER TABLE "RegisteredUser" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT \'gonzales\'');
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "RegisteredUser_email_key"');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "RegisteredUser_organizationId_email_key" ON "RegisteredUser"("organizationId", "email")');

    console.log('Adding organizationId to DugoutPost...');
    await prisma.$executeRawUnsafe('ALTER TABLE "DugoutPost" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT \'gonzales\'');

    console.log('Adding organizationId to GameScore...');
    await prisma.$executeRawUnsafe('ALTER TABLE "GameScore" ADD COLUMN IF NOT EXISTS "organizationId" TEXT NOT NULL DEFAULT \'gonzales\'');
    await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "GameScore_gameExternalId_key"');
    await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS "GameScore_organizationId_gameExternalId_key" ON "GameScore"("organizationId", "gameExternalId")');

    console.log('Successfully added organizationId to tables.');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
