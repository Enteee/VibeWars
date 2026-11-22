import {
  CREATURE_LOOKS,
  ANNIHILATION_MATCH_RULES,
  MAX_CREATURES,
  MAX_MAP_CREATURES,
  MAX_GROUND_EFFECTS,
  PRIEST_ANNIHILATION_MATCH_RULES,
} from "@vibewars/game-core";
import {
  CREATURE_LOOKS as WIRE_CREATURE_LOOKS,
  MAX_WIRE_CREATURES,
  MAX_WIRE_GROUND_EFFECTS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUS_INDEX,
  packEmblem,
  type WireMatchReplayPart,
  type WirePlayer,
} from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  HELLO_RESEND_MS,
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  connectMatch,
  createReplayParts,
} from "./match-client.js";
import type { PlayerSnapshot } from "./match-connection.js";
import { RECONNECT_WINDOW_SECONDS, createMatchHost } from "./match-host.js";
import {
  ARENA,
  TEST_MATCH_ID,
  hello,
  helloAs,
  self,
  settle,
  startMatch,
  cryptoTurns,
  testSignet,
  until,
} from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
import {
  encodeReplay,
  MAX_REPLAY_CHARS,
  packReplay,
  replayHash,
  type MatchReplay,
  type RecordedReplay,
  type Sha256,
} from "./replay.js";
import type { Transport } from "./transport.js";
import { WIRE_STATUS_IDS, playerSnapshot, statusFromWire, statusWireIndex } from "./wire.js";

/**
 * What a P2P client believes, and from whom (#375): only the host, only
 * through a validator, only ever forward in time.
 */
