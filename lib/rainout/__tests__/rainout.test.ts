import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isMissingRainoutTableError, RAINOUT_TABLE_MISSING_MESSAGE, warnMissingRainoutTable } from "../missingTable";
import { deliveryOutcome } from "../outcomes";
import { newlyAffectedParks, parkKey, parksTreatedAsOut, resolveRainoutSelection } from "../parks";
import { allowlistPermits, rainoutEmailAllowlist, rainoutEmailsEnabled, rainoutSendingEnabled } from "../policy";
import {
  groupRainoutFamilies,
  normalizeGuardianEmail,
  resolveRainoutTeam,
  type RainoutGameInput,
  type RainoutPlayerInput,
  type RainoutTeamRef,
} from "../recipients";

const PARK_A = "Tee-Joe Gonzales Park";
const PARK_B = "J Leo Stevens Park";
const PARK_C = "Main Park";

const teams: RainoutTeamRef[] = [
  { id: "astros", teamName: "Astros", ageGroup: "8U" },
  { id: "yankees", teamName: "Yankees", ageGroup: "8U" },
  { id: "dodgers", teamName: "Dodgers", ageGroup: "10U" },
];

function game(overrides: Partial<RainoutGameInput> & Pick<RainoutGameInput, "id" | "parkName">): RainoutGameInput {
  return {
    startTime: "17:45",
    division: "8U",
    ageGroup: "8U",
    homeTeamId: "astros",
    awayTeamId: "yankees",
    homeTeamName: "Astros",
    awayTeamName: "Yankees",
    ...overrides,
  };
}

function group(input: {
  games: RainoutGameInput[];
  players: RainoutPlayerInput[];
  allParksOut?: boolean;
  rainedOutParks?: string[];
  newlyAffectedParks?: string[];
  teams?: RainoutTeamRef[];
}) {
  const rainedOutParks = input.rainedOutParks ?? [PARK_A];
  return groupRainoutFamilies({
    orgName: "AP Fall Ball",
    calendarDate: "2026-10-01",
    games: input.games,
    teams: input.teams ?? teams,
    players: input.players,
    allParksOut: input.allParksOut ?? false,
    rainedOutParks,
    newlyAffectedParks: input.newlyAffectedParks ?? rainedOutParks,
  });
}

describe("guardian email normalization", () => {
  it("trims and lowercases, and drops blanks", () => {
    assert.equal(normalizeGuardianEmail("  Parent@Example.com "), "parent@example.com");
    assert.equal(normalizeGuardianEmail("   "), null);
    assert.equal(normalizeGuardianEmail(null), null);
    assert.equal(normalizeGuardianEmail("not-an-email"), null);
  });
});

