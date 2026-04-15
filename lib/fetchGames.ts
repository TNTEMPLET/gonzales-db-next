// lib/fetchGames.ts
export type Game = {
  id: string | number;
  start_time?: string;
  end_time?: string;
  localized_date?: string;
  localized_time?: string;
  age_group?: string;
  home_team?: string;
  away_team?: string;
  league?: string;
  status?: string;
  subvenue?: string;
  _embedded?: {
    venue?: {
      name?: string;
    };
  };
  [key: string]: string | number | boolean | object | undefined | null;
};

type FetchGamesOptions = {
  startDate: string;
  endDate: string;
  leagueId?: string | number;
  limit?: number;
};

// Helper to get fresh Bearer token
async function getAssignrToken(): Promise<string> {
  const clientId = process.env.ASSIGNR_CLIENT_ID;
  const clientSecret = process.env.ASSIGNR_CLIENT_SECRET;
  const baseUrl = process.env.ASSIGNR_TOKEN_BASE || "https://app.assignr.com";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing ASSIGNR_CLIENT_ID or ASSIGNR_CLIENT_SECRET in .env.local",
    );
  }

  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "read",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Token request failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error("No access_token received from Assignr");
  }

  return data.access_token;
}

// Main function to fetch games
export async function fetchGames({
  startDate,
  endDate,
  leagueId,
  limit = 50,
}: FetchGamesOptions): Promise<Game[]> {
  const token = await getAssignrToken();
  const siteId = process.env.ASSIGNR_SITE_ID;
  const baseUrl = process.env.ASSIGNR_API_BASE || "https://api.assignr.com";

  if (!siteId) {
    throw new Error("Missing ASSIGNR_SITE_ID in .env.local");
  }

  let allGames: Game[] = [];
  let page = 1;
  const maxPages = 20;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      page: page.toString(),
      "search[start_date]": startDate,
      "search[end_date]": endDate,
    });

    // Filter by league if provided
    if (leagueId !== undefined) {
      params.append("search[league_id]", leagueId.toString());
    }

    const response = await fetch(
      `${baseUrl}/api/v2/sites/${siteId}/games?${params}`,
      {
        headers: {
          Accept: "application/vnd.assignr.v2.hal+json",
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 300 },
      },
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Games API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const games = (data._embedded?.games || []) as Game[];

    allGames = [...allGames, ...games];

    if (games.length === 0 || page >= (data.page?.pages || 1)) break;
    page++;
  }

  return allGames;
}