describe("connectMatch", () => {
  it("ignores a snapshot from a peer that is not the host", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    const liar = match.network.join();
    await match.step(0.05);
    const before = self(connection);
    liar.send("snapshot", {
      tick: 10_000,
      elapsedSeconds: 999,
      score: [99, 0],
      phase: "finished",
      winningTeam: 0,
      endReason: "score",
      part: 0,
      parts: 1,
      players: [],
      projectiles: [],
      groundEffects: [],
      flags: [],
      stand: null,
      aggression: [],
      relics: [],
      altar: null,
      altarHolder: null,
      altarHeldSeconds: 0,
      capturePoints: [],
      gates: [],
    });
    await settle();
    expect(connection.getSnapshot().score[0]).toBe(0);
    expect(connection.getSnapshot().phase).toBe("active");
    expect(self(connection)).toEqual(before);
  });

  it("drops a snapshot whose tick is not past the last one kept", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(0.25);
    const kept = connection.getSnapshot().elapsedSeconds;
    // The host's own transport replays an old tick, as a duplicate would.
    match.hostTransport.send(
      "snapshot",
      {
        tick: 1,
        elapsedSeconds: 0.05,
        score: [0, 0],
        phase: "active",
        winningTeam: null,
        endReason: null,
        part: 0,
        parts: 1,
        players: [],
        projectiles: [],
        groundEffects: [],
        flags: [],
        stand: null,
        aggression: [],
        relics: [],
        altar: null,
        altarHolder: null,
        altarHeldSeconds: 0,
        capturePoints: [],
        gates: [],
      },
      transport.selfId,
    );
    await settle();
    expect(connection.getSnapshot().elapsedSeconds).toBe(kept);
    expect(connection.getSnapshot().players).not.toEqual([]);
  });

  it("ignores a malformed message from the host rather than throwing", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const before = connection.getSnapshot();
    for (const channel of ["snapshot", "combat", "recharge", "refused", "ended"] as const) {
      match.hostTransport.send(channel, { garbage: true }, transport.selfId);
    }
    await settle();
    expect(connection.getSnapshot()).toEqual(before);
  });

  it("names statuses by their wire index, and drops a snapshot with an index past the table (#632)", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const before = connection.getSnapshot();
    const send = (tick: number, statuses: number[]): void => {
      match.hostTransport.send(
        "snapshot",
        {
          tick,
          elapsedSeconds: tick,
          score: [0, 0],
          phase: "active",
          winningTeam: null,
          endReason: null,
          part: 0,
          parts: 1,
          players: [
            {
              ...WIRE_PLAYER,
              statuses: statuses.map((status) => ({
                status,
                endsAt: tick + 3,
                durationSeconds: 5,
                casterId: "p2",
              })),
            },
          ],
          projectiles: [],
          groundEffects: [],
          flags: [],
          stand: null,
          aggression: [],
          relics: [],
          altar: null,
          altarHolder: null,
          altarHeldSeconds: 0,
          capturePoints: [],
          gates: [],
          switches: [],
          teleports: [],
          breakables: [],
          decks: [],
          lifts: [],
        },
        transport.selfId,
      );
    };
    send(10_000, [statusWireIndex("burning"), WIRE_STATUS_IDS.length]);
    await settle();
    expect(connection.getSnapshot()).toEqual(before);

    send(10_001, [statusWireIndex("burning"), statusWireIndex("weakness")]);
    await settle();
    expect(connection.getSnapshot().players.map((player) => player.statuses)).toEqual([
      [
        { id: "burning", endsAt: 10_004, durationSeconds: 5, casterId: "p2" },
        { id: "weakness", endsAt: 10_004, durationSeconds: 5, casterId: "p2" },
      ],
    ]);
  });

  it("is refused for another protocol version, with the host's reason", async () => {
    const match = startMatch();
    await expect(match.join({ ...hello(), protocolVersion: "000000000000" })).rejects.toThrow(
      MatchRefusedError,
    );
  });

  it("is refused when the match is full, and when it is over", async () => {
    const full = startMatch({ maxPlayers: 1 });
    await full.join();
    await expect(full.join()).rejects.toMatchObject({ reason: "match-full" });

    const over = startMatch({
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 0.1 },
    });
    await over.join();
    await over.step(0.2);
    expect(over.host.phase).toBe("finished");
    const refused = over.join();
    await expect(refused).rejects.toMatchObject({ reason: "match-over" });
  });

  describe("a match's replay (#3572)", () => {
    const sha256: Sha256 = async (bytes) =>
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const replay: MatchReplay = {
      buildHash: "test-build",
      seed: "seed",
      map: "Test Arena",
      teamCount: 2,
      mode: "random-arena",
      ticks: 2,
      overrunBy: null,
      inputs: [[1, "intent", "player-1", { kind: "stop" }]],
    };
    const ENDED = { winningTeam: 1, endReason: "score", summary: [], clearSeconds: null };

    async function joined() {
      const kept: RecordedReplay[] = [];
      const match = startMatch({ replays: { sha256, keep: (recorded) => kept.push(recorded) } });
      await match.joinLocal();
      const text = encodeReplay(replay);
      const hash = await replayHash(replay, sha256);
      const send = (parts: readonly WireMatchReplayPart[], from = match.hostTransport): void => {
        for (const part of parts) {
          from.send("match-replay", part, match.local.selfId);
        }
      };
      return { match, kept, hash, parts: packReplay(text, hash, 100), send };
    }

    it("is kept once all its parts are in, in any order, after the end", async () => {
      const { match, kept, hash, parts, send } = await joined();
      expect(parts.length).toBeGreaterThan(2);
      // Before the end it is no replay, and a stranger's never is.
      send(parts);
      await cryptoTurns();
      match.hostTransport.send("ended", ENDED, match.local.selfId);
      send(parts, match.network.join());
      await cryptoTurns();
      expect(kept).toEqual([]);

      const [first, ...rest] = [...parts].reverse();
      send([first, first, ...rest].flatMap((part) => (part === undefined ? [] : [part])));
      await until(() => kept.length > 0);
      send(parts);
      await cryptoTurns();
      expect(kept).toEqual([{ hash, replay }]);
    });

    it("is dropped when its text does not hash to what its parts say", async () => {
      const { match, kept, parts, send } = await joined();
      match.hostTransport.send("ended", ENDED, match.local.selfId);
      send(parts.map((part, i) => (i === 0 ? { ...part, text: `~${part.text.slice(1)}` } : part)));
      await cryptoTurns();
      expect(kept).toEqual([]);
    });
  });

  describe("replay parts (#3620)", () => {
    const hash = "1".repeat(64);
    const text = "a".repeat(16 * 1024);

    it("hold up to MAX_REPLAY_CHARS, are dropped past it, and stay dropped", () => {
      const parts = createReplayParts();
      const fit = Math.floor(MAX_REPLAY_CHARS / text.length);
      for (let part = 0; part < fit; part += 1) {
        expect(parts.add({ hash, part, of: fit + 2, text })).toBeUndefined();
      }
      expect(parts.chars).toBe(fit * text.length);
      expect(parts.add({ hash, part: fit, of: fit + 2, text })).toBeUndefined();
      expect(parts.chars).toBe(0);
      parts.add({ hash, part: 0, of: fit + 2, text });
      expect(parts.chars).toBe(0);
    });

    it("hold exactly MAX_REPLAY_CHARS", () => {
      const parts = createReplayParts();
      const half = "b".repeat(MAX_REPLAY_CHARS / 2);
      parts.add({ hash, part: 0, of: 3, text: half });
      parts.add({ hash, part: 1, of: 3, text: half });
      expect(parts.chars).toBe(MAX_REPLAY_CHARS);
    });

    it("are dropped on a part whose hash or count differs from the first", () => {
      for (const odd of [{ hash: "2".repeat(64) }, { of: 4 }]) {
        const parts = createReplayParts();
        parts.add({ hash, part: 0, of: 3, text });
        expect(parts.add({ hash, part: 1, of: 3, text, ...odd })).toBeUndefined();
        expect(parts.chars).toBe(0);
        parts.add({ hash, part: 1, of: 3, text });
        expect(parts.chars).toBe(0);
      }
    });

    it("count a repeated part once, and hand out every part once complete", () => {
      const parts = createReplayParts();
      parts.add({ hash, part: 1, of: 2, text });
      parts.add({ hash, part: 1, of: 2, text });
      expect(parts.chars).toBe(text.length);
      expect(parts.add({ hash, part: 0, of: 2, text })?.map((p) => p.part)).toEqual([1, 0]);
      expect(parts.chars).toBe(0);
    });
  });

  it("gives up on a host that never answers", async () => {
    const network = createMemoryNetwork();
    network.join("host");
    const transport = network.join();
    await expect(
      connectMatch({ transport, hostId: "host", hello: hello(), timeoutMs: 20, replays: null }),
    ).rejects.toThrow(MatchTimeoutError);
  });

  it("fails at once when the host leaves before letting it in", async () => {
    const network = createMemoryNetwork();
    const host = network.join("host");
    const transport = network.join();
    await settle();
    const joining = connectMatch({
      transport,
      hostId: "host",
      hello: hello(),
      timeoutMs: 10_000,
      replays: null,
    });
    await host.leave();
    await expect(joining).rejects.toThrow(HostLeftError);
  });

  it("keeps a real result when its host goes after it (#2905)", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    match.hostTransport.send(
      "ended",
      { winningTeam: 1, endReason: "score", summary: [], clearSeconds: null },
      transport.selfId,
    );
    match.hostTransport.send(
      "ended",
      { winningTeam: null, endReason: "host-left", summary: [], clearSeconds: null },
      transport.selfId,
    );
    await settle();
    expect(states).toEqual([]);
  });

  it("tells every client the host left when it closes the match", async () => {
    const match = startMatch();
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
    const states: string[] = [];
    local.onConnectionChange((state) => states.push(`local:${state}`));
    remote.onConnectionChange((state) => states.push(`remote:${state}`));
    await match.host.close("host-left");
    await settle();
    expect(states.sort()).toEqual(["local:host-left", "remote:host-left"]);
  });

  it("shows the result once the match ends", async () => {
    const match = startMatch({
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 0.1 },
    });
    const { connection } = await match.join();
    await match.step(0.2);
    const snapshot = connection.getSnapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.endReason).toBe("morale");
  });

  it("counts recharges down on the match clock, with no wall time", async () => {
    const match = startMatch();
    const { connection } = await match.join(helloAs("Elementalist/Mesmer"));
    const { connection: foe } = await match.join();
    await match.step(0.05);
    // Armor of Earth is a self-buff: castable at once.
    const slot = connection.skillBar.findIndex((s) => s?.id === "elementalist.armor-of-earth");
    expect(slot).toBeGreaterThanOrEqual(0);
    connection.sendIntent({ kind: "use-skill", slot });
    await match.step(1.5);
    const first = connection.getRecharges()[slot];
    expect(first?.remaining).toBeGreaterThan(0);
    await match.step(1);
    const later = connection.getRecharges()[slot];
    expect(later?.total).toBe(first?.total);
    expect(first?.remaining ?? 0).toBeGreaterThan(later?.remaining ?? 0);
    expect(foe.getRecharges().every((recharge) => recharge.remaining === 0)).toBe(true);
    expect(connection.getRecharges()).toHaveLength(MAX_WIRE_SLOTS);
  });
});

