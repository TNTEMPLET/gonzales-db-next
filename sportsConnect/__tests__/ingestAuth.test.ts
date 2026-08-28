import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import {
  bearerTokenFromRequest,
  getSportsConnectIngestSecret,
  isSportsConnectIngestConfigured,
  isValidSportsConnectIngestBearer,
} from "../ingestAuth";

describe("ingestAuth env helpers", () => {
  const prev = process.env.SPORTS_CONNECT_INGEST_SECRET;

  before(() => {
    process.env.SPORTS_CONNECT_INGEST_SECRET = "test-secret-value";
  });

  after(() => {
    if (prev === undefined) delete process.env.SPORTS_CONNECT_INGEST_SECRET;
    else process.env.SPORTS_CONNECT_INGEST_SECRET = prev;
  });

  it("reads configured secret", () => {
    assert.equal(isSportsConnectIngestConfigured(), true);
    assert.equal(getSportsConnectIngestSecret(), "test-secret-value");
  });

  it("accepts matching Bearer token", () => {
    const req = new NextRequest("https://admin.example/api/admin/sports-connect/ingest", {
      headers: { authorization: "Bearer test-secret-value" },
    });
    assert.equal(bearerTokenFromRequest(req), "test-secret-value");
    assert.equal(isValidSportsConnectIngestBearer(req), true);
  });

  it("rejects wrong Bearer token", () => {
    const req = new NextRequest("https://admin.example/api/admin/sports-connect/ingest", {
      headers: { authorization: "Bearer wrong-secret-value" },
    });
    assert.equal(isValidSportsConnectIngestBearer(req), false);
  });

  it("rejects missing Authorization", () => {
    const req = new NextRequest("https://admin.example/api/admin/sports-connect/ingest");
    assert.equal(isValidSportsConnectIngestBearer(req), false);
  });
});
