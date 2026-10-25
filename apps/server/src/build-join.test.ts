import { Client, type Room } from "@colyseus/sdk";
import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  defaultBuildEquipment,
  validatePlayerBuild,
  type PlayerBuild,
} from "@vibewars/game-core";
import { PROTOCOL_VERSION, ROOM_MATCH } from "@vibewars/game-protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_SKILL_BAR } from "./rooms/match-room.js";
import { createGameServer, type GameServer } from "./server.js";
import { LOOPBACK_LIMITS, findFreePort, waitFor } from "./testing/harness.js";
import { DEFAULT_MAX_ROOMS } from "./config.js";

/**
 * Bringing a build into a match (brief §17, §32).
 *
 * The client *requests* a build; the server decides. These tests are
 * mostly about the second half of that sentence: every lever a build
 * gives a player — which skills they can cast, and the attribute ranks
 * that scale them — is something a hostile client would love to set
 * freely, so each one is checked from the outside.
 */

interface SkillSlot {
  readonly id: string;
  readonly name: string;
}

interface PlayerView {
  readonly name: string;
  readonly health: number;
  readonly x: number;
  readonly y: number;
  readonly targetSessionId: string;
  readonly offhandId: string;
  readonly primaryProfession: string;
  readonly secondaryProfession: string;
  readonly energy: number;
  readonly maxEnergy: number;
  readonly castingSkillId: string;
}

interface MatchView {
  readonly players: { get: (id: string) => PlayerView | undefined };
}

/** `count` empty slots. */
const nulls = (count: number): null[] => Array.from({ length: count }, () => null);

/** A legal elementalist/monk: both professions' attributes, both their skills. */
const LEGAL_BUILD: PlayerBuild = {
  name: "Flame Caller",
  primaryProfession: "elementalist",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "elementalist.fire-magic", rank: 12 },
    { attributeId: "elementalist.energy-storage", rank: 10 },
    { attributeId: "monk.healing-prayers", rank: 8 },
  ],
  skillBar: [
    "elementalist.fireball",
    "elementalist.armor-of-earth",
    "monk.orison-of-healing",
    null,
    null,
    null,
    null,
    null,
  ],
  equipment: defaultBuildEquipment("elementalist"),
};

/** A legal warrior with the house sword and shield. */
const SHIELD_BUILD: PlayerBuild = {
  name: "Shield Wall",
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 9 }],
  skillBar: ["warrior.swift-chop", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("warrior"),
};

