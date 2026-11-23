import { SPAWN_BUBBLE_RADIUS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  JOIN_TIMEOUT_SECONDS,
  PRE_MATCH,
  PRE_MATCH_COUNTDOWN_SECONDS,
  type PlannedSeat,
} from "./match-host.js";
import {
  TICK_SECONDS,
  playerIn,
  settle,
  self,
  startMatch,
  starterBuild,
} from "./match-harness.test-support.js";
import { testCosmetics } from "./player-key.test-support.js";

/** A planned human seat (#3818), `team` 0 or 1. */
const human = (team: 0 | 1, name: string, key: string): PlannedSeat => ({
  team,
  name,
  guildTag: null,
  heroRank: 0,
  guildCape: null,
  bot: false,
  playerPubkey: key.repeat(32),
  startMorale: 0,
  cosmetics: testCosmetics,
  build: null,
});

/**
 * The local human and `peer-1` against a bot: three planned, two of them
 * to say hello, and to say their scene is drawn unless `sceneReady` is false (#3852).
 */
function threeSeats(sceneReady = true) {
  return startMatch({
    preMatch: PRE_MATCH,
    sceneReady,
    seats: new Map<string, PlannedSeat>([
      ["host/local", human(0, "Me", "ab")],
      ["peer-1", human(0, "Guest", "cd")],
      [
        "Henchman",
        {
          team: 1,
          name: "Henchman",
          guildTag: null,
          heroRank: 0,
          guildCape: null,
          bot: true,
          build: starterBuild("Monk/Elementalist"),
        },
      ],
    ]),
  });
}

describe("a match's wait before its start (#3818)", () => {
  it("waits, held, until the last planned human says hello, then counts down", async () => {
    const match = threeSeats();
    const local = await match.joinLocal();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");
    // The bot counts from the start.
    expect(local.getSnapshot().preMatch).toEqual({ joined: 2, expected: 3, secondsLeft: null });
    expect(local.getSnapshot().elapsedSeconds).toBe(0);

    await match.join();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().phase).toBe("countdown");
    expect(local.getSnapshot().preMatch).toEqual({
      joined: 3,
      expected: 3,
      secondsLeft: PRE_MATCH_COUNTDOWN_SECONDS,
    });
  });

  it("starts after the countdown, the clock from 0", async () => {
    const match = threeSeats();
    const local = await match.joinLocal();
    await match.join();
    await match.step(TICK_SECONDS);
    await match.step(PRE_MATCH_COUNTDOWN_SECONDS - 2 * TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch?.secondsLeft).toBe(1);
    expect(local.getSnapshot().elapsedSeconds).toBe(0);

    await match.step(2 * TICK_SECONDS);
    expect(match.host.phase).toBe("active");
    expect(local.getSnapshot().phase).toBe("active");
    expect(local.getSnapshot().preMatch).toBeNull();
    expect(local.getSnapshot().elapsedSeconds).toBeCloseTo(TICK_SECONDS);
  });

  it("counts down without a planned human who has not come in JOIN_TIMEOUT_SECONDS, and says so first", async () => {
    const match = threeSeats();
    const local = await match.joinLocal();
    await match.step(JOIN_TIMEOUT_SECONDS / 2 - 1);
    expect(local.getSnapshot().preMatch).toEqual({ joined: 2, expected: 3, secondsLeft: null });

    await match.step(2);
    expect(match.host.phase).toBe("waiting");
    expect(local.getSnapshot().preMatch).toEqual({
      joined: 2,
      expected: 3,
      secondsLeft: JOIN_TIMEOUT_SECONDS / 2 - 1,
    });

    await match.step(JOIN_TIMEOUT_SECONDS / 2);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch?.joined).toBe(2);
  });

  it("seats a late hello during the countdown held in its spawn bubble", async () => {
    const match = threeSeats();
    const local = await match.joinLocal();
    await match.step(JOIN_TIMEOUT_SECONDS + TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");

    const { connection: late } = await match.join();
    await match.step(TICK_SECONDS);
    const seated = self(late);
    expect(seated).toBeDefined();
    expect(local.getSnapshot().preMatch?.joined).toBe(3);
    const start = { x: seated?.x ?? 0, y: seated?.y ?? 0 };

    late.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(3);
    expect(match.host.phase).toBe("countdown");
    const moved = playerIn(local.getSnapshot(), seated?.sessionId ?? "");
    expect(moved?.x).not.toBe(start.x);
    expect(Math.hypot((moved?.x ?? 0) - start.x, (moved?.y ?? 0) - start.y)).toBeLessThanOrEqual(
      2 * SPAWN_BUBBLE_RADIUS,
    );
  });

  it("never says finished before the start", async () => {
    const match = threeSeats();
    await match.joinLocal();
    const phases = new Set<string>();
    for (
      let tick = 0;
      tick < (JOIN_TIMEOUT_SECONDS + PRE_MATCH_COUNTDOWN_SECONDS + 1) / TICK_SECONDS;
      tick += 1
    ) {
      await match.step(TICK_SECONDS);
      phases.add(match.host.phase);
    }
    expect([...phases]).toEqual(["waiting", "countdown", "active"]);
  });

  it("counts down at once with nobody planned to wait for", async () => {
    const match = startMatch({ preMatch: PRE_MATCH });
    const local = await match.joinLocal();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch).toEqual({
      joined: 1,
      expected: 1,
      secondsLeft: PRE_MATCH_COUNTDOWN_SECONDS,
    });
  });
});