describe("the host's own player (createLocalPeer)", () => {
  it("joins, moves, casts and is refused exactly as a remote player is", async () => {
    const match = startMatch();
    // One build for both, so the bars match (#852).
    const local = await match.joinLocal(helloAs("Warrior/Monk"));
    const { connection: remote } = await match.join(helloAs("Warrior/Monk"));
    const refusals: string[] = [];
    local.onCastRefused((refusal) => refusals.push(`local:${refusal.reason}`));
    remote.onCastRefused((refusal) => refusals.push(`remote:${refusal.reason}`));
    await match.step(0.05);

    expect(local.skillBar).toEqual(remote.skillBar);
    const [localY, remoteY] = [self(local)?.y ?? 0, self(remote)?.y ?? 0];
    for (const player of [local, remote]) {
      player.sendIntent({ kind: "move", dirX: 0, dirY: 1 });
    }
    await match.step(0.5);
    expect((self(local)?.y ?? 0) - localY).toBeGreaterThan(0);
    expect((self(local)?.y ?? 0) - localY).toBeCloseTo((self(remote)?.y ?? 0) - remoteY, 5);

    // An attack on yourself: refused alike, to each alone.
    for (const player of [local, remote]) {
      player.sendIntent({ kind: "attack", targetId: player.selfSessionId });
    }
    await match.step(0.05);
    expect(refusals.sort()).toEqual(["local:invalid-target-self", "remote:invalid-target-self"]);
  });

  it("sees what the remote players see", async () => {
    const match = startMatch();
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
    await match.step(0.1);
    expect(local.getSnapshot().players).toEqual(remote.getSnapshot().players);
  });

  it("sees each team's priest on its shrine, owned by nobody, on a Priest Annihilation map (#1186)", async () => {
    const match = startMatch({
      map: {
        ...ARENA,
        mode: "priest-annihilation",
        shrines: [
          { team: 0, position: { x: 300, y: 550 }, layer: 0 },
          { team: 1, position: { x: 800, y: 550 }, layer: 0 },
        ],
      },
      matchRules: PRIEST_ANNIHILATION_MATCH_RULES,
    });
    const { connection } = await match.join();
    await match.step(0.1);
    const priests = connection
      .getSnapshot()
      .players.filter((player) => player.creature?.kind === "priest")
      .map(({ name, team, x, y, creature }) => ({ name, team, x, y, ownerId: creature?.ownerId }));
    expect(priests).toEqual([
      { name: "Priest", team: 0, x: 300, y: 550, ownerId: null },
      { name: "Priest", team: 1, x: 800, y: 550, ownerId: null },
    ]);
  });
});

