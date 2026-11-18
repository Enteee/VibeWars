import { ANNIHILATION_MATCH_RULES, type MatchRules } from "@vibewars/game-core";
import type { ClientIntent } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import {
  ARENA,
  TICK_SECONDS,
  starterBuild,
  startMatch,
  until,
} from "./match-harness.test-support.js";
import type { PlannedSeat } from "./match-host.js";
import { rerun } from "./replay-run.js";
import {
  encodeReplay,
  joinReplay,
  packReplay,
  parseReplay,
  replayHash,
  type MatchReplay,
  type RecordedReplay,
  type ReplayInput,
  type Sha256,
} from "./replay.js";

const sha256: Sha256 = async (bytes) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));

const RECORDING = { buildHash: "test-build", sha256 };

/** A minute at most, so a stalemate still ends. */
const RULES: MatchRules = { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 60 };

const BUILDS = ["Warrior/Monk", "Ranger/Mesmer", "Monk/Elementalist", "Elementalist/Mesmer"];

function botSeat(team: 0 | 1, index: number): [string, PlannedSeat] {
  const name = `Bot ${String(team)}-${String(index)}`;
  return [
    name,
    {
      team,
      name,
      guildTag: null,
      heroRank: 0,
      guildCape: null,
      bot: true,
      build: starterBuild(BUILDS[index % BUILDS.length] ?? "Warrior/Monk"),
    },
  ];
}

function sample(): MatchReplay {
  return {
    buildHash: "test-build",
    seed: "seed",
    map: "Test Arena",
    teamCount: 2,
    mode: "random-arena",
    ticks: 3,
    inputs: [
      [0, "awaited", [0, 1]],
      [1, "intent", "p1", { kind: "stop" }],
      [1, "intent", "p1", { kind: "attack", targetId: "p2" }],
      [2, "called", 0, null],
    ],
  };
}

