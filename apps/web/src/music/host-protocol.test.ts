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
      { type: "load", ...track },
      { type: "crossfadeTo", cycles: 2, ...track },
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
      { type: "load", ...track, trackId: "" },
      { type: "load", ...track, phraseCycles: 0 },
      { type: "load", ...track, phraseCycles: 2.5 },
      { type: "load", ...track, source: 42 },
      { type: "load", ...track, source: "x".repeat(MAX_SOURCE_LENGTH + 1) },
      { type: "crossfadeTo", ...track },
      { type: "crossfadeTo", cycles: Number.NaN, ...track },
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

describe("parseHostToGame", () => {
  it("accepts every message the host sends", () => {
    for (const message of [
      { type: "ready" },
      { type: "playing", trackId: "first-light", cycle: 8, cps: 0.3 },
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
      { type: "playing", trackId: "x", cycle: -1, cps: 0.3 },
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
      { type: "load", ...track },
    ]) {
      expect(parseHostToGame(message), JSON.stringify(message)).toBeNull();
    }
  });
});
