import { NextRequest, NextResponse } from "next/server";

import { getCoachUserFromRequest } from "@/lib/auth/coachSession";
import { ensureCoach } from "@/lib/dugout/auth";
import prisma from "@/lib/prisma";

type CreatePostPayload = {
  content?: string;
};

const MAX_POST_LENGTH = 280;

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const posts = await prisma.dugoutPost.findMany({
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

    return NextResponse.json({ data: posts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to load dugout posts: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  try {
    const coachUser = await getCoachUserFromRequest(request);
    if (!coachUser) {
      return NextResponse.json(
        { error: "Coach access required" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as CreatePostPayload;
    const content = body.content?.trim() || "";

    if (!content) {
      return NextResponse.json(
        { error: "Post content is required" },
        { status: 400 },
      );
    }

    if (content.length > MAX_POST_LENGTH) {
      return NextResponse.json(
        { error: `Post must be ${MAX_POST_LENGTH} characters or fewer` },
        { status: 400 },
      );
    }

    const post = await prisma.dugoutPost.create({
      data: {
        content,
        authorId: coachUser.id,
      },
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

    return NextResponse.json({ data: post }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to create dugout post: ${message}` },
      { status: 500 },
    );
  }
}