describe("joining with a build", () => {
  let server: GameServer;
  let endpoint: string;

  beforeAll(async () => {
    const port = await findFreePort();
    endpoint = `ws://127.0.0.1:${String(port)}`;
    server = createGameServer({
      port,
      host: "127.0.0.1",
      webRoot: undefined,
      devMode: false,
      maxRooms: DEFAULT_MAX_ROOMS,
      ...LOOPBACK_LIMITS,
    });
    await server.listen(port);
  });

  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  /** Join and return the skill bar the server actually granted. */
  const joinWith = async (
    build: unknown,
    name?: string,
  ): Promise<{ room: Room<unknown, MatchView>; slots: (SkillSlot | null)[] }> => {
    const room = await new Client(endpoint).joinOrCreate<MatchView>(ROOM_MATCH, {
      protocolVersion: PROTOCOL_VERSION,
      ...(build === undefined ? {} : { build }),
      ...(name === undefined ? {} : { name }),
    });
    const slots = await new Promise<(SkillSlot | null)[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("no skill-bar message"));
      }, 5000);
      room.onMessage("skill-bar", (message: { slots: (SkillSlot | null)[] }) => {
        clearTimeout(timer);
        resolve(message.slots);
      });
    });
    await waitFor(() => room.state.players.get(room.sessionId) !== undefined, {
      label: "own player in state",
    });
    return { room, slots };
  };

  it("sanity-checks that the fixture build is actually legal", () => {
    // If this fixture drifted into being invalid, every test below would
    // pass for the wrong reason — the server would refuse it and hand
    // back the house loadout.
    expect(validatePlayerBuild(LEGAL_BUILD, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
    expect(validatePlayerBuild(SHIELD_BUILD, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
  });

  it("shows the off-hand the resolved build holds, and none for none (#276)", async () => {
    const shield = await joinWith(SHIELD_BUILD);
    expect(shield.room.state.players.get(shield.room.sessionId)?.offhandId).toBe("shield");
    await shield.room.leave(true);

    const empty = await joinWith({
      ...LEGAL_BUILD,
      equipment: { ...LEGAL_BUILD.equipment, offHand: null },
    });
    expect(empty.room.state.players.get(empty.room.sessionId)?.offhandId).toBe("");
    await empty.room.leave(true);
  });

  it("grants the requested skills when the build is legal", async () => {
    const { room, slots } = await joinWith(LEGAL_BUILD);

    expect(slots.map((s) => s?.id ?? null)).toEqual([
      "elementalist.fireball",
      "elementalist.armor-of-earth",
      "monk.orison-of-healing",
      null,
      null,
      null,
      null,
      null,
    ]);

    await room.leave(true);
  });

  it("keeps a gap in the bar: the empty slot casts nothing, the next its own skill (#347)", async () => {
    const gap = { ...LEGAL_BUILD, skillBar: [null, "elementalist.armor-of-earth", ...nulls(6)] };
    const { room, slots } = await joinWith(gap);
    expect(slots.map((s) => s?.id ?? null)).toEqual([
      null,
      "elementalist.armor-of-earth",
      ...nulls(6),
    ]);
    const self = () => room.state.players.get(room.sessionId);
    await waitFor(() => self()?.maxEnergy !== 0, { label: "energy in state" });
    const full = self()?.maxEnergy;
    let refusals = 0;
    room.onMessage("cast-refused", () => {
      refusals += 1;
    });

    room.send("intent", { kind: "use-skill", slot: 0 });
    // Long enough for the server to have acted on it, had it anything to do.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(self()?.castingSkillId).toBe("");
    expect(self()?.energy).toBe(full);
    expect(refusals).toBe(0);

    // Armor of Earth costs energy, so the next slot casting is visible.
    room.send("intent", { kind: "use-skill", slot: 1 });
    await waitFor(() => (self()?.energy ?? 0) < (full ?? 0), { label: "Armor of Earth cast" });

    await room.leave(true);
  });

  it("shows the professions the server resolved, and the house loadout's for a broken build (#281)", async () => {
    const legal = await joinWith(LEGAL_BUILD);
    const player = legal.room.state.players.get(legal.room.sessionId);
    expect(player?.primaryProfession).toBe("elementalist");
    expect(player?.secondaryProfession).toBe("monk");
    await legal.room.leave(true);

    // A claim the server refused is never what the arena shows.
    const broken = await joinWith({ ...LEGAL_BUILD, primaryProfession: "bogus" });
    const house = broken.room.state.players.get(broken.room.sessionId);
    expect(house?.primaryProfession).toBe("warrior");
    expect(house?.secondaryProfession).toBe("");
    await broken.room.leave(true);
  });

  it("names the player what they asked to be called, not after their build", async () => {
    const { room } = await joinWith(LEGAL_BUILD, "Ellie");

    // #53: the build is what you play, the name is who you are.
    expect(room.state.players.get(room.sessionId)?.name).toBe("Ellie");

    await room.leave(true);
  });

  it("gives a nameless player a placeholder, and sanitises a hostile one", async () => {
    const nameless = await joinWith(LEGAL_BUILD);
    expect(nameless.room.state.players.get(nameless.room.sessionId)?.name).toMatch(/^player-/);
    await nameless.room.leave(true);

    const hostile = await joinWith(LEGAL_BUILD, `\u0000${"x".repeat(100)}`);
    const name = hostile.room.state.players.get(hostile.room.sessionId)?.name ?? "";
    expect(name).not.toContain("\u0000");
    expect(name.length).toBeLessThanOrEqual(16);
    await hostile.room.leave(true);
  });

  it("falls back to the house loadout when no build is sent", async () => {
    const { room, slots } = await joinWith(undefined);

    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);
    expect(slots.map((s) => s?.id ?? null)).toContain("elementalist.fireball");

    await room.leave(true);
  });

  it("treats a build with no equipment as invalid, not old", async () => {
    // Absent gear is malformed (ADR-0016): it takes the same invalid-build
    // path as any other broken build, rather than being given a default.
    const { equipment: _dropped, ...withoutGear } = LEGAL_BUILD;
    const { room, slots } = await joinWith(withoutGear);

    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);

    await room.leave(true);
  });

  it("refuses a build whose skills its professions cannot access", async () => {
    // The whole point of professions: a warrior may not cast Fireball.
    const cheat = {
      ...LEGAL_BUILD,
      name: "Cheater",
      primaryProfession: "warrior",
      secondaryProfession: null,
      attributes: [],
    };
    const { room, slots } = await joinWith(cheat);

    expect(slots.map((s) => s?.id ?? null)).not.toEqual(["elementalist.fireball"]);
    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);

    await room.leave(true);
  });

  it("refuses a build that overspends the attribute budget", async () => {
    // Attribute ranks scale every skill's magnitude, so an unbounded
    // allocation is a damage multiplier.
    const cheat = {
      ...LEGAL_BUILD,
      name: "Overspender",
      attributes: [
        { attributeId: "elementalist.fire-magic", rank: 20 },
        { attributeId: "elementalist.energy-storage", rank: 20 },
        { attributeId: "monk.healing-prayers", rank: 20 },
      ],
    };
    const { room, slots } = await joinWith(cheat);

    // Refused: the house loadout's full bar, not the build's.
    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);

    await room.leave(true);
  });

  it("refuses a build claiming another profession's primary attribute", async () => {
    // Divine Favor via a monk *secondary* is the exact rule the character
    // model exists to enforce.
    const cheat = {
      ...LEGAL_BUILD,
      name: "Divine Thief",
      attributes: [{ attributeId: "monk.divine-favor", rank: 12 }],
    };
    const { room, slots } = await joinWith(cheat);

    // Refused: the house loadout's full bar, not the build's.
    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);

    await room.leave(true);
  });

  it("refuses an unimplemented skill rather than granting a blank slot", async () => {
    const cheat = {
      ...LEGAL_BUILD,
      name: "Meteor Dreamer",
      skillBar: ["elementalist.meteor-shower", null, null, null, null, null, null, null],
    };
    const { room, slots } = await joinWith(cheat);

    // Refused: the house loadout's full bar, not the build's.
    expect(slots.map((s) => s?.id ?? null)).toEqual(DEFAULT_SKILL_BAR);

    await room.leave(true);
  });

  it("survives a hostile build payload and still seats the player", async () => {
    const hostile: unknown[] = [
      null,
      42,
      "a string",
      [],
      {},
      { name: "x" },
      { ...LEGAL_BUILD, attributes: null },
      { ...LEGAL_BUILD, attributes: [{ attributeId: "elementalist.fire-magic", rank: 1.5 }] },
      { ...LEGAL_BUILD, skillBar: null },
      { ...LEGAL_BUILD, skillBar: [] },
      { ...LEGAL_BUILD, primaryProfession: "dragonlord" },
      { ...LEGAL_BUILD, name: 7 },
    ];

    for (const build of hostile) {
      const { room, slots } = await joinWith(build);
      // Seated, alive, and playable — never dropped and never crashed.
      expect(room.state.players.get(room.sessionId)?.health).toBeGreaterThan(0);
      expect(slots.length).toBeGreaterThan(0);
      await room.leave(true);
    }
  });

  /**
   * The payoff test: does a build's attribute ranks actually change what
   * happens in a fight?
   *
   * Everything above proves the server *accepts* or *refuses* a build.
   * This proves an accepted one is genuinely wired into the simulation —
   * without it, builds could be validated, stored, displayed, and still
   * have no effect on a single point of damage.
   */
  // Game time: two ranks × (two 4 s walks + an 8 s Fireball wait + joins) ≈ 34 s worst case.
  it("scales damage by the attribute ranks the build asked for", async () => {
    const fireballOnly = (rank: number): PlayerBuild => ({
      name: `Fire ${String(rank)}`,
      primaryProfession: "elementalist",
      secondaryProfession: undefined,
      attributes: [{ attributeId: "elementalist.fire-magic", rank }],
      skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
      equipment: defaultBuildEquipment("elementalist"),
    });

    const damageAtRank = async (rank: number): Promise<number> => {
      const attacker = await new Client(endpoint).joinOrCreate<MatchView>(ROOM_MATCH, {
        protocolVersion: PROTOCOL_VERSION,
        build: fireballOnly(rank),
      });
      const victim = await new Client(endpoint).joinById<MatchView>(attacker.roomId, {
        protocolVersion: PROTOCOL_VERSION,
      });
      await waitFor(() => attacker.state.players.get(victim.sessionId) !== undefined, {
        label: "victim present",
      });

      // Walk into range via the corridor; arena-alpha has a dividing wall.
      const walk = async (room: Room<unknown, MatchView>, x: number, y: number) => {
        for (let i = 0; i < 80; i += 1) {
          const me = room.state.players.get(room.sessionId);
          if (me === undefined) return;
          const dx = x - me.x;
          const dy = y - me.y;
          const length = Math.hypot(dx, dy);
          if (length <= 12) return;
          room.send("intent", { kind: "move", dirX: dx / length, dirY: dy / length });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };
      // The two clients steer independently, so they walk at once.
      await Promise.all([walk(attacker, 500, 320), walk(victim, 540, 320)]);
      attacker.send("intent", { kind: "stop" });
      victim.send("intent", { kind: "stop" });

      attacker.send("intent", { kind: "target", targetSessionId: victim.sessionId });
      await waitFor(
        () => attacker.state.players.get(attacker.sessionId)?.targetSessionId === victim.sessionId,
        { label: "target applied" },
      );

      const before = attacker.state.players.get(victim.sessionId)?.health ?? 0;
      attacker.send("intent", { kind: "use-skill", slot: 0 });
      await waitFor(() => (attacker.state.players.get(victim.sessionId)?.health ?? 0) < before, {
        timeoutMs: 8000,
        label: "the fireball to land",
      });
      const after = attacker.state.players.get(victim.sessionId)?.health ?? 0;

      await attacker.leave(true);
      await victim.leave(true);
      return before - after;
    };

    const weak = await damageAtRank(0);
    const strong = await damageAtRank(12);

    expect(weak).toBeGreaterThan(0);
    // Rank 12 Fire Magic must hit materially harder than rank 0. The
    // exact figures are pinned in game-core's scaling tests; what is
    // asserted here is only that the build reached the simulation.
    expect(strong).toBeGreaterThan(weak);
  }, 40_000);
});
