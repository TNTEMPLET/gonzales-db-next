import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  POSTSEASON_DAYS,
  resolveSeasonMode,
  settleSeasonModeOverride,
  type SeasonMode,
} from "../mode";

const SPRING = {
  seasonStart: "2026-03-01",
  seasonEnd: "2026-06-30",
  registrationStart: "2025-12-20T00:00:00",
  registrationEnd: "2026-01-01T23:59:59",
};

const FALL = {
  seasonStart: "2026-08-01",
  seasonEnd: "2026-11-30",
  registrationStart: "2026-08-01T00:00:00",
  registrationEnd: "2026-08-01T23:59:59",
};

function utcNoonOn(isoDate: string): Date {
  return new Date(`${isoDate}T17:00:00.000Z`);
}

function modeOn(
  isoDate: string,
  extra?: {
    seasonStart?: string;
    seasonEnd?: string;
    registrationStart?: string | null;
    registrationEnd?: string | null;
    override?: string | null;
  },
) {
  return resolveSeasonMode({
    ...SPRING,
    ...extra,
    asOf: utcNoonOn(isoDate),
  }).mode;
}

describe("resolveSeasonMode spring calendar", () => {
  it("is off season before registration opens", () => {
    assert.equal(modeOn("2025-11-01"), "OFF_SEASON");
    assert.equal(modeOn("2025-12-19"), "OFF_SEASON");
  });

  it("is preseason from registration open through the day before opening day", () => {
    assert.equal(modeOn("2025-12-20"), "PRESEASON");
    assert.equal(modeOn("2026-01-01"), "PRESEASON");
    assert.equal(modeOn("2026-01-02"), "PRESEASON");
    assert.equal(modeOn("2026-02-28"), "PRESEASON");
  });

  it("is in season on the first and last game days", () => {
    assert.equal(modeOn("2026-03-01"), "IN_SEASON");
    assert.equal(modeOn("2026-06-30"), "IN_SEASON");
  });

  it("keeps postseason for 45 days after the last game day", () => {
    assert.equal(POSTSEASON_DAYS, 45);
    assert.equal(modeOn("2026-07-01"), "POSTSEASON");
    assert.equal(modeOn("2026-08-14"), "POSTSEASON");
    assert.equal(modeOn("2026-08-15"), "OFF_SEASON");
    assert.equal(modeOn("2026-10-09"), "OFF_SEASON");
  });
});

describe("resolveSeasonMode fall ball calendar", () => {
  it("follows the fall window and does not invent a July preseason", () => {
    assert.equal(modeOn("2026-07-15", FALL), "OFF_SEASON");
    assert.equal(modeOn("2026-08-01", FALL), "IN_SEASON");
    assert.equal(modeOn("2026-10-09", FALL), "IN_SEASON");
    assert.equal(modeOn("2026-11-30", FALL), "IN_SEASON");
    assert.equal(modeOn("2026-12-01", FALL), "POSTSEASON");
  });
});

describe("resolveSeasonMode registration and override", () => {
  it("lets an open registration window beat the postseason tail", () => {
    assert.equal(
      modeOn("2026-07-15", {
        registrationStart: "2026-07-01T00:00:00",
        registrationEnd: "2026-07-31T23:59:59",
      }),
      "PRESEASON",
    );
  });

  it("treats a registration datetime as its calendar date", () => {
    assert.equal(
      modeOn("2026-12-20", {
        registrationStart: "2026-12-20T18:00:00",
        registrationEnd: "2027-01-01T23:59:59",
      }),
      "PRESEASON",
    );
  });

  it("ignores a registration window whose end is before its start", () => {
    assert.equal(
      modeOn("2026-02-15", {
        registrationStart: "2026-02-01",
        registrationEnd: "2026-01-01",
      }),
      "OFF_SEASON",
    );
    assert.equal(
      modeOn("2026-07-15", {
        registrationStart: "2026-07-20",
        registrationEnd: "2026-07-01",
      }),
      "POSTSEASON",
    );
  });

  it("ignores a missing registration window", () => {
    assert.equal(
      modeOn("2026-02-15", { registrationStart: null, registrationEnd: null }),
      "OFF_SEASON",
    );
    assert.equal(
      modeOn("2026-07-15", { registrationStart: null, registrationEnd: null }),
      "POSTSEASON",
    );
  });

  it("is off season when the game dates are reversed, unless an override is set", () => {
    assert.equal(
      modeOn("2026-04-15", { seasonStart: "2026-06-30", seasonEnd: "2026-03-01" }),
      "OFF_SEASON",
    );
    assert.deepEqual(
      resolveSeasonMode({
        asOf: utcNoonOn("2026-04-15"),
        seasonStart: "2026-06-30",
        seasonEnd: "2026-03-01",
        override: "IN_SEASON",
      }),
      { mode: "IN_SEASON", source: "override" },
    );
  });

  it("lets each override beat the calendar", () => {
    const overrides: SeasonMode[] = ["OFF_SEASON", "PRESEASON", "IN_SEASON", "POSTSEASON"];
    for (const override of overrides) {
      assert.deepEqual(resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override }), {
        mode: override,
        source: "override",
      });
    }
  });

  it("ignores an empty or unknown override", () => {
    assert.equal(resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override: null }).source, "calendar");
    assert.equal(resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override: "  " }).mode, "IN_SEASON");
    assert.equal(resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override: "in_season" }).mode, "IN_SEASON");
    assert.equal(
      resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override: " IN_SEASON " }).mode,
      "IN_SEASON",
    );
    assert.equal(
      resolveSeasonMode({ ...SPRING, asOf: utcNoonOn("2026-04-15"), override: " IN_SEASON " }).source,
      "override",
    );
  });

  it("uses the Central calendar date around midnight", () => {
    const beforeOpening = resolveSeasonMode({
      ...SPRING,
      asOf: new Date("2026-03-01T05:30:00.000Z"),
    });
    const opening = resolveSeasonMode({
      ...SPRING,
      asOf: new Date("2026-03-01T06:00:00.000Z"),
    });
    assert.equal(beforeOpening.mode, "PRESEASON");
    assert.equal(opening.mode, "IN_SEASON");
  });
});

describe("settleSeasonModeOverride", () => {
  it("returns a stored override when the read succeeds", async () => {
    assert.deepEqual(await settleSeasonModeOverride(async () => "POSTSEASON"), {
      override: "POSTSEASON",
      storageReady: true,
    });
    assert.deepEqual(await settleSeasonModeOverride(async () => null), {
      override: null,
      storageReady: true,
    });
  });

  it("drops the override when the column cannot be read", async () => {
    const originalError = console.error;
    console.error = () => {};
    let settled: { override: string | null; storageReady: boolean } = {
      override: "SHOULD_NOT_KEEP",
      storageReady: true,
    };
    try {
      settled = await settleSeasonModeOverride(async () => {
        throw new Error("column SeasonOrgSettings.seasonModeOverride does not exist");
      });
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(settled, { override: null, storageReady: false });
    assert.equal(
      resolveSeasonMode({ ...FALL, asOf: utcNoonOn("2026-10-09"), override: settled.override }).mode,
      "IN_SEASON",
    );
  });
});
