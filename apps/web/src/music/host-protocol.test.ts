import { describe, expect, it } from "vitest";

import { MAX_SOURCE_LENGTH, parseGameToHost, parseHostToGame } from "./host-protocol.js";

const track = { trackId: "first-light", source: 's("bd")', phraseCycles: 8 };

const stats = {
  type: "stats",
  ticks: 10,
  lateTicks: 1,
  maxTickGapMs: 160.5,
  maxTickWorkMs: 12.3,
  skippedMs: 50,
  events: 7,
  droppedEvents: 0,
  baseLatencyMs: 10,
  outputLatencyMs: 32,
  glitches: null,
  glitchMs: null,
  underruns: null,
  underrunMs: null,
  maxReductionDb: 0,
};

describe("parseGameToHost", () => {
  it("accepts every message the game sends", () => {
    for (const message of [
      { type: "load", startAtEpochMs: null, ...track },
      { type: "load", startAtEpochMs: 1_780_000_000_000, ...track },
      { type: "crossfadeTo", cycles: 2, landOn: "phrase", ...track },
      { type: "crossfadeTo", cycles: 2, landOn: "cycle", ...track },
      { type: "play" },
      { type: "stop" },
      { type: "setIntensity", level: 0 },
      { type: "setIntensity", level: 3 },
      { type: "setVolume", gain: 0.5, rampSeconds: 0.3 },
      { type: "evaluate", seq: 2, source: 's("hh*8")' },
      { type: "ping", seq: 7 },
      { type: "measure" },
      { type: "audioStress", ms: 2.5 },
    ]) {
      expect(parseGameToHost(message), message.type).toEqual(message);
    }
  });

  it("keeps only the fields it knows", () => {
    expect(parseGameToHost({ type: "stop", extra: "x" })).toEqual({ type: "stop" });
  });

  it("refuses anything malformed", () => {
    for (const message of [
      null,
      "load",
      [],
      {},
      { type: "unknown" },
      { type: "load", ...track },
      { type: "load", startAtEpochMs: Number.NaN, ...track },
      { type: "load", startAtEpochMs: "soon", ...track },
      { type: "load", startAtEpochMs: null, ...track, trackId: "" },
      { type: "load", startAtEpochMs: null, ...track, phraseCycles: 0 },
      { type: "load", startAtEpochMs: null, ...track, phraseCycles: 2.5 },
      { type: "load", startAtEpochMs: null, ...track, source: 42 },
      { type: "load", startAtEpochMs: null, ...track, source: "x".repeat(MAX_SOURCE_LENGTH + 1) },
      { type: "crossfadeTo", landOn: "phrase", ...track },
      { type: "crossfadeTo", cycles: Number.NaN, landOn: "phrase", ...track },
      { type: "crossfadeTo", cycles: 2, ...track },
      { type: "crossfadeTo", cycles: 2, landOn: "bar", ...track },
      { type: "setIntensity", level: 4 },
      { type: "setIntensity", level: "2" },
      { type: "setVolume", gain: 2, rampSeconds: 0 },
      { type: "setVolume", gain: 0.5, rampSeconds: -1 },
      { type: "evaluate" },
      { type: "evaluate", source: 's("hh*8")' },
      { type: "evaluate", seq: 1.5, source: 's("hh*8")' },
      { type: "ping", seq: 1.5 },
    ]) {
      expect(parseGameToHost(message), JSON.stringify(message)).toBeNull();
    }
  });
});

const sting = { type: "sting", id: "first-blood", source: 'n("0").scale(KEY)', cycles: 1 };

it("accepts a sting in any track's key (#2523)", () => {
  for (const key of ["D aeolian", "Bb major", "F# dorian", "E phrygian dominant"]) {
    const message = { ...sting, key };
    expect(parseGameToHost(message), key).toEqual(message);
  }
});

it.each([
  ["an unknown id", { id: "fanfare" }],
  ["no id", { id: undefined }],
  ["a key with no scale", { key: "D" }],
  ["a key with a lower-case tonic", { key: "d aeolian" }],
  ["a key that is code", { key: 'D aeolian"); hush(); ("' }],
  ["a key that is no string", { key: 7 }],
  ["no cycles", { cycles: 0 }],
  ["too many cycles", { cycles: 5 }],
  ["a part of a cycle", { cycles: 1.5 }],
  ["a source too long", { source: "x".repeat(MAX_SOURCE_LENGTH + 1) }],
  ["no source", { source: undefined }],
])("refuses a sting with %s (#2523)", (_, wrong) => {
  expect(parseGameToHost({ ...sting, key: "D aeolian", ...wrong })).toBeNull();
});

describe("parseHostToGame", () => {
  it("accepts every message the host sends", () => {
    for (const message of [
      { type: "ready" },
      { type: "playing", trackId: "first-light", cycle: 8, cps: 0.3, heardAtEpochMs: 5 },
      { type: "evaluated", seq: 2 },
      { type: "error", message: "Unexpected token (3:0)", line: 3 },
      { type: "error", message: "Unexpected token (3:0)", line: 3, seq: 2 },
      { type: "error", message: "x is not defined", seq: 4 },
      { type: "error", message: "the source does not end in a pattern" },
      { type: "pong", seq: 3 },
      stats,
      { ...stats, glitches: 2, glitchMs: 21.3 },
      { ...stats, underruns: 1, underrunMs: 50.5, maxReductionDb: -4.2 },
    ]) {
      expect(parseHostToGame(message), message.type).toEqual(message);
    }
  });

  it("refuses anything malformed", () => {
    for (const message of [
      undefined,
      { type: "playing", trackId: "x", cycle: -1, cps: 0.3, heardAtEpochMs: 5 },
      { type: "playing", trackId: "x", cycle: 1, cps: 0.3 },
      { type: "playing", trackId: "x", cycle: 1, cps: 0.3, heardAtEpochMs: null },
      { type: "playing", trackId: "x", cycle: 1, cps: 0.3, heardAtEpochMs: Number.NaN },
      { type: "playing", trackId: "x", cycle: 0 },
      { type: "error" },
      { type: "error", message: "x".repeat(501) },
      { type: "error", message: "x", line: 0 },
      { type: "error", message: "x", seq: "2" },
      { type: "evaluated" },
      { type: "pong" },
      { ...stats, ticks: -1 },
      { ...stats, skippedMs: Number.POSITIVE_INFINITY },
      { ...stats, droppedEvents: "0" },
      { ...stats, glitches: undefined },
      { ...stats, underrunMs: -1 },
      { ...stats, underruns: undefined },
      { ...stats, maxReductionDb: 3 },
      { ...stats, maxReductionDb: null },
      { type: "stats" },
      // The host never sends a game message back.
      { type: "load", startAtEpochMs: null, ...track },
    ]) {
      expect(parseHostToGame(message), JSON.stringify(message)).toBeNull();
    }
  });
});
