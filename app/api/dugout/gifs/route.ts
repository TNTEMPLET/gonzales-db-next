import { NextRequest, NextResponse } from "next/server";

import { ensureCoach } from "@/lib/dugout/auth";

type GiphySearchResponse = {
  data: Array<{
    id: string;
    title: string;
    images: {
      fixed_width: {
        url: string;
      };
      original: {
        url: string;
      };
    };
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await ensureCoach(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.message || "Unauthorized" },
      { status: auth.status },
    );
  }

  const apiKey = process.env.GIPHY_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({
      data: [],
      hasMore: false,
      nextOffset: 0,
      providerConfigured: false,
      message:
        "GIF search is disabled. Add GIPHY_API_KEY to .env.local and restart the dev server.",
    });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  const limitParam = Number(request.nextUrl.searchParams.get("limit") || "15");
  const offsetParam = Number(request.nextUrl.searchParams.get("offset") || "0");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(Math.floor(limitParam), 1), 25)
    : 15;
  const offset = Number.isFinite(offsetParam)
    ? Math.max(Math.floor(offsetParam), 0)
    : 0;

  if (!query) {
    return NextResponse.json({ data: [], hasMore: false, nextOffset: 0 });
  }

  try {
    const upstream = await fetch(
      `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g&lang=en`,
      { cache: "no-store" },
    );

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Failed to fetch GIF results" },
        { status: 502 },
      );
    }

    const json = (await upstream.json()) as GiphySearchResponse;
    const data = json.data.map((item) => ({
      id: item.id,
      title: item.title || "GIF",
      previewUrl: item.images.fixed_width.url,
      mediaUrl: item.images.original.url,
      mediaType: "GIF" as const,
    }));

    const hasMore = data.length >= limit;

    return NextResponse.json({
      data,
      hasMore,
      nextOffset: offset + data.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to search GIFs: ${message}` },
      { status: 500 },
    );
  }
}
