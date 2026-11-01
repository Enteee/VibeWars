import {
  NO_UPGRADES,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  defaultBuildEquipment,
  validatePlayerBuild,
  type PlayerBuild,
} from "@vibewars/game-core";
import type { CastRefusedMessage } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import type { PeerMatchConnection } from "./match-client.js";
import {
  TICK_SECONDS,
  hello,
  playerIn,
  self,
  startMatch,
  toJson,
} from "./match-harness.test-support.js";

/**
 * Bringing a build into a P2P match (brief §17, §32; #375), ported from
 * the server's `build-join.test.ts`.
 *
 * The peer *requests* a build in `PeerHello.build`; the host decides,
 * through the same `resolveJoinLoadout` the server uses. Every lever a
 * build gives a player is something a hostile peer would love to set
 * freely, so each one is checked from the outside, through a client.
 *
 * Unlike the server, the host does not log a refused build: there is no
 * log to assert on, so only what the player is granted is checked.
 */

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

/** A legal warrior with a sword and shield. */
const SHIELD_BUILD: PlayerBuild = {
  name: "Shield Wall",
  primaryProfession: "warrior",
  secondaryProfession: undefined,
  attributes: [{ attributeId: "warrior.swordsmanship", rank: 9 }],
  skillBar: ["warrior.swift-chop", null, null, null, null, null, null, null],
  equipment: defaultBuildEquipment("warrior"),
};

/**
 * What a refused build plays: the first starter build, as the host's
 * `random` in `joinWith` always says 0 (#852).
 */
const REFUSED_AS = (() => {
  const [first] = STARTER_BUILDS;
  if (first === undefined) {
    throw new Error("no starter builds");
  }
  return first;
})();

/**
 * Join a fresh match as a remote peer with `build` (`null` for none, as a
 * hello always carries the field) and let one snapshot land.
 */
async function joinWith(
  build: unknown,
  name = "Tester",
): Promise<{
  match: ReturnType<typeof startMatch>;
  connection: PeerMatchConnection;
  slots: (string | null)[];
}> {
  const match = startMatch({ random: () => 0 });
  const { connection } = await match.join(hello({ name, build: toJson(build) }));
  await match.step(TICK_SECONDS);
  return { match, connection, slots: connection.skillBar.map((slot) => slot?.id ?? null) };
}

