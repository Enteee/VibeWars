import { describe, expect, it } from "vitest";

import type { GameToHost, HostToGame } from "./host-protocol.js";
import {
  CROSSFADE_CYCLES,
  FLOODED_MESSAGE,
  HOST_MESSAGES_PER_SECOND,
  HEARTBEAT_MS,
  HEARTBEAT_TIMEOUT_MS,
  HUNG_MESSAGE,
  createMusicPlayer,
  measuringMusic,
  type MusicError,
  type MusicPlayerDeps,
  type TeardownReason,
} from "./music-player.js";

const track = { id: "first-light", source: 's("bd")', phraseCycles: 8 };

/** A player over fake hosts that record what they were sent. */
function setup(overrides: Partial<MusicPlayerDeps> = {}) {
  const frames: {
    sent: GameToHost[];
    destroyed: boolean;
    receive: (message: HostToGame | null) => void;
  }[] = [];
  const gestures = new EventTarget();
  let now = 0;
  let tick: (() => void) | undefined;
  const player = createMusicPlayer({
    createFrame: (receive) => {
      const frame = { sent: [] as GameToHost[], destroyed: false, receive };
      frames.push(frame);
      return {
        post: (message) => frame.sent.push(message),
        destroy: () => {
          frame.destroyed = true;
        },
      };
    },
    gestures,
    now: () => now,
    measure: false,
    audioStress: null,
    every: (ms, callback) => {
      expect(ms).toBe(HEARTBEAT_MS);
      tick = callback;
      return () => {
        tick = undefined;
      };
    },
    ...overrides,
  });
  return {
    player,
    frames,
    click: () => gestures.dispatchEvent(new Event("pointerdown")),
    /** Let `ms` pass without a heartbeat. */
    pass: (ms: number) => {
      now += ms;
    },
    /** Let `ms` pass, ticking the heartbeat each second. */
    advance: (ms: number) => {
      for (let passed = 0; passed < ms; passed += HEARTBEAT_MS) {
        now += HEARTBEAT_MS;
        tick?.();
      }
    },
  };
}

/** A player whose host was made by a click. */
function opened() {
  const setUp = setup();
  setUp.click();
  return setUp;
}

describe("createMusicPlayer", () => {
  it("makes no host before the first gesture, and one on it", () => {
    const { player, frames, click } = setup();
    player.load(track);
    expect(frames).toHaveLength(0);
    click();
    click();
    expect(frames).toHaveLength(1);
  });

  it("queues calls until the host is ready, keeping only the last of each kind", () => {
    const { player, frames, click } = setup();
    player.setIntensity(1);
    player.load(track);
    player.setIntensity(2);
    player.crossfadeTo({ ...track, id: "ashen-fields" });
    click();
    player.setVolume(0.5, 0.3);
    expect(frames[0]?.sent).toEqual([]);

    frames[0]?.receive({ type: "ready" });

    // The volume set after the click replaces the one a new host starts with.
    expect(frames[0]?.sent).toEqual([
      { type: "setIntensity", level: 2 },
      {
        type: "crossfadeTo",
        cycles: CROSSFADE_CYCLES,
        trackId: "ashen-fields",
        source: track.source,
        phraseCycles: 8,
      },
      { type: "setVolume", gain: 0.5, rampSeconds: 0.3 },
    ]);
    player.stop();
    expect(frames[0]?.sent.at(-1)).toEqual({ type: "stop" });
  });

  it("reports what the host says is playing, and its errors", () => {
    const { player, frames } = opened();
    const playing: string[] = [];
    const errors: MusicError[] = [];
    player.onNowPlaying((id) => playing.push(id));
    player.onError((error) => errors.push(error));
    frames[0]?.receive({ type: "ready" });
    frames[0]?.receive({ type: "playing", trackId: "first-light", cycle: 0, cps: 0.3 });
    frames[0]?.receive({ type: "error", message: "Unexpected token (3:0)", line: 3 });
    expect(playing).toEqual(["first-light"]);
    expect(errors).toEqual([{ message: "Unexpected token (3:0)", line: 3 }]);
  });

  it("numbers each evaluate, and hands its answer on with the number (#373)", () => {
    const { player, frames } = opened();
    const evaluated: number[] = [];
    const errors: MusicError[] = [];
    player.onEvaluated((evaluation) => evaluated.push(evaluation));
    player.onError((error) => errors.push(error));
    frames[0]?.receive({ type: "ready" });
    const first = player.evaluate('s("hh")');
    const second = player.evaluate(")))(");
    expect(second).toBeGreaterThan(first);
    expect(frames[0]?.sent.slice(-2)).toEqual([
      { type: "evaluate", seq: first, source: 's("hh")' },
      { type: "evaluate", seq: second, source: ")))(" },
    ]);
    frames[0]?.receive({ type: "evaluated", seq: first });
    frames[0]?.receive({ type: "error", message: "Unexpected token (1:0)", line: 1, seq: second });
    expect(evaluated).toEqual([first]);
    expect(errors).toEqual([{ message: "Unexpected token (1:0)", line: 1, evaluation: second }]);
  });

  it("tears down a host that stops answering, and makes a new one for the next track", () => {
    const { player, frames, advance } = opened();
    const errors: MusicError[] = [];
    player.onError((error) => errors.push(error));
    player.setVolume(0, 0);
    frames[0]?.receive({ type: "ready" });

    // A host that answers is kept.
    for (let i = 0; i < 10; i += 1) {
      advance(HEARTBEAT_MS);
      const ping = frames[0]?.sent.at(-1);
      if (ping?.type === "ping") {
        frames[0]?.receive({ type: "pong", seq: ping.seq });
      }
    }
    expect(frames[0]?.destroyed).toBe(false);

    advance(HEARTBEAT_MS);
    advance(HEARTBEAT_TIMEOUT_MS + HEARTBEAT_MS);
    expect(frames[0]?.destroyed).toBe(true);
    expect(errors).toEqual([{ message: HUNG_MESSAGE }]);

    player.setIntensity(3);
    expect(frames).toHaveLength(1);
    player.crossfadeTo(track);
    expect(frames).toHaveLength(2);
    frames[1]?.receive({ type: "ready" });
    expect(frames[1]?.sent.slice(0, 3)).toEqual([
      { type: "setVolume", gain: 0, rampSeconds: 0 },
      { type: "setIntensity", level: 3 },
      expect.objectContaining({ type: "crossfadeTo", trackId: "first-light" }),
    ]);
  });

  it("does not let a pong for another ping stand in for its own", () => {
    const { frames, advance } = opened();
    frames[0]?.receive({ type: "ready" });
    advance(HEARTBEAT_MS);
    frames[0]?.receive({ type: "pong", seq: 999 });
    advance(HEARTBEAT_TIMEOUT_MS + HEARTBEAT_MS);
    expect(frames[0]?.destroyed).toBe(true);
  });
});

