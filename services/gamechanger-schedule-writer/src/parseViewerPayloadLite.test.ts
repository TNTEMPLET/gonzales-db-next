import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseViewerPayloadLite } from "./parseViewerPayloadLite.js";
import { replayViewerEventStream } from "./replayViewerEventStream.js";

describe("parseViewerPayloadLite", () => {
  it("extracts counts from nested payload shapes", () => {
    const parsed = parseViewerPayloadLite({
      game_situation: {
        balls: 2,
        strikes: 1,
        outs: 2,
        inning: 5,
        half: "top",
      },
    });
    assert.equal(parsed.balls, 2);
    assert.equal(parsed.strikes, 1);
    assert.equal(parsed.outsInHalf, 2);
    assert.equal(parsed.inning, 5);
    assert.equal(parsed.half, "top");
  });

  it("replays viewer-payload-lite event streams", () => {
    const payload = {
      latest_events: [
        {
          sequence_number: 0,
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "ball", advancesCount: true },
          }),
        },
        {
          sequence_number: 1,
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "strike_swinging", advancesCount: true },
          }),
        },
        {
          sequence_number: 2,
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "foul", advancesCount: true },
          }),
        },
      ],
    };

    const parsed = parseViewerPayloadLite(payload);
    assert.equal(parsed.balls, 1);
    assert.equal(parsed.strikes, 2);
    assert.equal(parsed.outsInHalf, 0);
    assert.equal(parsed.inning, 1);
    assert.equal(parsed.half, "top");
  });

  it("counts strikeouts from event streams", () => {
    const payload = {
      latest_events: [
        {
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "strike_looking", advancesCount: true },
          }),
        },
        {
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "strike_looking", advancesCount: true },
          }),
        },
        {
          event_data: JSON.stringify({
            code: "pitch",
            attributes: { result: "strike_looking", advancesCount: true },
          }),
        },
      ],
    };

    const replayed = replayViewerEventStream(payload);
    assert.equal(replayed?.balls, 0);
    assert.equal(replayed?.strikes, 0);
    assert.equal(replayed?.outsInHalf, 1);
    assert.equal(replayed?.inning, 1);
    assert.equal(replayed?.half, "top");
  });
});
