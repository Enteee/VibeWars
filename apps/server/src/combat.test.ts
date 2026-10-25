import { Client } from "@colyseus/sdk";
import { defaultBuildEquipment } from "@vibewars/game-core";
import { PROTOCOL_VERSION, ROOM_MATCH, type CastRefusedMessage } from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_SKILL_BAR } from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { LOOPBACK_LIMITS, findFreePort, waitFor } from "./testing/harness.js";
import { DEFAULT_MAX_ROOMS } from "./config.js";

/**
 * End-to-end combat over a real WebSocket (brief §20's full loop, minus
 * the lobby that arrives in Sprint 19).
 *
 * These are the tests that prove the skill engine is actually *wired in*
 * rather than merely present in `game-core`: real clients, real intents,
 * real authoritative state coming back.
 */

/** For a test that waits on walking and swinging in real game time. */
const GAME_TIME = { timeout: 20_000 };

describe("networked combat", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
      ...LOOPBACK_LIMITS,
    });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  /**
   * Join two clients into the same room.
   *
   * Waits for *both specific sessions* rather than for a player count:
   * `joinOrCreate` can land in a room left over from an earlier test that
   * has not finished disposing, so an exact-count assertion here is
   * flaky by construction.
   */
  async function joinPair() {
    const clientA = new Client(endpoint);
    const clientB = new Client(endpoint);
    const roomA = await clientA.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    const roomB = await clientB.joinById(roomA.roomId, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(
      () => roomA.state.players.has(roomA.sessionId) && roomA.state.players.has(roomB.sessionId),
      { label: "both players" },
    );
    return { roomA, roomB };
  }

  /**
   * `arena-alpha` is a chokepoint arena: a wall splits it at x≈440-464
   * with a corridor between y=260 and y=380. Teams spawn on opposite
   * sides, so walking straight at an enemy pins you against that wall —
   * correct map behaviour, and exactly why a test cannot just aim at the
   * target and hope.
   *
   * Routing via the corridor is what a player does, and keeping the
   * tests on the same movement rules as real play is deliberate: a
   * teleport-for-tests back door could let combat tests pass in
   * positions the game would never actually allow.
   */
  const CORRIDOR = { x: 500, y: 320 };

  /** Walk toward a point until within `tolerance`, or until `budgetMs` runs out. */
  async function walkTo(
    room: Awaited<ReturnType<typeof joinPair>>["roomA"],
    point: { x: number; y: number },
    tolerance: number,
    budgetMs: number,
  ): Promise<void> {
    const deadline = Date.now() + budgetMs;
    for (;;) {
      const me = room.state.players.get(room.sessionId);
      if (me === undefined) {
        return;
      }
      const dx = point.x - me.x;
      const dy = point.y - me.y;
      const length = Math.hypot(dx, dy);
      if (length <= tolerance || Date.now() > deadline) {
        return;
      }
      room.send("intent", { kind: "move", dirX: dx / length, dirY: dy / length });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Move `room`'s player within `range` of `targetSessionId`, routing round walls. */
  async function closeDistance(
    room: Awaited<ReturnType<typeof joinPair>>["roomA"],
    targetSessionId: string,
    range: number,
  ): Promise<void> {
    const them = room.state.players.get(targetSessionId);
    const me = room.state.players.get(room.sessionId);
    if (me === undefined || them === undefined) {
      return;
    }

    // Cross to the enemy's side of the chokepoint only if we are not
    // already on it.
    const onOppositeSides = me.x < CORRIDOR.x !== them.x < CORRIDOR.x;
    if (onOppositeSides) {
      await walkTo(room, CORRIDOR, 30, 8000);
    }

    const deadline = Date.now() + 10_000;
    for (;;) {
      const self = room.state.players.get(room.sessionId);
      const target = room.state.players.get(targetSessionId);
      if (self === undefined || target === undefined || Date.now() > deadline) {
        break;
      }
      if (Math.hypot(self.x - target.x, self.y - target.y) <= range) {
        break;
      }
      await walkTo(room, { x: target.x, y: target.y }, range * 0.8, 1000);
    }

    room.send("intent", { kind: "stop" });
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  it("spawns players with full health and energy", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => (room.state.players.get(room.sessionId)?.maxHealth ?? 0) > 0, {
      label: "stats to sync",
    });

    const me = room.state.players.get(room.sessionId);
    expect(me?.health).toBe(me?.maxHealth);
    expect(me?.energy).toBe(me?.maxEnergy);
    expect(me?.dead).toBe(false);

    await room.leave();
  });

  it("sends the skill bar on join, so the client can render it", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });

    const bar = await new Promise<{ slots: { id: string; name: string }[] }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("no skill-bar message"));
      }, 4000);
      room.onMessage("skill-bar", (message: { slots: { id: string; name: string }[] }) => {
        clearTimeout(timer);
        resolve(message);
      });
    });

    expect(bar.slots).toHaveLength(DEFAULT_SKILL_BAR.length);
    expect(bar.slots[0]?.id).toBe(DEFAULT_SKILL_BAR[0]);
    expect(bar.slots[0]?.name.length).toBeGreaterThan(0);

    await room.leave();
  });

  it("puts joining players on alternating teams so a 1v1 is adversarial", async () => {
    const { roomA, roomB } = await joinPair();
    const a = roomA.state.players.get(roomA.sessionId);
    const b = roomA.state.players.get(roomB.sessionId);
    expect(a?.team).not.toBe(b?.team);
    await roomA.leave();
    await roomB.leave();
  });

  /** Collect every "cast-refused" message `room` receives. */
  function refusals(room: Awaited<ReturnType<typeof joinPair>>["roomA"]): CastRefusedMessage[] {
    const seen: CastRefusedMessage[] = [];
    room.onMessage("cast-refused", (message: CastRefusedMessage) => {
      seen.push(message);
    });
    return seen;
  }

  it("tells only the caster why a cast was refused", async () => {
    const { roomA, roomB } = await joinPair();
    const toA = refusals(roomA);
    const toB = refusals(roomB);
    const fireballSlot = DEFAULT_SKILL_BAR.indexOf("elementalist.fireball");

    // Nobody targeted yet: the nearest enemy is picked, and shown, but
    // the teams spawn far beyond spell range.
    roomA.send("intent", { kind: "use-skill", slot: fireballSlot });
    await waitFor(() => toA.length === 1, { label: "the first refusal" });
    expect(toA[0]).toEqual({
      kind: "skill",
      slot: fireballSlot,
      skillId: "elementalist.fireball",
      reason: "out-of-range",
    });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "the auto-target" },
    );

    // Fireball at yourself.
    roomA.send("intent", { kind: "target", targetSessionId: roomA.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomA.sessionId,
      { label: "the self-target" },
    );
    roomA.send("intent", { kind: "use-skill", slot: fireballSlot });
    await waitFor(() => toA.length === 2, { label: "the second refusal" });
    expect(toA[1]?.reason).toBe("invalid-target-self");

    // Nothing was cast, and the opponent heard nothing.
    expect(roomA.state.players.get(roomA.sessionId)?.castingSkillId).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(toB).toEqual([]);

    await roomA.leave();
    await roomB.leave();
  });

  it("damages an enemy when a damage skill is cast at them", async () => {
    const { roomA, roomB } = await joinPair();

    // Move A next to B so range cannot be the reason a cast fails.
    await closeDistance(roomA, roomB.sessionId, 300);
    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target applied" },
    );

    const fireballSlot = DEFAULT_SKILL_BAR.indexOf("elementalist.fireball");
    roomA.send("intent", { kind: "use-skill", slot: fireballSlot });

    await waitFor(() => (roomA.state.players.get(roomB.sessionId)?.health ?? 500) < 500, {
      timeoutMs: 6000,
      label: "target to take damage",
    });

    const victim = roomA.state.players.get(roomB.sessionId);
    expect(victim?.health).toBeLessThan(500);
    // Fire Magic 12 -> 91 before mitigation. The house loadout is a
    // warrior (80 base armor) carrying a shield whose Strength
    // requirement it does not meet (+8, not +16), so armor is 88 and the
    // curve gives 91 * 2^((60 - 88) / 40) = 56.
    //
    // Spelled out rather than computed from the ruleset here on purpose:
    // deriving it would test the formula against itself, while a number
    // with its derivation written next to it fails loudly if either the
    // curve or the house loadout changes.
    expect(victim?.health).toBe(500 - 56);

    await roomA.leave();
    await roomB.leave();
  });

  it("deducts energy when a skill is cast", async () => {
    const { roomA, roomB } = await joinPair();
    await closeDistance(roomA, roomB.sessionId, 300);
    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target applied" },
    );

    const before = roomA.state.players.get(roomA.sessionId)?.energy ?? 0;
    roomA.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.fireball"),
    });
    await waitFor(() => (roomA.state.players.get(roomA.sessionId)?.energy ?? 0) < before, {
      timeoutMs: 4000,
      label: "energy to be spent",
    });

    expect(roomA.state.players.get(roomA.sessionId)?.energy).toBeLessThan(before);

    await roomA.leave();
    await roomB.leave();
  });

  it("exposes cast progress so a client can draw a cast bar", async () => {
    const { roomA, roomB } = await joinPair();
    await closeDistance(roomA, roomB.sessionId, 300);
    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target applied" },
    );

    // Troll Unguent has a 3s cast — long enough to observe mid-cast.
    roomA.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("ranger.troll-unguent"),
    });

    await waitFor(() => (roomA.state.players.get(roomA.sessionId)?.castingSkillId ?? "") !== "", {
      timeoutMs: 4000,
      label: "cast to start",
    });

    const me = roomA.state.players.get(roomA.sessionId);
    expect(me?.castingSkillId).toBe("ranger.troll-unguent");
    expect(me?.castRemaining).toBeGreaterThan(0);
    expect(me?.castTotal).toBe(3);

    await roomA.leave();
    await roomB.leave();
  });

  it("doubles a dazed player's cast, and syncs the doubled total for the cast bar", async () => {
    const { roomA, roomB } = await joinPair();
    await closeDistance(roomA, roomB.sessionId, 300);
    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target applied" },
    );

    // Broad Head Arrow dazes whoever it hits.
    roomA.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("ranger.broad-head-arrow"),
    });
    await waitFor(
      () => [...(roomB.state.players.get(roomB.sessionId)?.statuses ?? [])].includes("dazed"),
      {
        timeoutMs: 6000,
        label: "b dazed",
      },
    );

    roomB.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("ranger.troll-unguent"),
    });
    await waitFor(() => (roomB.state.players.get(roomB.sessionId)?.castingSkillId ?? "") !== "", {
      timeoutMs: 4000,
      label: "b's cast to start",
    });

    const me = roomB.state.players.get(roomB.sessionId);
    expect(me?.castingSkillId).toBe("ranger.troll-unguent");
    expect(me?.castTotal).toBe(6);
    expect(me?.castRemaining).toBeGreaterThan(3);

    await roomA.leave();
    await roomB.leave();
  }, 20_000);

  /** Every `combat` message `room` hears, as it arrives. */
  function combatMessages(room: Awaited<ReturnType<typeof joinPair>>["roomA"]) {
    const heard: {
      casterSessionId: string;
      cause: string;
      skillId: string;
      events: { kind: string; targetId?: string }[];
    }[] = [];
    room.onMessage("combat", (message: (typeof heard)[number]) => {
      heard.push(message);
    });
    return heard;
  }

  // Real game time, not a slow test: the two walk up to 800 units apart
  // at 180 a second (4.5 s), then wait out a swing (1.75 s) and more. The
  // default 5 s cannot hold that; 20 s does, with room for a busy runner.
  it(
    "attacks with the weapon: shown to everyone, hits as cause weapon, cancel ends it",
    GAME_TIME,
    async () => {
      const { roomA, roomB } = await joinPair();
      const heard = combatMessages(roomB);
      await closeDistance(roomA, roomB.sessionId, 60);

      roomA.send("intent", { kind: "attack", targetId: roomB.sessionId });
      await waitFor(
        () => roomB.state.players.get(roomA.sessionId)?.attackTargetSessionId === roomB.sessionId,
        { label: "the attack, as B sees it" },
      );
      await waitFor(
        () =>
          heard.some(
            (message) =>
              message.cause === "weapon" &&
              message.casterSessionId === roomA.sessionId &&
              message.skillId === "" &&
              message.events.some((event) => event.kind === "damage"),
          ),
        { timeoutMs: 6000, label: "a weapon hit" },
      );

      roomA.send("intent", { kind: "cancel" });
      await waitFor(() => roomB.state.players.get(roomA.sessionId)?.attackTargetSessionId === "", {
        label: "the attack to end",
      });

      await roomA.leave();
      await roomB.leave();
    },
  );

  it(
    "puts a ranged shot in the shared state while it flies, and takes it out when it lands",
    GAME_TIME,
    async () => {
      // An elementalist's default weapon is a ranged one.
      const caster = await new Client(endpoint).joinOrCreate(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
        build: {
          name: "Shooter",
          primaryProfession: "elementalist",
          secondaryProfession: undefined,
          attributes: [{ attributeId: "elementalist.fire-magic", rank: 9 }],
          skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
          equipment: defaultBuildEquipment("elementalist"),
        },
      });
      const victim = await new Client(endpoint).joinById(caster.roomId, {
        protocolVersion: PROTOCOL_VERSION,
      });
      await waitFor(() => caster.state.players.has(victim.sessionId), { label: "both players" });
      await closeDistance(caster, victim.sessionId, 200);

      caster.send("intent", { kind: "attack", targetId: victim.sessionId });
      await waitFor(() => victim.state.projectiles.length > 0, {
        timeoutMs: 6000,
        label: "a shot in flight",
      });
      const shot = victim.state.projectiles[0];
      const me = victim.state.players.get(caster.sessionId);
      expect(
        Math.hypot((shot?.x0 ?? 0) - (me?.x ?? 0), (shot?.y0 ?? 0) - (me?.y ?? 0)),
      ).toBeLessThan(1);
      expect(shot?.flightSeconds).toBeGreaterThan(0);
      // Who shot it and with what, for the client's tint and sprite (#161).
      expect(shot?.attackerId).toBe(caster.sessionId);
      expect(shot?.weaponId).toBe(defaultBuildEquipment("elementalist").mainHand.weaponId);
      expect(shot?.launchedAt).toBeLessThanOrEqual(victim.state.elapsedSeconds);

      const id = shot?.id;
      await waitFor(
        () => !victim.state.projectiles.some((flying: { id: number }) => flying.id === id),
        {
          label: "the shot to land",
        },
      );

      await caster.leave();
      await victim.leave();
    },
  );

  it("refuses an attack on an ally or on nobody, and tells only the attacker why", async () => {
    const { roomA, roomB } = await joinPair();
    const toA = refusals(roomA);
    roomA.send("intent", { kind: "attack", targetId: roomA.sessionId });
    roomA.send("intent", { kind: "attack", targetId: "nobody" });
    await waitFor(() => toA.length === 2, { label: "two refusals" });
    expect(toA).toEqual([
      { kind: "attack", reason: "invalid-target-self" },
      { kind: "attack", reason: "no-target" },
    ]);
    expect(roomA.state.players.get(roomA.sessionId)?.attackTargetSessionId).toBe("");

    await roomA.leave();
    await roomB.leave();
  });

  it(
    "syncs applied statuses so the client can show condition markers, and ticks them as degeneration",
    GAME_TIME,
    async () => {
      const { roomA, roomB } = await joinPair();
      await closeDistance(roomA, roomB.sessionId, 300);
      roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
      await waitFor(
        () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
        { label: "target applied" },
      );

      // Sever Artery costs adrenaline, which is earned by landing attacks:
      // so swing at them first. This is the adrenaline economy working as
      // designed, not a workaround.
      const heard = combatMessages(roomA);
      roomA.send("intent", { kind: "attack", targetId: roomB.sessionId });
      await waitFor(() => (roomA.state.players.get(roomA.sessionId)?.adrenaline ?? 0) > 0, {
        timeoutMs: 6000,
        label: "adrenaline from landing a hit",
      });

      await closeDistance(roomA, roomB.sessionId, 30);
      roomA.send("intent", {
        kind: "use-skill",
        slot: DEFAULT_SKILL_BAR.indexOf("warrior.sever-artery-lite"),
      });

      await waitFor(() => (roomA.state.players.get(roomB.sessionId)?.statuses.length ?? 0) > 0, {
        timeoutMs: 6000,
        label: "status to appear",
      });

      const victim = roomA.state.players.get(roomB.sessionId);
      expect([...(victim?.statuses ?? [])]).toContain("bleeding");
      // The bleeding ticks as its bearer's, caused by degeneration, no skill.
      await waitFor(
        () =>
          heard.some(
            (message) =>
              message.cause === "degeneration" &&
              message.casterSessionId === roomB.sessionId &&
              message.skillId === "",
          ),
        { label: "a bleeding tick" },
      );

      await roomA.leave();
      await roomB.leave();
    },
  );

  it("broadcasts combat events so clients can show floating numbers", async () => {
    const { roomA, roomB } = await joinPair();
    await closeDistance(roomA, roomB.sessionId, 300);
    roomA.send("intent", { kind: "target", targetSessionId: roomB.sessionId });
    await waitFor(
      () => roomA.state.players.get(roomA.sessionId)?.targetSessionId === roomB.sessionId,
      { label: "target applied" },
    );

    const combat = new Promise<{ cause: string; skillId: string; events: { kind: string }[] }>(
      (resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("no combat event"));
        }, 6000);
        roomA.onMessage(
          "combat",
          (message: { cause: string; skillId: string; events: { kind: string }[] }) => {
            if (message.events.some((e) => e.kind === "damage")) {
              clearTimeout(timer);
              resolve(message);
            }
          },
        );
      },
    );

    roomA.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.fireball"),
    });
    const message = await combat;
    expect(message.events.some((e) => e.kind === "damage")).toBe(true);
    expect(message.cause).toBe("skill");
    expect(message.skillId).toBe("elementalist.fireball");

    await roomA.leave();
    await roomB.leave();
  });

  it("splashes a Fireball over a clustered trio: three damage events from one cast", async () => {
    // Teams alternate by join order: a, b, then an idle ally of a and c,
    // then another and d. b, c and d are the enemy trio.
    const { roomA: a, roomB: b } = await joinPair();
    const others = [];
    for (let i = 0; i < 4; i += 1) {
      const room = await new Client(endpoint).joinById(a.roomId, {
        protocolVersion: PROTOCOL_VERSION,
      });
      others.push(room);
    }
    const [, c, , d] = others;
    if (c === undefined || d === undefined) {
      throw new Error("no trio");
    }
    await waitFor(() => [c, d].every((room) => a.state.players.has(room.sessionId)), {
      label: "the trio",
    });
    expect([b, c, d].map((room) => a.state.players.get(room.sessionId)?.team)).toEqual([1, 1, 1]);

    // Spawns are 120 apart, wider than the 81-unit splash: huddle on b.
    const huddle = a.state.players.get(b.sessionId);
    await Promise.all(
      [c, d].map((room) => walkTo(room, { x: huddle?.x ?? 0, y: huddle?.y ?? 0 }, 45, 6000)),
    );
    for (const room of [c, d]) {
      room.send("intent", { kind: "stop" });
    }

    await closeDistance(a, b.sessionId, 300);
    a.send("intent", { kind: "target", targetSessionId: b.sessionId });
    await waitFor(() => a.state.players.get(a.sessionId)?.targetSessionId === b.sessionId, {
      label: "target applied",
    });

    const splash = new Promise<{
      events: { kind: string; targetId?: string }[];
      area?: { radius: number };
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("no Fireball"));
      }, 6000);
      a.onMessage(
        "combat",
        (message: { skillId: string; events: { kind: string }[]; area?: { radius: number } }) => {
          if (message.skillId === "elementalist.fireball") {
            clearTimeout(timer);
            resolve(message);
          }
        },
      );
    });
    a.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.fireball"),
    });
    const message = await splash;

    const hit = message.events.filter((event) => event.kind === "damage").map((e) => e.targetId);
    expect(new Set(hit)).toEqual(new Set([b.sessionId, c.sessionId, d.sessionId]));
    expect(hit[0]).toBe(b.sessionId);
    expect(message.area?.radius).toBe(81);

    for (const room of [a, b, ...others]) {
      await room.leave();
    }
  }, 40_000);

  it("rejects a skill-slot index outside the bar rather than crashing", async () => {
    const { roomA, roomB } = await joinPair();
    const before = roomA.state.players.get(roomA.sessionId)?.energy ?? 0;

    roomA.send("intent", { kind: "use-skill", slot: 999 });
    roomA.send("intent", { kind: "use-skill", slot: -1 });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Nothing was cast, nothing was spent, and the room is still alive.
    expect(roomA.state.players.get(roomA.sessionId)?.energy).toBeGreaterThanOrEqual(before);
    expect(roomA.state.players.has(roomB.sessionId)).toBe(true);

    await roomA.leave();
    await roomB.leave();
  });

  it("refuses to cast a damage skill with no target selected", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => (room.state.players.get(room.sessionId)?.maxEnergy ?? 0) > 0, {
      label: "stats to sync",
    });

    const before = room.state.players.get(room.sessionId)?.energy ?? 0;
    room.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.fireball"),
    });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Energy regenerates, so assert it never *dropped* by the skill cost.
    expect(room.state.players.get(room.sessionId)?.energy).toBeGreaterThanOrEqual(before);

    await room.leave();
  });

  it("regenerates energy over time", async () => {
    // Uses a self-targeted skill so this test exercises the energy
    // economy without also depending on walking across the arena.
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => (room.state.players.get(room.sessionId)?.maxEnergy ?? 0) > 0, {
      label: "stats to sync",
    });

    room.send("intent", {
      kind: "use-skill",
      slot: DEFAULT_SKILL_BAR.indexOf("elementalist.armor-of-earth"),
    });
    await waitFor(() => (room.state.players.get(room.sessionId)?.energy ?? 50) < 50, {
      timeoutMs: 6000,
      label: "energy spent",
    });

    const spent = room.state.players.get(room.sessionId)?.energy ?? 0;
    await waitFor(() => (room.state.players.get(room.sessionId)?.energy ?? 0) > spent, {
      timeoutMs: 6000,
      label: "energy to regenerate",
    });

    expect(room.state.players.get(room.sessionId)?.energy).toBeGreaterThan(spent);

    await room.leave();
  });
});

describe("match rules over the network", () => {
  let server: GameServer;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
      ...LOOPBACK_LIMITS,
    });
    await server.listen(port, "127.0.0.1");
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  it("starts a match active, scoreless, with a running clock", async () => {
    const client = new Client(endpoint);
    const room = await client.joinOrCreate(ROOM_MATCH, { protocolVersion: PROTOCOL_VERSION });
    await waitFor(() => (room.state.elapsedSeconds ?? 0) > 0, { label: "clock to start" });

    expect(room.state.phase).toBe("active");
    expect(room.state.scoreTeam0).toBe(0);
    expect(room.state.scoreTeam1).toBe(0);
    expect(room.state.winningTeam).toBe(-1);

    await room.leave();
  });
});
