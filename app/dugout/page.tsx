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
import { listDugoutPosts } from "@/lib/dugout/posts";
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
  const admin = await getAdminUserByToken(adminToken);

  const authed = admin ?? (coach?.isCoach ? coach : null);

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

  const initialPosts = await listDugoutPosts(coach?.id);

  // If the user has an admin session but no coach session, look up their
  // RegisteredUser by email so they get a proper currentUserId.
  let currentUserId: string | null = coach?.id ?? null;
  if (!currentUserId && admin) {
    const reg = await prisma.registeredUser.findUnique({
      where: { email: admin.email },
      select: { id: true },
    });
    currentUserId = reg?.id ?? null;
  }

  return (
    <main className="flex h-[calc(100dvh-80px)] flex-col overflow-hidden bg-zinc-950 px-4 pt-6 pb-4 text-white sm:px-6 lg:px-10">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col">
        <DugoutTimeline
          initialPosts={initialPosts}
          isAdmin={!!admin}
          currentUserId={currentUserId}
        />
      </div>
    </main>
  );
}