describe("joining a P2P match with a build (#375)", () => {
  it("sanity-checks that the fixture build is actually legal", () => {
    // If this fixture drifted into being invalid, every test below would
    // pass for the wrong reason: the host would refuse it and hand back
    // a starter build.
    expect(validatePlayerBuild(LEGAL_BUILD, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
    expect(validatePlayerBuild(SHIELD_BUILD, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
  });

  it("shows the off-hand the resolved build holds, and none for none (#276)", async () => {
    const shield = await joinWith(SHIELD_BUILD);
    expect(self(shield.connection)?.offhandId).toBe("shield");

    const empty = await joinWith({
      ...LEGAL_BUILD,
      equipment: {
        ...LEGAL_BUILD.equipment,
        weaponSets: [{ ...LEGAL_BUILD.equipment.weaponSets[0], offHand: null }, null, null, null],
      },
    });
    expect(self(empty.connection)).toBeDefined();
    expect(self(empty.connection)?.offhandId).toBeUndefined();
  });

  it("grants the requested skills when the build is legal", async () => {
    const { slots } = await joinWith(LEGAL_BUILD);

    expect(slots).toEqual([
      "elementalist.fireball",
      "elementalist.armor-of-earth",
      "monk.orison-of-healing",
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("hands the client the ranks the host resolved, for its tooltips (#485)", async () => {
    const { connection } = await joinWith(LEGAL_BUILD);
    expect(connection.ranks.get("elementalist.fire-magic")).toBe(12);
    expect(connection.ranks.get("monk.healing-prayers")).toBe(8);

    // A refused build plays, and so describes, a starter build: here the
    // Warrior/Monk: Swordsmanship 12, the head's minor rune and its headgear (#1140),
    // Tactics 9 and Healing Prayers 8.
    const refused = await joinWith({ ...LEGAL_BUILD, skillBar: null });
    expect(REFUSED_AS.name).toBe("Warrior/Monk");
    expect(refused.connection.ranks.get("warrior.swordsmanship")).toBe(14);
    expect(refused.connection.ranks.get("warrior.tactics")).toBe(9);
    expect(refused.connection.ranks.get("monk.healing-prayers")).toBe(8);
    expect(refused.connection.ranks.get("elementalist.fire-magic")).toBeUndefined();
  });

  it("keeps a gap in the bar: the empty slot casts nothing, the next its own skill (#347)", async () => {
    const gap = { ...LEGAL_BUILD, skillBar: [null, "elementalist.armor-of-earth", ...nulls(6)] };
    const { match, connection, slots } = await joinWith(gap);
    expect(slots).toEqual([null, "elementalist.armor-of-earth", ...nulls(6)]);
    const full = self(connection)?.maxEnergy ?? 0;
    expect(full).toBeGreaterThan(0);
    expect(self(connection)?.energy).toBe(full);
    const refusals: CastRefusedMessage[] = [];
    connection.onCastRefused((refusal) => {
      refusals.push(refusal);
    });

    connection.sendIntent({ kind: "use-skill", slot: 0 });
    // Long enough for the host to have acted on it, had it anything to do.
    await match.step(0.3);
    expect(self(connection)?.castingSkillId).toBeUndefined();
    expect(self(connection)?.energy).toBe(full);
    expect(refusals).toEqual([]);

    // Armor of Earth costs energy, so the next slot casting is visible.
    connection.sendIntent({ kind: "use-skill", slot: 1 });
    await match.step(0.3);
    expect(self(connection)?.energy ?? full).toBeLessThan(full);
  });

  it("starts an Elementalist full, at the maximum Energy Storage raised (#532)", async () => {
    // No focus: its Energy Storage requirement would add energy of its own.
    const storing = {
      ...LEGAL_BUILD,
      equipment: {
        ...LEGAL_BUILD.equipment,
        weaponSets: [{ ...LEGAL_BUILD.equipment.weaponSets[0], offHand: null }, null, null, null],
      },
    };
    const withoutStorage = {
      ...storing,
      attributes: LEGAL_BUILD.attributes.filter(
        ({ attributeId }) => attributeId !== "elementalist.energy-storage",
      ),
    };
    const plain = self((await joinWith(withoutStorage)).connection)?.maxEnergy ?? 0;
    const { connection } = await joinWith(storing);
    expect(self(connection)?.maxEnergy).toBe(plain + 30);
    expect(self(connection)?.energy).toBe(plain + 30);
  });

  it("shows the professions the host resolved, and a starter build's for a broken build (#281)", async () => {
    const legal = await joinWith(LEGAL_BUILD);
    expect(self(legal.connection)?.primaryProfession).toBe("elementalist");
    expect(self(legal.connection)?.secondaryProfession).toBe("monk");

    // A claim the host refused is never what the arena shows.
    const broken = await joinWith({ ...LEGAL_BUILD, primaryProfession: "bogus" });
    expect(self(broken.connection)?.primaryProfession).toBe(REFUSED_AS.primaryProfession);
    expect(self(broken.connection)?.secondaryProfession).toBe(REFUSED_AS.secondaryProfession);
  });

  it("names the player what they asked to be called, not after their build", async () => {
    const { connection } = await joinWith(LEGAL_BUILD, "Ellie");

    // #53: the build is what you play, the name is who you are.
    expect(self(connection)?.name).toBe("Ellie");
  });

  it("gives a nameless player a placeholder, and sanitises a hostile one", async () => {
    // A hello always carries a name; the empty one is the nameless.
    const nameless = await joinWith(LEGAL_BUILD, "");
    expect(self(nameless.connection)?.name).toMatch(/^player-/);

    // The server's exact hostile name: 101 UTF-16 units.
    const hostile = await joinWith(LEGAL_BUILD, `\u0000${"x".repeat(100)}`);
    const name = self(hostile.connection)?.name ?? "";
    expect(name).not.toContain("\u0000");
    expect(name.length).toBeLessThanOrEqual(16);
  });

  it("gives a starter build, whole, when no build is sent (#852)", async () => {
    // A hello's `build` is always present; `null` is "no build".
    const { slots } = await joinWith(null);

    expect(slots).toEqual(REFUSED_AS.skillBar);
    expect(slots).not.toContain(null);
  });

  it("treats a build with no equipment as invalid, not old", async () => {
    // Absent gear is malformed (ADR-0016): it takes the same invalid-build
    // path as any other broken build, rather than being given a default.
    const { equipment: _dropped, ...withoutGear } = LEGAL_BUILD;
    const { slots } = await joinWith(withoutGear);

    expect(slots).toEqual(REFUSED_AS.skillBar);
  });

  it("seats a legal four-set build holding set 1, and refuses one with an illegal set 3 (#489)", async () => {
    const [set1] = LEGAL_BUILD.equipment.weaponSets;
    const staff = {
      mainHand: {
        weaponId: "staff",
        requirementAttributeId: "elementalist.fire-magic",
        upgrades: NO_UPGRADES,
      },
      offHand: null,
    } as const;
    const fourSets: PlayerBuild = {
      ...LEGAL_BUILD,
      equipment: { ...LEGAL_BUILD.equipment, weaponSets: [set1, staff, set1, staff] },
    };
    expect(validatePlayerBuild(fourSets, MINIMAL_GW_INSPIRED_PVP_V1.attributes)).toEqual([]);
    const legal = await joinWith(fourSets);
    expect(legal.slots).toEqual(LEGAL_BUILD.skillBar);
    expect(self(legal.connection)?.weaponId).toBe(set1.mainHand.weaponId);

    const illegal = await joinWith({
      ...fourSets,
      equipment: {
        ...fourSets.equipment,
        weaponSets: [set1, null, { ...staff, offHand: set1.offHand }, null],
      },
    });
    expect(illegal.slots).toEqual(REFUSED_AS.skillBar);
  });

  it("treats the single-weapon gear shape as malformed, not old (#489)", async () => {
    const [set1] = LEGAL_BUILD.equipment.weaponSets;
    const { slots } = await joinWith({
      ...LEGAL_BUILD,
      equipment: {
        mainHand: set1.mainHand,
        offHand: set1.offHand,
        armor: LEGAL_BUILD.equipment.armor,
      },
    });

    expect(slots).toEqual(REFUSED_AS.skillBar);
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
    const { slots } = await joinWith(cheat);

    expect(slots).not.toEqual(["elementalist.fireball"]);
    expect(slots).toEqual(REFUSED_AS.skillBar);
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
    const { slots } = await joinWith(cheat);

    // Refused: a starter build's full bar, not the build's.
    expect(slots).toEqual(REFUSED_AS.skillBar);
  });

  it("refuses a build claiming another profession's primary attribute", async () => {
    // Divine Favor via a monk *secondary* is the exact rule the character
    // model exists to enforce.
    const cheat = {
      ...LEGAL_BUILD,
      name: "Divine Thief",
      attributes: [{ attributeId: "monk.divine-favor", rank: 12 }],
    };
    const { slots } = await joinWith(cheat);

    // Refused: a starter build's full bar, not the build's.
    expect(slots).toEqual(REFUSED_AS.skillBar);
  });

  it("refuses an unimplemented skill rather than granting a blank slot", async () => {
    const cheat = {
      ...LEGAL_BUILD,
      name: "Whirlwind Dreamer",
      skillBar: ["warrior.whirlwind-attack", null, null, null, null, null, null, null],
    };
    const { slots } = await joinWith(cheat);

    // Refused: a starter build's full bar, not the build's.
    expect(slots).toEqual(REFUSED_AS.skillBar);
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
      const { connection, slots } = await joinWith(build);
      // Seated, alive, and playable: never dropped and never crashed.
      expect(self(connection)?.health).toBeGreaterThan(0);
      expect(slots.length).toBeGreaterThan(0);
    }
  });

  /**
   * The payoff test: does a build's attribute ranks actually change what
   * happens in a fight?
   *
   * Everything above proves the host *accepts* or *refuses* a build. This
   * proves an accepted one is genuinely wired into the simulation.
   */
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
      const match = startMatch();
      // Opposite teams, spawned 300 apart: in spell range, no walk needed.
      const { connection: attacker } = await match.join(
        hello({ name: "Attacker", build: toJson(fireballOnly(rank)) }),
      );
      const { connection: victim } = await match.join(hello({ name: "Victim" }));
      await match.step(TICK_SECONDS);
      expect(self(attacker)?.team).not.toBe(self(victim)?.team);

      attacker.sendIntent({ kind: "target", targetSessionId: victim.selfSessionId });
      // One tick for the intent to land, one for a snapshot that shows it.
      await match.step(2 * TICK_SECONDS);
      expect(self(attacker)?.targetSessionId).toBe(victim.selfSessionId);

      const health = (): number =>
        playerIn(attacker.getSnapshot(), victim.selfSessionId)?.health ?? 0;
      const before = health();
      attacker.sendIntent({ kind: "use-skill", slot: 0 });
      // A one-second cast; a little longer for the hit to land.
      for (let i = 0; i < 40 && health() >= before; i += 1) {
        await match.step(0.1);
      }
      return before - health();
    };

    const weak = await damageAtRank(0);
    const strong = await damageAtRank(12);

    expect(weak).toBeGreaterThan(0);
    // Rank 12 Fire Magic must hit materially harder than rank 0. The exact
    // figures are pinned in game-core's scaling tests; what is asserted
    // here is only that the build reached the simulation.
    expect(strong).toBeGreaterThan(weak);
  });
});

/** An elementalist/monk with the glyph and two spells it can cheapen (#637). */
const GLYPH_BUILD: PlayerBuild = {
  ...LEGAL_BUILD,
  skillBar: [
    "elementalist.glyph-of-lesser-energy",
    "elementalist.armor-of-earth",
    "monk.orison-of-healing",
    ...nulls(5),
  ],
};

describe("the bar follows what its skills cost (#637)", () => {
  /** Join with `build`, and gather every `skill-bar` sent after the welcome. */
  async function watchBars(build: PlayerBuild) {
    const match = startMatch();
    const { connection, transport } = await match.join(hello({ build: toJson(build) }));
    const bars: unknown[] = [];
    transport.on("skill-bar", (data) => {
      bars.push(data);
    });
    return { match, connection, bars };
  }

  const costs = (connection: PeerMatchConnection): number[] =>
    connection.skillBar.slice(0, 3).map((slot) => slot?.energyCost ?? -1);

  it("sends the glyph's discount, and the full costs once both spells used it", async () => {
    const { match, connection, bars } = await watchBars(GLYPH_BUILD);
    expect(costs(connection)).toEqual([5, 10, 5]);

    connection.sendIntent({ kind: "use-skill", slot: 0 });
    await match.step(1.5);
    // A glyph is no spell: its own cost stays; 16 off takes both to 0.
    expect(bars).toHaveLength(1);
    expect(costs(connection)).toEqual([5, 0, 0]);

    connection.sendIntent({ kind: "use-skill", slot: 1 });
    await match.step(1.5);
    // One spell left on the glyph: the costs are the same, so nothing goes.
    expect(bars).toHaveLength(1);

    connection.sendIntent({ kind: "use-skill", slot: 2 });
    await match.step(1.5);
    expect(bars).toHaveLength(2);
    expect(costs(connection)).toEqual([5, 10, 5]);
  });

  it("sends nothing more while no cost changes", async () => {
    const { match, bars } = await watchBars(GLYPH_BUILD);
    await match.step(100 * TICK_SECONDS);
    expect(bars).toEqual([]);
  });
});