describe("WirePlayer and PlayerSnapshot (#375 §2)", () => {
  /** PlayerSnapshot's name for each WirePlayer field. */
  const FIELDS = {
    id: "sessionId",
    name: "name",
    guildTag: "guildTag",
    heroRank: "heroRank",
    team: "team",
    x: "x",
    y: "y",
    facing: "facing",
    layer: "layer",
    targetId: "targetSessionId",
    attackTargetId: "attackTargetSessionId",
    walking: "walking",
    health: "health",
    maxHealth: "maxHealth",
    energy: "energy",
    maxEnergy: "maxEnergy",
    overcast: "overcast",
    morale: "morale",
    armor: "armor",
    weaponId: "weaponId",
    offhandId: "offhandId",
    primaryProfession: "primaryProfession",
    secondaryProfession: "secondaryProfession",
    dead: "dead",
    corpseExploited: "corpseExploited",
    castingSkillId: "castingSkillId",
    castRemaining: "castRemaining",
    castTotal: "castTotal",
    swingElapsed: "swingElapsed",
    swingTotal: "swingTotal",
    knockdownRemaining: "knockdownRemaining",
    invulnerableSeconds: "invulnerableSeconds",
    teleportReadyAt: "teleportReadyAt",
    healthPips: "healthPips",
    energyPips: "energyPips",
    statuses: "statuses",
    creature: "creature",
    bot: "bot",
    signet: "signet",
  } as const satisfies Record<keyof WirePlayer, keyof PlayerSnapshot>;

  it("have one field for each field of the other", () => {
    // Every WirePlayer key is above (`satisfies`), and every
    // PlayerSnapshot key is one of the names: a field added to either
    // without the other stops this compiling. `respawnIn` is no
    // snapshot field: its team hears it on `"respawns"` (#3367); nor is
    // `guildCape`: every seat's comes once on `"capes"` (#3554), nor
    // `worn`, on `"cosmetics"` (ADR-0056).
    expectTypeOf<(typeof FIELDS)[keyof typeof FIELDS]>().toEqualTypeOf<
      Exclude<keyof PlayerSnapshot, "respawnIn" | "guildCape" | "worn">
    >();
    expect(new Set(Object.values(FIELDS)).size).toBe(Object.keys(FIELDS).length);
  });

  it("convert field for field, null to undefined", () => {
    const wire: WirePlayer = {
      ...WIRE_PLAYER,
      statuses: [
        { status: statusWireIndex("burning"), endsAt: 7.5, durationSeconds: 3, casterId: "p2" },
      ],
    };
    const snapshot = playerSnapshot(wire, new Map(), new Map());
    for (const [wireKey, snapshotKey] of Object.entries(FIELDS)) {
      const sent = wire[wireKey as keyof WirePlayer];
      const got = snapshot?.[snapshotKey];
      // A profession this client does not know draws as none, as the server's
      // does; a status is its index on the wire (#632).
      const expected =
        wireKey === "secondaryProfession"
          ? undefined
          : wireKey === "statuses"
            ? [{ id: "burning", endsAt: 7.5, durationSeconds: 3, casterId: "p2" }]
            : (sent ?? undefined);
      expect(got, wireKey).toEqual(expected);
    }
  });

  it('wear the cape its id has on the host\'s last "capes", and none without one (#3554)', () => {
    const cape = {
      main: "2fb8a0",
      trim: "f2f2f2",
      emblemColours: [],
      emblem: packEmblem([]),
    } as const;
    expect(playerSnapshot(WIRE_PLAYER, new Map([["p1", cape]]), new Map())?.guildCape).toEqual(
      cape,
    );
    expect(
      playerSnapshot(WIRE_PLAYER, new Map([["p2", cape]]), new Map())?.guildCape,
    ).toBeUndefined();
  });

  it("keep a creature's owner and kind (#1052)", () => {
    const creature = {
      ownerId: "p2",
      kind: "minion",
      look: "bone-minion",
      mode: null,
      armedAttack: null,
      leaderId: null,
      auraRadius: null,
    } as const;
    expect(playerSnapshot({ ...WIRE_PLAYER, creature }, new Map(), new Map())?.creature).toEqual(
      creature,
    );
  });

  it("keep a rat, nobody's critter (#3315)", () => {
    const creature = {
      ownerId: null,
      kind: "critter",
      look: "rat",
      mode: null,
      armedAttack: null,
      auraRadius: null,
      leaderId: null,
    } as const;
    expect(playerSnapshot({ ...WIRE_PLAYER, creature }, new Map(), new Map())?.creature).toEqual(
      creature,
    );
  });

  it("keep a pet's armed attack, and refuse one that is not a known pet attack (#1167)", () => {
    const pet = (skillId: string): WirePlayer => ({
      ...WIRE_PLAYER,
      creature: {
        ownerId: "p2",
        kind: "pet",
        look: "beast",
        mode: "fight",
        armedAttack: { skillId, endsAt: 12.1 },
        leaderId: null,
        auraRadius: null,
      },
    });
    expect(
      playerSnapshot(pet("ranger.brutal-strike"), new Map(), new Map())?.creature?.armedAttack,
    ).toEqual({
      skillId: "ranger.brutal-strike",
      endsAt: 12.1,
    });
    expect(playerSnapshot(pet("ranger.no-such-skill"), new Map(), new Map())).toBeUndefined();
    expect(playerSnapshot(pet("warrior.swift-chop"), new Map(), new Map())).toBeUndefined();
  });

  it("hold the wire's creature cap to game-core's summons and map creatures (#1052, #1281)", () => {
    expect(MAX_WIRE_CREATURES).toBe(MAX_CREATURES + MAX_MAP_CREATURES);
  });

  it("hold the wire's creature looks to game-core's (#1162)", () => {
    expect(WIRE_CREATURE_LOOKS).toEqual(CREATURE_LOOKS);
  });

  it("hold the wire's ground-effect cap to game-core's (#1087)", () => {
    expect(MAX_WIRE_GROUND_EFFECTS).toBe(MAX_GROUND_EFFECTS);
  });

  it("map every status to its index and back (#632)", () => {
    expect(WIRE_STATUS_IDS.length).toBeLessThanOrEqual(MAX_WIRE_STATUS_INDEX + 1);
    for (const id of WIRE_STATUS_IDS) {
      expect(statusFromWire(statusWireIndex(id))).toBe(id);
    }
    expect(statusFromWire(WIRE_STATUS_IDS.length)).toBeUndefined();
    const unknown = {
      status: WIRE_STATUS_IDS.length,
      endsAt: 1,
      durationSeconds: 1,
      casterId: "p2",
    };
    expect(
      playerSnapshot({ ...WIRE_PLAYER, statuses: [unknown] }, new Map(), new Map()),
    ).toBeUndefined();
  });
});