describe("a match's replay (#3572)", () => {
  it("is one encoding whatever order its keys were built in, hashed to hex", async () => {
    const replay = sample();
    const shuffled: MatchReplay = {
      inputs: replay.inputs,
      ticks: replay.ticks,
      mode: replay.mode,
      teamCount: replay.teamCount,
      map: replay.map,
      seed: replay.seed,
      buildHash: replay.buildHash,
    };
    expect(encodeReplay(shuffled)).toBe(encodeReplay(replay));
    const hash = await replayHash(replay, sha256);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(parseReplay(JSON.parse(encodeReplay(replay)))).toEqual(replay);
  });

  it("keeps two intents of one tick in the order they were applied", () => {
    const parsed = parseReplay(JSON.parse(encodeReplay(sample())));
    expect(
      parsed?.inputs.slice(1, 3).map((input) => input[1] === "intent" && input[3].kind),
    ).toEqual(["stop", "attack"]);
  });

  it("goes in parts of at most the size given, and comes back from them in any order", async () => {
    const replay = sample();
    const text = encodeReplay(replay);
    const hash = await replayHash(replay, sha256);
    const parts = packReplay(text, hash, 120);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(new TextEncoder().encode(JSON.stringify(part)).length).toBeLessThanOrEqual(120);
    }
    expect(await joinReplay([...parts].reverse(), sha256)).toEqual({ hash, replay });
    // One missing, one twice, or one changed is no replay.
    expect(await joinReplay(parts.slice(1), sha256)).toBeUndefined();
    const [first, ...rest] = parts;
    if (first === undefined) {
      throw new Error("no parts");
    }
    expect(await joinReplay([first, first, ...rest.slice(1)], sha256)).toBeUndefined();
    expect(
      await joinReplay([{ ...first, text: `${first.text.slice(0, -1)}~` }, ...rest], sha256),
    ).toBeUndefined();
  });

  it("refuses what is not a replay", () => {
    const replay = JSON.parse(encodeReplay(sample())) as Record<string, unknown>;
    expect(parseReplay({ ...replay, ticks: -1 })).toBeUndefined();
    expect(parseReplay({ ...replay, mode: "chess" })).toBeUndefined();
    expect(parseReplay({ ...replay, inputs: [[0, "teleport", "p1"]] })).toBeUndefined();
    const { seed: _seed, ...seedless } = replay;
    expect(parseReplay(seedless)).toBeUndefined();
  });

  it(
    "of a bot match runs again to the same end, and reaches the player whole",
    { timeout: 30_000 },
    async () => {
      const kept: RecordedReplay[] = [];
      const seats = new Map<string, PlannedSeat>([
        ...[0, 1, 2, 3].map((index) => botSeat(0, index)),
        ...[0, 1, 2].map((index) => botSeat(1, index)),
        [
          "host/local",
          {
            team: 1,
            name: "Me",
            guildTag: null,
            heroRank: 0,
            guildCape: null,
            bot: false,
            playerPubkey: "ab".repeat(32),
            startMorale: 0,
            build: starterBuild("Warrior/Monk"),
          },
        ],
      ]);
      const match = startMatch({
        seats,
        matchRules: RULES,
        recordReplay: RECORDING,
        replays: { sha256, keep: (recorded) => kept.push(recorded) },
      });
      const local = await match.joinLocal();
      // The player does a little: two intents in one tick, now and then.
      const intents: ClientIntent[] = [
        { kind: "move", dirX: 1, dirY: 0 },
        { kind: "use-skill", slot: 0 },
        { kind: "stop" },
      ];
      for (let tick = 0; match.host.phase === "active" && tick < 2 * 60 * 20; tick += 1) {
        if (tick % 20 === 0) {
          local.sendIntent(intents[(tick / 20) % intents.length] ?? { kind: "stop" });
          local.sendIntent({ kind: "use-skill", slot: (tick / 20) % 8 });
        }
        await match.step(TICK_SECONDS);
      }
      expect(match.host.phase).toBe("finished");
      await until(() => match.host.replay !== null && kept.length > 0);
      const recorded = match.host.replay;
      if (recorded === null) {
        throw new Error("no replay");
      }
      // The player holds the host's replay, checked against its hash.
      expect(kept).toEqual([recorded]);
      const { replay } = recorded;
      expect(replay.inputs.some((input) => input[1] === "intent")).toBe(true);

      const again = rerun(replay, ARENA, RULES);
      expect(again.ticks).toBe(replay.ticks);
      expect(again.outcome.winningTeam ?? null).toBe(match.host.winningTeam);
      const snapshot = local.getSnapshot();
      expect(snapshot.players.length).toBe(8);
      for (const player of snapshot.players) {
        expect(Math.round(again.health.get(player.sessionId) ?? Number.NaN)).toBe(player.health);
      }
      // And a second rerun is the first: nothing in it reads a clock or Math.random.
      expect(rerun(replay, ARENA, RULES)).toEqual(again);
    },
  );

  it("of a busy ten-minute 8v8 stays under a megabyte", () => {
    // Sixteen players, each sending an intent a second for ten minutes, as
    // a busy GW1 player does at 60 actions a minute; mouse moves at any angle.
    const seats = Array.from({ length: 16 }, (_, i) => `player-${i.toString().padStart(2, "0")}`);
    const inputs: ReplayInput[] = [];
    const ticks = 10 * 60 * 20;
    for (let tick = 0; tick < ticks; tick += 20) {
      for (const [i, seat] of seats.entries()) {
        const angle = (tick * 0.37 + i) % (Math.PI * 2);
        const intent: ClientIntent =
          (tick / 20 + i) % 3 === 0
            ? { kind: "move", dirX: Math.cos(angle), dirY: Math.sin(angle) }
            : (tick / 20 + i) % 3 === 1
              ? { kind: "use-skill", slot: (tick + i) % 8 }
              : { kind: "attack", targetId: seats[(i + 3) % 16] ?? seat };
        inputs.push([tick, "intent", seat, intent]);
      }
    }
    const text = encodeReplay({ ...sample(), ticks, inputs });
    expect(new TextEncoder().encode(text).length).toBeLessThan(1_000_000);
  });
});
