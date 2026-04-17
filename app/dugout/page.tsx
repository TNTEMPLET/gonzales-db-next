import { cookies } from "next/headers";

import DugoutGate from "@/components/dugout/DugoutGate";
import DugoutTimeline from "@/components/dugout/DugoutTimeline";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserByToken,
} from "@/lib/auth/adminSession";
import {
  COACH_SESSION_COOKIE,
  getCoachUserFromCookieToken,
} from "@/lib/auth/coachSession";
import prisma from "@/lib/prisma";

export const metadata = {
  title: "The Dugout | Gonzales Diamond Baseball",
  description: "Coaches-only discussion feed.",
};

export default async function DugoutPage() {
  const cookieStore = await cookies();

  // Check coach session first, then fall back to admin session
  const coachToken = cookieStore.get(COACH_SESSION_COOKIE)?.value;
  const coach = await getCoachUserFromCookieToken(coachToken);

  const adminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const admin = coach ? null : await getAdminUserByToken(adminToken);

  const authed = coach ?? admin;

  if (!authed) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 text-center">
          <h1 className="text-3xl font-bold">The Dugout</h1>
          <p className="text-zinc-400">
            Coaches-only. Sign in with the Google account associated with your
            coach profile to continue.
          </p>
          <DugoutGate />
        </div>
      </main>
    );
  }

  const rawPosts = await prisma.dugoutPost.findMany({
    orderBy: { createdAt: "desc" },
    take: 120,
    include: {
      author: {
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  const initialPosts = rawPosts.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }));

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <DugoutTimeline
        initialPosts={initialPosts}
        isAdmin={!!admin}
        currentUserId={coach?.id ?? null}
      />
    </main>
  );
}
