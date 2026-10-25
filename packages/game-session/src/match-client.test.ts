import { DEFAULT_MATCH_RULES } from "@vibewars/game-core";
import { MAX_WIRE_SLOTS, type WirePlayer } from "@vibewars/game-protocol";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  HostLeftError,
  MatchRefusedError,
  MatchTimeoutError,
  connectMatch,
} from "./match-client.js";
import type { PlayerSnapshot } from "./match-connection.js";
import { MATCH_FULL_MESSAGE, MATCH_OVER_MESSAGE } from "./match-host.js";
import { hello, self, settle, startMatch } from "./match-harness.test-support.js";
import { createMemoryNetwork } from "./memory-transport.js";
import { playerSnapshot } from "./wire.js";

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
      players: [],
      projectiles: [],
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
        players: [],
        projectiles: [],
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

  it("is lost when the host's peer goes, without a word", async () => {
    const match = startMatch();
    const { connection, transport } = await match.join();
    const states: string[] = [];
    connection.onConnectionChange((state) => states.push(state));
    match.network.partition("host", transport.selfId);
    await settle();
    expect(states).toEqual(["lost"]);
  });

  it("shows the result once the match ends", async () => {
    const match = startMatch({ matchRules: { ...DEFAULT_MATCH_RULES, timeLimitSeconds: 0.1 } });
    const { connection } = await match.join();
    await match.step(0.2);
    const snapshot = connection.getSnapshot();
    expect(snapshot.phase).toBe("finished");
    expect(snapshot.endReason).toBe("time");
  });

  it("counts recharges down on the match clock, with no wall time", async () => {
    const match = startMatch();
    const { connection } = await match.join();
    const { connection: foe } = await match.join();
    await match.step(0.05);
    // The house bar's Armor of Earth is a self-buff: castable at once.
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
    const local = await match.joinLocal();
    const { connection: remote } = await match.join();
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
    adrenaline: "adrenaline",
    armor: "armor",
    weaponId: "weaponId",
    offhandId: "offhandId",
    primaryProfession: "primaryProfession",
    secondaryProfession: "secondaryProfession",
    dead: "dead",
    castingSkillId: "castingSkillId",
    castRemaining: "castRemaining",
    castTotal: "castTotal",
    statuses: "statuses",
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
      adrenaline: 2,
      armor: 60,
      weaponId: "staff",
      offhandId: null,
      primaryProfession: "monk",
      secondaryProfession: "no-such-profession",
      dead: false,
      castingSkillId: null,
      castRemaining: 0,
      castTotal: 0,
      statuses: ["burning"],
    };
    const snapshot = playerSnapshot(wire);
    for (const [wireKey, snapshotKey] of Object.entries(FIELDS)) {
      const sent = wire[wireKey as keyof WirePlayer];
      const got = snapshot[snapshotKey];
      // A profession this client does not know draws as none, as the server's does.
      const expected = wireKey === "secondaryProfession" ? undefined : (sent ?? undefined);
      expect(got, wireKey).toEqual(expected);
    }
  });
});
