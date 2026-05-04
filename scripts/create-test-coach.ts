/**
 * Creates a disposable `RegisteredUser` with `isCoach: true` for local / QA testing
 * (Dugout login, coach account setup, etc.).
 *
 * Usage:
 *   DATABASE_URL=... [SITE_ORG=gonzales|ascension|master] npm run coach:test
 *   DATABASE_URL=... npm run coach:test -- --password 'YourTempPassword1'
 *   DATABASE_URL=... npm run coach:test -- --delete <userId|cuid-or-email>
 *
 * Defaults: no local password (use /account/setup after “can register” login flow),
 * random email `test-coach+<unixMs>@apbaseball.test`, org bucket matches Dugout
 * (`master` → `gonzales` content org).
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { PrismaPostgresAdapter } from "@prisma/adapter-ppg";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const adapter = new PrismaPostgresAdapter({ connectionString });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

/** Same bucket as `getDugoutRegisteredUserOrgId()` in lib/siteConfig. */
function resolveRegisteredUserOrgId(): "gonzales" | "ascension" {
  const raw = process.env.SITE_ORG ?? "gonzales";
  if (raw === "ascension") return "ascension";
  return "gonzales";
}

function parseArgs(argv: string[]) {
  let deleteTarget: string | null = null;
  let password: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--delete") {
      deleteTarget = argv[++i] ?? "";
    } else if (a === "--password") {
      password = argv[++i] ?? "";
    } else if (a.startsWith("--password=")) {
      password = a.slice("--password=".length);
    }
  }
  return { deleteTarget, password };
}

async function deleteCoach(target: string) {
  const trimmed = target.trim();
  if (!trimmed) {
    console.error("Usage: npm run coach:test -- --delete <id-or-email>");
    process.exit(1);
  }
  const deleted = await prisma.registeredUser.deleteMany({
    where: {
      OR: [
        { id: trimmed },
        { email: { equals: trimmed, mode: "insensitive" } },
      ],
    },
  });
  console.log(`Deleted ${deleted.count} RegisteredUser row(s) matching "${trimmed}".`);
}

async function createCoach(explicitPassword: string | null) {
  const organizationId = resolveRegisteredUserOrgId();
  const stamp = Date.now();
  const email = `test-coach+${stamp}@apbaseball.test`.toLowerCase();
  const plain =
    explicitPassword && explicitPassword.length >= 8
      ? explicitPassword
      : null;
  if (explicitPassword && explicitPassword.length > 0 && !plain) {
    console.warn(
      "Ignoring --password: use at least 8 characters (app rule). Creating user with no password for setup flow.",
    );
  }
  const passwordHash = plain ? await bcrypt.hash(plain, 10) : null;

  const user = await prisma.registeredUser.create({
    data: {
      organizationId,
      email,
      firstName: "Test",
      lastName: "Coach",
      name: "Test Coach",
      isCoach: true,
      contactPhone: null,
      ageGroup: null,
      assignedTeam: null,
      passwordHash,
      googleSub: null,
    },
  });

  console.log("");
  console.log("Created disposable test coach");
  console.log("────────────────────────────────────");
  console.log(`  id:             ${user.id}`);
  console.log(`  organizationId: ${user.organizationId}`);
  console.log(`  email:          ${user.email}`);
  console.log(`  isCoach:        ${user.isCoach}`);
  if (plain) {
    console.log(`  password:       ${plain}`);
    console.log("");
    console.log("Sign in at Dugout with email + password above.");
  } else {
    console.log(`  password:       (none — first-time setup)`);
    console.log("");
    console.log(
      "Open the site, use local login with this email and any password to hit",
    );
    console.log(
      'the "finish account setup" flow, then complete /account/setup with a real password.',
    );
  }
  console.log("");
  console.log("Remove when finished:");
  console.log(`  npm run coach:test -- --delete ${user.id}`);
  console.log(`  # or: npm run coach:test -- --delete ${user.email}`);
  console.log("");
}

async function main() {
  const argv = process.argv.slice(2);
  const { deleteTarget, password } = parseArgs(argv);

  if (deleteTarget !== null) {
    await deleteCoach(deleteTarget);
    return;
  }

  await createCoach(password);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