describe("measuring the music (#420)", () => {
  const stats = {
    ticks: 10,
    lateTicks: 0,
    maxTickGapMs: 100,
    maxTickWorkMs: 5,
    skippedMs: 0,
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

  it("asks every host to measure first, and hands on what it reports", () => {
    const { player, frames, click } = setup({ measure: true });
    const seen: unknown[] = [];
    player.onStats((reported) => seen.push(reported));
    click();
    frames[0]?.receive({ type: "ready" });
    expect(frames[0]?.sent[0]).toEqual({ type: "measure" });

    frames[0]?.receive({ type: "stats", ...stats });
    expect(seen).toEqual([stats]);
  });

  it("never asks a host to measure without ?musicstats", () => {
    const { frames } = opened();
    frames[0]?.receive({ type: "ready" });
    expect(frames[0]?.sent.map((message) => message.type)).not.toContain("measure");
  });
});

describe("measuringMusic", () => {
  it("is ?musicstats, with or without a value", () => {
    expect(measuringMusic("?musicstats")).toBe(true);
    expect(measuringMusic("?stress=40&musicstats=1")).toBe(true);
    expect(measuringMusic("")).toBe(false);
    expect(measuringMusic("?music")).toBe(false);
  });
});

describe("a host that floods the game (#878)", () => {
  /** A ready host, whose errors and teardowns are recorded. */
  function flooded() {
    const setUp = opened();
    const errors: MusicError[] = [];
    const reasons: TeardownReason[] = [];
    setUp.player.onError((error) => errors.push(error));
    setUp.player.onTornDown((reason) => reasons.push(reason));
    setUp.frames[0]?.receive({ type: "ready" });
    return { ...setUp, errors, reasons };
  }

  it(`is torn down at its ${String(HOST_MESSAGES_PER_SECOND + 1)}st message in a second, unparseable ones too`, () => {
    const { frames, pass, errors, reasons } = flooded();
    // `ready` was the first.
    for (let i = 1; i < HOST_MESSAGES_PER_SECOND; i += 1) {
      frames[0]?.receive(null);
    }
    pass(999);
    expect(frames[0]?.destroyed).toBe(false);
    frames[0]?.receive(null);
    expect(frames[0]?.destroyed).toBe(true);
    expect(errors).toEqual([{ message: FLOODED_MESSAGE }]);
    expect(reasons).toEqual(["flooded"]);
  });

  it(`keeps a host that sends ${String(HOST_MESSAGES_PER_SECOND + 1)} over two seconds`, () => {
    const { frames, pass, reasons } = flooded();
    for (let i = 1; i <= HOST_MESSAGES_PER_SECOND; i += 1) {
      pass(20);
      frames[0]?.receive({ type: "pong", seq: 0 });
    }
    expect(frames[0]?.destroyed).toBe(false);
    expect(reasons).toEqual([]);
  });

  it("says when a host is torn down for hanging", () => {
    const { frames, advance, reasons } = flooded();
    advance(HEARTBEAT_MS + HEARTBEAT_TIMEOUT_MS + HEARTBEAT_MS);
    expect(frames[0]?.destroyed).toBe(true);
    expect(reasons).toEqual(["hung"]);
  });

  it("hands on one error per evaluation, and one per track sent", () => {
    const { player, frames, errors } = flooded();
    const seq = player.evaluate(")))(");
    for (let i = 0; i < 3; i += 1) {
      frames[0]?.receive({ type: "error", message: "bad", seq });
    }
    player.load(track);
    frames[0]?.receive({ type: "error", message: "playing" });
    frames[0]?.receive({ type: "error", message: "playing" });
    expect(errors).toEqual([{ message: "bad", evaluation: seq }, { message: "playing" }]);
    player.crossfadeTo(track);
    frames[0]?.receive({ type: "error", message: "again" });
    expect(errors.at(-1)).toEqual({ message: "again" });
  });
});