/** A valid player, as a host sends it. */
const WIRE_PLAYER: WirePlayer = {
  id: "p1",
  name: "Mhenlo",
  guildTag: "VIBE",
  heroRank: 0,
  team: 1,
  x: 1,
  y: 2,
  facing: 0.5,
  layer: 0,
  targetId: null,
  attackTargetId: "p2",
  walking: true,
  health: 400,
  maxHealth: 480,
  energy: 10,
  maxEnergy: 30,
  overcast: 0,
  morale: 0,
  armor: 60,
  weaponId: "staff",
  offhandId: null,
  primaryProfession: "monk",
  secondaryProfession: "no-such-profession",
  dead: false,
  corpseExploited: false,
  castingSkillId: null,
  castRemaining: 0,
  castTotal: 0,
  swingElapsed: 0.5,
  swingTotal: 1.75,
  knockdownRemaining: 0,
  invulnerableSeconds: 0,
  teleportReadyAt: 0,
  healthPips: 0,
  energyPips: 0,
  creature: null,
  statuses: [],
  bot: false,
  signet: 4242,
};

/**
 * A guest whose connection to the host drops (#515): the host holds the
 * seat for its window, so the guest waits as long, and asks for it back
 * with its token when the host's peer is there again.
 */
describe("connectMatch, when the host's peer drops", () => {
  const WINDOW_MS = RECONNECT_WINDOW_SECONDS * 1000;

  beforeEach(() => {
    // Only the clock: the memory transport delivers on microtasks.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * A remote guest in a match, its states as they change, every hello the
   * host hears, and everything the guest sends from the drop on.
   */
  async function dropped(match = startMatch()) {
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    const hellos: unknown[] = [];
    match.hostTransport.on("hello", (data) => hellos.push(data));
    const token = connection.rejoinToken;
    const sent = vi.spyOn(transport, "send");
    match.network.partition("host", transport.selfId);
    await settle();
    return { match, connection, transport, states, hellos, token, sent };
  }

  it("is reconnecting, then back in the same seat when the host is back in 10 s", async () => {
    const { match, connection, states, hellos, token, sent } = await dropped();
    expect(states).toEqual(["reconnecting"]);

    vi.advanceTimersByTime(10_000);
    match.network.heal();
    await until(() => states.length === 2);

    expect(states).toEqual(["reconnecting", "online"]);
    expect(hellos).toEqual([
      expect.objectContaining({ rejoin: { playerId: connection.selfSessionId } }),
    ]);
    // Asked and proven: the token itself never went back on the wire (#593).
    expect(sent.mock.calls.map(([channel]) => channel)).toEqual(["hello", "rejoin-proof"]);
    expect(JSON.stringify(sent.mock.calls)).not.toContain(token);
    // A new token with the welcome, for the next drop.
    expect(connection.rejoinToken).not.toBe(token);
    // The same connection carries on: intents go through and snapshots come.
    const x = self(connection)?.x ?? 0;
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.3);
    expect(self(connection)?.x).toBeGreaterThan(x);
  });

  it("is back in its seat when only it saw the drop, and the host still holds it there", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    const token = connection.rejoinToken;

    // The host never sees the guest go, so its rejoin hello comes from a
    // peer the host still has seated.
    match.network.blip(transport.selfId, "host");
    await until(() => states.length === 2);

    expect(states).toEqual(["reconnecting", "online"]);
    expect(connection.rejoinToken).not.toBe(token);
    const x = self(connection)?.x ?? 0;
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.3);
    expect(self(connection)?.x).toBeGreaterThan(x);
  });

  /**
   * A guest whose page stalled past the transport's timeout (#3772): the
   * host dropped its seat, the guest saw nothing, and is heard again
   * `seconds` later.
   */
  async function stalled(seconds: number) {
    const match = startMatch();
    const watcher = await match.joinLocal();
    const { connection, transport } = await match.join();
    // Teammates on both sides, so the match outlives the dropped seat.
    await match.join();
    await match.join();
    await match.step(0.05);
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    const hellos: unknown[] = [];
    match.hostTransport.on("hello", (data) => hellos.push(data));
    match.network.stall("host", transport.selfId);
    await match.step(seconds);
    match.network.wake("host", transport.selfId);
    await settle();
    return { match, watcher, connection, states, hellos };
  }

  it("is told the host dropped it, and is back in its seat within the window (#3772)", async () => {
    const { match, watcher, connection, states, hellos } = await stalled(10);
    await until(() => states.length === 2);

    expect(states).toEqual(["reconnecting", "online"]);
    expect(hellos).toEqual([
      expect.objectContaining({ rejoin: { playerId: connection.selfSessionId } }),
    ]);
    expect(watcher.getSnapshot().players.map(({ sessionId }) => sessionId)).toContain(
      connection.selfSessionId,
    );
    const x = self(connection)?.x ?? 0;
    connection.sendIntent({ kind: "move", dirX: 1, dirY: 0 });
    await match.step(0.3);
    expect(self(connection)?.x).toBeGreaterThan(x);
  });

  it("is lost, asking nothing, when the host dropped it and the window ran out (#3772)", async () => {
    const { states, hellos } = await stalled(RECONNECT_WINDOW_SECONDS + 1);

    expect(states).toEqual(["lost"]);
    expect(hellos).toEqual([]);
  });

  it("hears nothing when the host never dropped it (#3772)", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    await match.step(0.05);
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    const told: unknown[] = [];
    transport.on("seat-dropped", (data) => told.push(data));

    match.network.wake("host", transport.selfId);
    await match.step(0.3);

    expect(told).toEqual([]);
    expect(states).toEqual([]);
  });

  it("is lost once the window runs out, and asks nothing when the host is back after it", async () => {
    const { match, states, hellos } = await dropped();

    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(states).toEqual(["reconnecting"]);
    vi.advanceTimersByTime(1);
    expect(states).toEqual(["reconnecting", "lost"]);

    match.network.heal();
    await settle();
    expect(hellos).toEqual([]);
    expect(states).toEqual(["reconnecting", "lost"]);
  });

  it("measures the window on the clock, so a timer firing late does not stretch it", async () => {
    const { match, states, hellos } = await dropped();

    // A hidden tab: 31 s have passed, and the timer has not run.
    vi.setSystemTime(Date.now() + WINDOW_MS + 1000);
    match.network.heal();
    await settle();

    expect(hellos).toEqual([]);
    expect(states).toEqual(["reconnecting", "lost"]);
  });

  it("is lost when the host turns the rejoin away because the match is over", async () => {
    const match = startMatch({
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds: 0.5 },
    });
    const { states } = await dropped(match);

    await match.step(1);
    match.network.heal();
    await settle();

    expect(states).toEqual(["reconnecting", "lost"]);
  });

  it("gets its own window for each drop", async () => {
    const { match, transport, states } = await dropped();
    match.network.heal();
    await until(() => states.length === 2);
    vi.advanceTimersByTime(WINDOW_MS - 1000);

    match.network.partition("host", transport.selfId);
    await settle();
    vi.advanceTimersByTime(WINDOW_MS - 1000);
    expect(states).toEqual(["reconnecting", "online", "reconnecting"]);
    // The second rejoin proves the token the first one's welcome issued.
    match.network.heal();
    await until(() => states.length === 4);
    expect(states).toEqual(["reconnecting", "online", "reconnecting", "online"]);
  });

  it("leaves while reconnecting without waiting for the window", async () => {
    const { connection, states } = await dropped();

    await connection.disconnect();
    vi.advanceTimersByTime(WINDOW_MS);

    expect(states).toEqual(["reconnecting"]);
  });
});