describe("rainout recipient grouping", () => {
  it("emails one family for a single kid at a rained-out park", () => {
    const families = group({
      games: [game({ id: "g1", parkName: PARK_A })],
      players: [{ teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" }],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.email, "parent@example.com");
    assert.equal(families[0]?.mode, "all_games");
    assert.match(families[0]?.subject ?? "", /all of your games today are rained out/i);
    assert.match(families[0]?.text ?? "", /All of your games today are rained out/);
    assert.match(families[0]?.text ?? "", /Sam Smith \(Astros, 8U\) at Tee-Joe Gonzales Park, 5:45 PM vs Yankees/);
  });

  it("lists multiple kids at the same park in one email", () => {
    const families = group({
      games: [game({ id: "g1", parkName: PARK_A })],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" },
        { teamId: "astros", fullName: "Alex Smith", guardianEmail: "parent@example.com" },
      ],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.mode, "all_games");
    assert.match(families[0]?.text ?? "", /Sam Smith/);
    assert.match(families[0]?.text ?? "", /Alex Smith/);
  });

  it("says which player is cancelled and which is still on when parks are split", () => {
    const families = group({
      games: [
        game({ id: "g1", parkName: PARK_A, startTime: "17:45", homeTeamId: "astros", awayTeamId: "yankees" }),
        game({
          id: "g2",
          parkName: PARK_B,
          startTime: "19:00",
          division: "10U",
          ageGroup: "10U",
          homeTeamId: "dodgers",
          awayTeamId: null,
          homeTeamName: "Dodgers",
          awayTeamName: "Cubs",
        }),
      ],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" },
        { teamId: "dodgers", fullName: "Alex Smith", guardianEmail: "parent@example.com" },
      ],
      rainedOutParks: [PARK_A],
      newlyAffectedParks: [PARK_A],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.mode, "mixed");
    assert.match(families[0]?.text ?? "", /Cancelled:/);
    assert.match(families[0]?.text ?? "", /Sam Smith \(Astros, 8U\) at Tee-Joe Gonzales Park/);
    assert.match(families[0]?.text ?? "", /Still on:/);
    assert.match(families[0]?.text ?? "", /Alex Smith \(Dodgers, 10U\) at J Leo Stevens Park, 7:00 PM/);
    assert.equal(families[0]?.appearances.find((row) => row.playerName === "Sam Smith")?.rainedOut, true);
    assert.equal(families[0]?.appearances.find((row) => row.playerName === "Alex Smith")?.rainedOut, false);
  });

  it("sends one combined all-games email when every park is out", () => {
    const families = group({
      games: [
        game({ id: "g1", parkName: PARK_A, startTime: "17:45" }),
        game({
          id: "g2",
          parkName: PARK_B,
          startTime: "19:00",
          division: "10U",
          ageGroup: "10U",
          homeTeamId: "dodgers",
          awayTeamId: null,
          homeTeamName: "Dodgers",
          awayTeamName: "Cubs",
        }),
      ],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" },
        { teamId: "dodgers", fullName: "Alex Smith", guardianEmail: "parent@example.com" },
      ],
      allParksOut: true,
      rainedOutParks: [PARK_A, PARK_B],
      newlyAffectedParks: [PARK_A, PARK_B],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.mode, "all_games");
    assert.match(families[0]?.text ?? "", /^All of your games today are rained out/);
    assert.match(families[0]?.text ?? "", /Sam Smith/);
    assert.match(families[0]?.text ?? "", /Alex Smith/);
    assert.equal(families[0]?.text.includes("Still on:"), false);
  });

  it("skips players with no guardian email and still emails a sibling who has one", () => {
    const families = group({
      games: [game({ id: "g1", parkName: PARK_A })],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: null },
        { teamId: "yankees", fullName: "Jordan Lee", guardianEmail: "lee@example.com" },
        { teamId: "yankees", fullName: "Blank Email", guardianEmail: "   " },
      ],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.email, "lee@example.com");
    assert.match(families[0]?.text ?? "", /Jordan Lee/);
    assert.equal(families[0]?.text.includes("Sam Smith"), false);
  });

  it("groups duplicate guardian emails that differ only by case and surrounding space", () => {
    const families = group({
      games: [
        game({ id: "g1", parkName: PARK_A, homeTeamId: "astros", awayTeamId: "yankees" }),
      ],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: "Parent@Example.com" },
        { teamId: "yankees", fullName: "Alex Smith", guardianEmail: "  parent@example.com " },
      ],
    });
    assert.equal(families.length, 1);
    assert.equal(families[0]?.email, "parent@example.com");
    assert.equal(families[0]?.appearances.length, 2);
  });

  it("resolves a null team link by team name and division", () => {
    const resolved = resolveRainoutTeam(teams, {
      teamId: null,
      teamName: "Dodgers",
      division: "10U",
      ageGroup: null,
    });
    assert.equal(resolved?.id, "dodgers");
    assert.equal(
      resolveRainoutTeam(teams, {
        teamId: null,
        teamName: "Dodgers",
        division: "8U",
        ageGroup: null,
      }),
      null,
    );

    const families = group({
      games: [
        game({
          id: "g1",
          parkName: PARK_A,
          division: "10U",
          ageGroup: null,
          homeTeamId: null,
          awayTeamId: null,
          homeTeamName: "Dodgers",
          awayTeamName: "Mystery",
        }),
      ],
      players: [{ teamId: "dodgers", fullName: "Alex Smith", guardianEmail: "parent@example.com" }],
    });
    assert.equal(families.length, 1);
    assert.match(families[0]?.text ?? "", /Alex Smith \(Dodgers, 10U\)/);
    assert.equal(
      families[0]?.appearances.some((row) => row.playerName === "Mystery"),
      false,
    );
  });

  it("does not email families whose games are only at parks that are still open", () => {
    const families = group({
      games: [game({ id: "g1", parkName: PARK_B })],
      players: [{ teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" }],
      rainedOutParks: [PARK_A],
      newlyAffectedParks: [PARK_A],
    });
    assert.deepEqual(families, []);
  });
});

describe("rainout re-notification dedupe", () => {
  it("treats all parks out as every known park plus today's game parks", () => {
    assert.deepEqual(
      parksTreatedAsOut({
        allParksOut: true,
        parks: [],
        knownParks: [PARK_A, PARK_B],
        gameParkNames: [PARK_C, PARK_A],
      }),
      [PARK_A, PARK_B, PARK_C],
    );
    assert.deepEqual(
      parksTreatedAsOut({
        allParksOut: false,
        parks: [PARK_A],
        knownParks: [PARK_A, PARK_B],
        gameParkNames: [PARK_C],
      }),
      [PARK_A],
    );
  });

  it("notifies only parks that were not already emailed today, ignoring case", () => {
    assert.deepEqual(newlyAffectedParks([PARK_A, PARK_B], [parkKey(PARK_A)]), [PARK_B]);
    assert.deepEqual(newlyAffectedParks([PARK_A, PARK_B], [PARK_A, PARK_B]), []);
    assert.deepEqual(newlyAffectedParks([PARK_A, PARK_B, PARK_C], ["tee-joe gonzales park"]), [PARK_B, PARK_C]);
  });

  it("does not build another email when the family's parks were already notified", () => {
    const families = group({
      games: [game({ id: "g1", parkName: PARK_A })],
      players: [{ teamId: "astros", fullName: "Sam Smith", guardianEmail: "parent@example.com" }],
      rainedOutParks: [PARK_A],
      newlyAffectedParks: [],
    });
    assert.deepEqual(families, []);
  });

  it("emails only the newly added park when a rainout grows", () => {
    const families = group({
      games: [
        game({
          id: "g1",
          parkName: PARK_A,
          startTime: "17:45",
          homeTeamId: "astros",
          awayTeamId: null,
          homeTeamName: "Astros",
          awayTeamName: "Cubs",
        }),
        game({
          id: "g2",
          parkName: PARK_B,
          startTime: "19:00",
          homeTeamId: "yankees",
          awayTeamId: null,
          homeTeamName: "Yankees",
          awayTeamName: "Cubs",
        }),
      ],
      players: [
        { teamId: "astros", fullName: "Sam Smith", guardianEmail: "a@example.com" },
        { teamId: "yankees", fullName: "Alex Smith", guardianEmail: "b@example.com" },
      ],
      rainedOutParks: [PARK_A, PARK_B],
      newlyAffectedParks: [PARK_B],
    });
    assert.deepEqual(
      families.map((family) => family.email),
      ["b@example.com"],
    );
    assert.equal(families[0]?.mode, "all_games");
    assert.match(families[0]?.text ?? "", /Alex Smith/);
  });
});

describe("rainout park selection", () => {
  const known = [PARK_A, PARK_B];

  it("rejects unknown parks and empty selections", () => {
    const unknown = resolveRainoutSelection({
      allParksOut: false,
      requestedParks: ["Not A Park", PARK_A],
      knownParks: known,
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.match(unknown.error, /Unknown park: Not A Park/);

    const empty = resolveRainoutSelection({ allParksOut: false, requestedParks: ["  "], knownParks: known });
    assert.equal(empty.ok, false);
  });

  it("canonicalizes names and stores a full selection as all parks out", () => {
    const one = resolveRainoutSelection({
      allParksOut: false,
      requestedParks: [" tee-joe gonzales park ", "tee-joe gonzales park"],
      knownParks: known,
    });
    assert.deepEqual(one, { ok: true, allParksOut: false, parks: [PARK_A] });

    const all = resolveRainoutSelection({
      allParksOut: false,
      requestedParks: [PARK_B, PARK_A],
      knownParks: known,
    });
    assert.deepEqual(all, { ok: true, allParksOut: true, parks: [] });

    const flagged = resolveRainoutSelection({
      allParksOut: true,
      requestedParks: ["Not A Park"],
      knownParks: known,
    });
    assert.deepEqual(flagged, { ok: true, allParksOut: true, parks: [] });
  });
});

describe("rainout email safety switches", () => {
  it("stays off unless RAINOUT_EMAILS_ENABLED is explicitly on", () => {
    assert.equal(rainoutEmailsEnabled({}), false);
    assert.equal(rainoutEmailsEnabled({ RAINOUT_EMAILS_ENABLED: "" }), false);
    assert.equal(rainoutEmailsEnabled({ RAINOUT_EMAILS_ENABLED: "false" }), false);
    assert.equal(rainoutEmailsEnabled({ RAINOUT_EMAILS_ENABLED: "true" }), true);
    assert.equal(rainoutEmailsEnabled({ RAINOUT_EMAILS_ENABLED: "1" }), true);
    assert.equal(
      rainoutSendingEnabled({
        RAINOUT_EMAILS_ENABLED: "true",
        COMMUNICATIONS_MODULE_ENABLED: "false",
      }),
      false,
    );
  });

  it("treats a blank rainout allowlist as nobody outside production", () => {
    for (const env of [
      {},
      { RAINOUT_EMAIL_ALLOWLIST: "  " },
      { VERCEL_ENV: "preview" },
      { VERCEL_ENV: "preview", RAINOUT_EMAIL_ALLOWLIST: "" },
    ]) {
      const allowlist = rainoutEmailAllowlist(env);
      assert.ok(allowlist);
      assert.equal(allowlist.size, 0);
    }
    assert.equal(allowlistPermits("parent@example.com", rainoutEmailAllowlist({})), false);

    assert.equal(rainoutEmailAllowlist({ VERCEL_ENV: "production" }), null);
    assert.equal(rainoutEmailAllowlist({ VERCEL_ENV: "production", RAINOUT_EMAIL_ALLOWLIST: "  " }), null);
    assert.equal(allowlistPermits("parent@example.com", null), true);

    const allowlist = rainoutEmailAllowlist({
      VERCEL_ENV: "preview",
      RAINOUT_EMAIL_ALLOWLIST: " Coach@Example.com, other@example.com ",
    });
    assert.equal(allowlistPermits("coach@example.com", allowlist), true);
    assert.equal(allowlistPermits("parent@example.com", allowlist), false);

    const empty = rainoutEmailAllowlist({ VERCEL_ENV: "production", RAINOUT_EMAIL_ALLOWLIST: "," });
    assert.equal(allowlistPermits("parent@example.com", empty), false);
  });

  it("recognizes a missing rainout notification table without throwing", () => {
    assert.equal(RAINOUT_TABLE_MISSING_MESSAGE, "Rainout notification table missing; migrations pending");
    assert.equal(isMissingRainoutTableError({ code: "P2021" }), true);
    assert.equal(isMissingRainoutTableError({ code: "P2022" }), true);
    assert.equal(isMissingRainoutTableError({ code: "P2002" }), false);
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args);
    };
    try {
      warnMissingRainoutTable();
    } finally {
      console.warn = original;
    }
    assert.deepEqual(warnings, [["[rainout] RainoutParkNotification table missing; migrations pending"]]);
  });

  it("does not choose send unless mail is enabled and the address is allowed", () => {
    const allowlist = new Set(["coach@example.com"]);
    assert.equal(
      deliveryOutcome({
        email: "parent@example.com",
        emailsEnabled: false,
        allowlist: null,
        suppressed: false,
      }),
      "dry_run",
    );
    assert.equal(
      deliveryOutcome({
        email: "parent@example.com",
        emailsEnabled: true,
        allowlist: null,
        suppressed: false,
      }),
      "send",
    );
    assert.equal(
      deliveryOutcome({
        email: "parent@example.com",
        emailsEnabled: true,
        allowlist,
        suppressed: false,
      }),
      "allowlist",
    );
    assert.equal(
      deliveryOutcome({
        email: "coach@example.com",
        emailsEnabled: true,
        allowlist,
        suppressed: true,
      }),
      "suppressed",
    );
  });
});
