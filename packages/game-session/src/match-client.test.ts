import {
  CREATURE_LOOKS,
  DEFAULT_MATCH_RULES,
  MAX_CREATURES,
  MAX_GROUND_EFFECTS,
} from "@vibewars/game-core";
import {
  CREATURE_LOOKS as WIRE_CREATURE_LOOKS,
  MAX_WIRE_CREATURES,
  MAX_WIRE_GROUND_EFFECTS,
  MAX_WIRE_SLOTS,
  MAX_WIRE_STATUS_INDEX,
  type WirePlayer,
} from "@vibewars/game-protocol";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  connectMatch,
} from "./match-client.js";
import type { PlayerSnapshot } from "./match-connection.js";
import { MATCH_FULL_MESSAGE, MATCH_OVER_MESSAGE, RECONNECT_WINDOW_SECONDS } from "./match-host.js";
import { hello, helloAs, self, settle, startMatch, until } from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
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
    });
    await settle();
    expect(connection.getSnapshot().scoreTeam0).toBe(0);
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
    await expect(full.join()).rejects.toThrow(MATCH_FULL_MESSAGE);

    const over = startMatch({
      matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: 0.1 },
    });
    await over.join();
    await over.step(0.2);
    expect(over.host.phase).toBe("finished");
    const refused = over.join();
    await expect(refused).rejects.toThrow(MATCH_OVER_MESSAGE);
    await expect(refused).rejects.toMatchObject({ reason: "match-over" });
  });

  it("gives up on a host that never answers", async () => {
    const network = createMemoryNetwork();
    network.join("host");
    const transport = network.join();
    await expect(
      connectMatch({ transport, hostId: "host", hello: hello(), timeoutMs: 20 }),
    ).rejects.toThrow(MatchTimeoutError);
  });

  it("fails at once when the host leaves before letting it in", async () => {
    const network = createMemoryNetwork();
    const host = network.join("host");
    const transport = network.join();
    await settle();
    const joining = connectMatch({ transport, hostId: "host", hello: hello(), timeoutMs: 10_000 });
    await host.leave();
    await expect(joining).rejects.toThrow(HostLeftError);
  });

  it("is lost for every client when the host closes the match", async () => {
    const match = startMatch();
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
    const states: string[] = [];
    local.onConnectionChange((state) => states.push(`local:${state}`));
    remote.onConnectionChange((state) => states.push(`remote:${state}`));
    await match.host.close("host-left");
    await settle();
    expect(states.sort()).toEqual(["local:lost", "remote:lost"]);
  });

  it("shows the result once the match ends", async () => {
    const match = startMatch({ matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: 0.1 } });
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
});

describe("WirePlayer and PlayerSnapshot (#375 §2)", () => {
  /** PlayerSnapshot's name for each WirePlayer field. */
  const FIELDS = {
    id: "sessionId",
    name: "name",
    team: "team",
    x: "x",
    y: "y",
    facing: "facing",
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
    healthPips: "healthPips",
    energyPips: "energyPips",
    statuses: "statuses",
    creature: "creature",
  } as const satisfies Record<keyof WirePlayer, keyof PlayerSnapshot>;

  it("have one field for each field of the other", () => {
    // Every WirePlayer key is above (`satisfies`), and every
    // PlayerSnapshot key is one of the names: a field added to either
    // without the other stops this compiling.
    expectTypeOf<(typeof FIELDS)[keyof typeof FIELDS]>().toEqualTypeOf<keyof PlayerSnapshot>();
    expect(new Set(Object.values(FIELDS)).size).toBe(Object.keys(FIELDS).length);
  });

  it("convert field for field, null to undefined", () => {
    const wire: WirePlayer = {
      ...WIRE_PLAYER,
      statuses: [
        { status: statusWireIndex("burning"), endsAt: 7.5, durationSeconds: 3, casterId: "p2" },
      ],
    };
    const snapshot = playerSnapshot(wire);
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

  it("keep a creature's owner and kind (#1052)", () => {
    const creature = {
      ownerId: "p2",
      kind: "minion",
      look: "bone-minion",
      mode: null,
      armedAttack: null,
    } as const;
    expect(playerSnapshot({ ...WIRE_PLAYER, creature })?.creature).toEqual(creature);
  });

  it("keep a pet's armed attack, and draw one it does not know as a pet attack as none (#1167)", () => {
    const pet = { ownerId: "p2", kind: "pet", look: "beast", mode: "fight" } as const;
    const armed = { skillId: "ranger.brutal-strike", endsAt: 12.1 };
    expect(
      playerSnapshot({ ...WIRE_PLAYER, creature: { ...pet, armedAttack: armed } })?.creature
        ?.armedAttack,
    ).toEqual(armed);
    for (const skillId of ["ranger.no-such-skill", "warrior.healing-signet"]) {
      expect(
        playerSnapshot({ ...WIRE_PLAYER, creature: { ...pet, armedAttack: { ...armed, skillId } } })
          ?.creature?.armedAttack,
      ).toBeNull();
    }
  });

  it("hold the wire's creature cap to game-core's (#1052)", () => {
    expect(MAX_WIRE_CREATURES).toBe(MAX_CREATURES);
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
    expect(playerSnapshot({ ...WIRE_PLAYER, statuses: [unknown] })).toBeUndefined();
  });
});

/** A valid player, as a host sends it. */
const WIRE_PLAYER: WirePlayer = {
  id: "p1",
  name: "Mhenlo",
  team: 1,
  x: 1,
  y: 2,
  facing: 0.5,
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
  healthPips: 0,
  energyPips: 0,
  creature: null,
  statuses: [],
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
    const match = startMatch({ matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: 0.5 } });
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