describe("connectMatch, before the host's match listens (#1805)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A guest saying hello to the host's peer, whose match is not up yet, and how often it has. */
  async function early() {
    const network = createMemoryNetwork();
    const hostTransport = network.join("host");
    const transport = network.join();
    await settle();
    const sent = vi.spyOn(transport, "send");
    const joining = connectMatch({
      transport,
      hostId: "host",
      hello: hello(),
      timeoutMs: 10_000,
      replays: null,
    });
    const hellos = (): number => sent.mock.calls.filter(([type]) => type === "hello").length;
    return { hostTransport, joining, hellos };
  }

  /** The host's match, up on `transport` at last. */
  function listen(transport: Transport, timeLimitSeconds = 300) {
    return createMatchHost({
      transport,
      map: ARENA,
      seed: "test",
      matchRules: { ...ANNIHILATION_MATCH_RULES, timeLimitSeconds },
      random: () => 0.5,
      maxPlayers: 8,
      seats: null,
      matchId: TEST_MATCH_ID,
      isSpectator: () => false,
      mode: "random-arena",
      publishRecord: () => undefined,
      nowSeconds: () => 0,
      signetOf: testSignet,
      recordReplay: false,
      preMatch: null,
    });
  }

  it("is seated by a host that listens 3 s after its hello, and says it no more", async () => {
    const { hostTransport, joining, hellos } = await early();
    await vi.advanceTimersByTimeAsync(3000);
    listen(hostTransport);
    await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS);
    const connection = await joining;
    expect(connection.selfSessionId).not.toBe("");
    const said = hellos();
    expect(said).toBe(5);
    await vi.advanceTimersByTimeAsync(5 * HELLO_RESEND_MS);
    expect(hellos()).toBe(said);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says it no more once refused", async () => {
    const { hostTransport, joining, hellos } = await early();
    const host = listen(hostTransport, 0.1);
    host.advance(0.2);
    expect(host.phase).toBe("finished");
    const refused = expect(joining).rejects.toMatchObject({ reason: "match-over" });
    await vi.advanceTimersByTimeAsync(HELLO_RESEND_MS);
    await refused;
    const said = hellos();
    await vi.advanceTimersByTimeAsync(5 * HELLO_RESEND_MS);
    expect(hellos()).toBe(said);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("says it until the timeout, and no more after", async () => {
    const { joining, hellos } = await early();
    const timedOut = expect(joining).rejects.toThrow(MatchTimeoutError);
    await vi.advanceTimersByTimeAsync(10_000);
    await timedOut;
    const said = hellos();
    expect(said).toBeGreaterThanOrEqual(10);
    await vi.advanceTimersByTimeAsync(5 * HELLO_RESEND_MS);
    expect(hellos()).toBe(said);
    expect(vi.getTimerCount()).toBe(0);
  });
});