describe("a match's countdown waits for every seated player's first frame (#3852)", () => {
  it("counts the scenes drawn, not the hellos, and counts down once the last is", async () => {
    const match = threeSeats(false);
    const local = await match.joinLocal();
    const { connection: guest } = await match.join();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");
    // The bot counts from the start; both humans are seated, neither drawn.
    expect(local.getSnapshot().preMatch).toEqual({ joined: 1, expected: 3, secondsLeft: null });

    local.sceneReady();
    await settle();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");
    expect(local.getSnapshot().preMatch?.joined).toBe(2);

    guest.sceneReady();
    await settle();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch).toEqual({
      joined: 3,
      expected: 3,
      secondsLeft: PRE_MATCH_COUNTDOWN_SECONDS,
    });
  });

  it("counts down at JOIN_TIMEOUT_SECONDS without a player whose scene never comes", async () => {
    const match = threeSeats(false);
    const local = await match.joinLocal();
    await match.join();
    local.sceneReady();
    await settle();
    await match.step(JOIN_TIMEOUT_SECONDS - TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");

    await match.step(2 * TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch?.joined).toBe(2);
  });

  it("ignores it from a peer with no seat, a watcher or a stranger", async () => {
    const match = startMatch({ preMatch: PRE_MATCH, sceneReady: false, spectators: ["watcher"] });
    const local = await match.joinLocal();
    for (const name of ["watcher", "stranger"]) {
      match.network.join(name).send("scene-ready", {}, "host");
    }
    await settle();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");
    expect(local.getSnapshot().preMatch).toEqual({ joined: 0, expected: 1, secondsLeft: null });
  });

  it("ignores one that is not an empty object", async () => {
    const match = startMatch({ preMatch: PRE_MATCH, sceneReady: false });
    const local = await match.joinLocal();
    match.local.send("scene-ready", { drawn: true }, "host");
    await settle();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("waiting");
    expect(local.getSnapshot().preMatch?.joined).toBe(0);
  });

  it("only counts once the countdown runs", async () => {
    const match = threeSeats(false);
    const local = await match.joinLocal();
    await match.step(JOIN_TIMEOUT_SECONDS + TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    const before = local.getSnapshot().preMatch?.secondsLeft ?? 0;

    local.sceneReady();
    await settle();
    await match.step(TICK_SECONDS);
    expect(match.host.phase).toBe("countdown");
    expect(local.getSnapshot().preMatch?.joined).toBe(2);
    expect(local.getSnapshot().preMatch?.secondsLeft).toBeLessThanOrEqual(before);
  });
});
