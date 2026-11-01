import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * Mesmer staples 3 (#1627): Ether Feast, Drain Delusions, Signet of
 * Disruption, Wandering Eye (PvP) and Hex Eater Vortex. Numbers are the
 * corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["mesmer.illusion-magic", 12],
  ["mesmer.domination-magic", 12],
  ["mesmer.inspiration-magic", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function mesmer(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "m", attributeRanks: RANKS, ...overrides });
}

/** A foe `id`, 1 s into using `using`, which takes 3 s; `undefined`: idle. */
function foe(id: string, using?: string): Combatant {
  const combatant = makeCombatant({ id, team: 1, energy: 30 });
  if (using !== undefined) {
    combatant.cast.beginCast(using, "m", 3, undefined);
  }
  return combatant;
}

/** Everyone in `row` stands on the x axis at the given distance from the first. */
function placed(row: readonly (readonly [Combatant, number])[]) {
  return new Map(
    row.map(([combatant, x]) => [
      combatant.id,
      { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `user` pays for `skillId` and it lands on `target`, among `around`. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  around: readonly (readonly [Combatant, number])[] = [],
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: placed([[user, -200], [target, 0], ...around]),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damages(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the five are the corpus's (#1627)", () => {
  it.each([
    ["ether-feast", 40, "spell", false, "inspiration-magic", 5, 1, 8, "single-enemy"],
    ["drain-delusions", 1337, "spell", false, "inspiration-magic", 5, 0.25, 12, "single-enemy"],
    ["wandering-eye", 2056, "hex", false, "illusion-magic", 10, 2, 12, "single-enemy"],
    ["hex-eater-vortex", 1348, "spell", true, "domination-magic", 5, 0.25, 15, "single-ally"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge, %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge, target) => {
      expect(skill(`mesmer.${id}`)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `mesmer.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("Signet of Disruption is a free ¼ s signet, 15 s recharge", () => {
    expect(skill("mesmer.signet-of-disruption")).toMatchObject({
      gwId: 860,
      type: "signet",
      attributeId: "mesmer.domination-magic",
      cost: undefined,
      activationSeconds: 0.25,
      rechargeSeconds: 15,
      target: "single-enemy",
    });
  });
});

describe("Ether Feast (#1627)", () => {
  it("drains 3 energy and heals the caster 56 a point: 168", () => {
    const user = mesmer({ health: 200 });
    const target = foe("f");
    use(user, "mesmer.ether-feast", target);
    expect(target.energy).toBe(27);
    expect(user.health).toBe(200 + 3 * 56);
    expect(target.health).toBe(500);
  });

  it("a foe with 1 energy loses it, and the caster gains 56", () => {
    const user = mesmer({ health: 200 });
    use(user, "mesmer.ether-feast", makeCombatant({ id: "f", team: 1, energy: 1 }));
    expect(user.health).toBe(256);
  });

  it("a foe with none: no heal", () => {
    const user = mesmer({ health: 200 });
    use(user, "mesmer.ether-feast", makeCombatant({ id: "f", team: 1, energy: 0 }));
    expect(user.health).toBe(200);
  });

  it("says what it does", () => {
    expect(described("mesmer.ether-feast")).toEqual([
      "Target loses 3 energy",
      "You are healed 56 for each point of Energy lost",
    ]);
  });
});

describe("Drain Delusions (#1627)", () => {
  it("takes one Mesmer hex off, then drains 4 energy for 16", () => {
    const user = mesmer({ energy: 10 });
    const target = foe("f");
    target.statuses.apply("backfire", 10, "m", NO_RANKS);
    target.statuses.apply("empathy", 10, "m", NO_RANKS);
    use(user, "mesmer.drain-delusions", target);
    expect((["backfire", "empathy"] as const).filter((id) => target.statuses.has(id))).toHaveLength(
      1,
    );
    expect(target.energy).toBe(26);
    expect(user.energy).toBe(10 - 5 + 16);
  });

  it("a foe with only a Necromancer hex: nothing removed, nothing drained", () => {
    const user = mesmer({ energy: 10 });
    const target = foe("f");
    target.statuses.apply("faintheartedness", 10, "n", NO_RANKS);
    use(user, "mesmer.drain-delusions", target);
    expect(target.statuses.has("faintheartedness")).toBe(true);
    expect(target.energy).toBe(30);
    expect(user.energy).toBe(5);
  });
});

describe("Signet of Disruption (#1627)", () => {
  function hexed(using: string): Combatant {
    const target = foe("f", using);
    target.statuses.apply("backfire", 10, "m", NO_RANKS);
    return target;
  }

  it("a foe casting a spell: interrupted, and 43 damage", () => {
    const events = use(mesmer(), "mesmer.signet-of-disruption", foe("f", "elementalist.fireball"));
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "f",
      skillId: "elementalist.fireball",
    });
    expect(damages(events, "f")).toEqual([43]);
  });

  it("a hexed foe casting a spell: interrupted once, 43 damage", () => {
    const events = use(mesmer(), "mesmer.signet-of-disruption", hexed("elementalist.fireball"));
    expect(events.filter((event) => event.kind === "interrupted")).toHaveLength(1);
    expect(damages(events, "f")).toEqual([43]);
  });

  it.each(["warrior.healing-signet", "warrior.swift-chop"])(
    "a hexed foe using %s: interrupted, no damage",
    (using) => {
      const target = hexed(using);
      const events = use(mesmer(), "mesmer.signet-of-disruption", target);
      expect(events).toContainEqual({ kind: "interrupted", targetId: "f", skillId: using });
      expect(target.cast.isCasting).toBe(false);
      expect(damages(events, "f")).toEqual([]);
    },
  );

  it.each([
    ["a hexed", true],
    ["an unhexed", false],
  ] as const)("%s foe using nothing: one interrupt-missed, no damage", (_, isHexed) => {
    const target = foe("f");
    if (isHexed) {
      target.statuses.apply("backfire", 10, "m", NO_RANKS);
    }
    const events = use(mesmer(), "mesmer.signet-of-disruption", target);
    expect(events.filter((event) => event.kind === "interrupt-missed")).toHaveLength(1);
    expect(damages(events, "f")).toEqual([]);
  });

  it("an unhexed foe using a signet: nothing", () => {
    const target = foe("f", "warrior.healing-signet");
    const events = use(mesmer(), "mesmer.signet-of-disruption", target);
    expect(events.some((event) => event.kind === "interrupted")).toBe(false);
    expect(target.cast.activeCast?.skillId).toBe("warrior.healing-signet");
  });
});

describe("Hex Eater Vortex (#1627)", () => {
  /** `m` vortexes ally `a`; foes `x` beside it and `y` far off, each enchanted. */
  function vortex(hex: boolean) {
    const ally = makeCombatant({ id: "a", team: 0 });
    if (hex) {
      ally.statuses.apply("backfire", 10, "z", NO_RANKS);
      ally.statuses.apply("faintheartedness", 10, "z", NO_RANKS);
    }
    const x = foe("x");
    const y = foe("y");
    for (const one of [x, y]) {
      one.statuses.apply("blood-is-power", 10, one.id, NO_RANKS);
    }
    const events = use(mesmer(), "mesmer.hex-eater-vortex", ally, [
      [x, 80],
      [y, 1000],
    ]);
    return { ally, x, y, events };
  }

  it("takes one hex off the ally, and foes in the area take 78 and lose an enchantment", () => {
    const { ally, x, y, events } = vortex(true);
    expect(
      (["backfire", "faintheartedness"] as const).filter((id) => ally.statuses.has(id)),
    ).toHaveLength(1);
    expect(damages(events, "x")).toEqual([78]);
    expect(x.statuses.has("blood-is-power")).toBe(false);
    expect(damages(events, "y")).toEqual([]);
    expect(y.statuses.has("blood-is-power")).toBe(true);
    expect(damages(events, "a")).toEqual([]);
  });

  it("an unhexed ally: nothing at all", () => {
    const { x, events } = vortex(false);
    expect(damages(events, "x")).toEqual([]);
    expect(x.statuses.has("blood-is-power")).toBe(true);
  });
});

describe("Wandering Eye (#1627)", () => {
  function axe(): ResolvedEquipment {
    return {
      ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.axe,
        attributeId: "warrior.axe-mastery",
        damageType: WEAPONS.axe.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
  }

  function spec(id: string, team: number, spawn: Vec2, bar: readonly string[]): ParticipantSpec {
    return {
      id,
      team,
      skillBar: bar,
      attributeRanks: new Map([...RANKS, ["warrior.axe-mastery", 12]]),
      equipment: team === 0 ? unarmedResolvedEquipment(RULES.combat.armorReferenceLevel) : axe(),
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /** `m` at the origin; foes `a` beside it, `b` near `a`, `c` far off; `m`'s ally `k` by `a`. */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "wandering-eye",
      participants: [
        spec("m", 0, vec2(0, 0), ["mesmer.wandering-eye"]),
        spec("k", 0, vec2(35, -30), []),
        spec("a", 1, vec2(35, 0), ["warrior.swift-chop"]),
        spec("b", 1, vec2(35, 60), []),
        spec("c", 1, vec2(35, 1500), []),
      ],
    });
  }

  function get(sim: MatchSimulation, id: string): Combatant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found.combatant;
  }

  function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  function eyeDamage(log: readonly CombatLogEntry[], id: string): number[] {
    return log
      .filter((entry) => entry.skillId === "mesmer.wandering-eye")
      .flatMap((entry) => damages(entry.events, id));
  }

  it("hexes its target for 4 s", () => {
    const sim = match();
    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 2.25);
    expect(get(sim, "a").statuses.get("wandering-eye")).toMatchObject({
      sourceId: "m",
      durationSeconds: 4,
    });
  });

  it("the next swing is cancelled; the bearer and foes nearby take 76, and it ends", () => {
    const sim = match();
    get(sim, "a").statuses.apply("wandering-eye", 4, "m", NO_RANKS);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let tick = 0; tick < 4 / DT && get(sim, "a").statuses.has("wandering-eye"); tick += 1) {
      log.push(...sim.step(DT).log);
    }
    expect(
      log
        .filter((entry) => entry.cause === "weapon")
        .flatMap((entry) => damages(entry.events, "m")),
    ).toEqual([]);
    expect(eyeDamage(log, "a")).toEqual([76]);
    expect(eyeDamage(log, "b")).toEqual([76]);
    expect(eyeDamage(log, "c")).toEqual([]);
    expect(eyeDamage(log, "k")).toEqual([]);
    expect(eyeDamage(log, "m")).toEqual([]);
    expect(log.flatMap((entry) => entry.events)).toContainEqual({
      kind: "status-expired",
      targetId: "a",
      statusId: "wandering-eye",
    });
  });

  it("an attack skill sets it off too, and is interrupted", () => {
    const sim = match();
    get(sim, "a").statuses.apply("wandering-eye", 4, "m", NO_RANKS);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 0.05);
    expect(log.flatMap((entry) => entry.events)).toContainEqual({
      kind: "interrupted",
      targetId: "a",
      skillId: "warrior.swift-chop",
    });
    expect(eyeDamage(log, "a")).toEqual([76]);
  });

  it("says what it does", () => {
    expect(described("mesmer.wandering-eye")).toEqual([
      "Applies Wandering Eye for 4s (the next time it attacks, that attack is interrupted and it takes 76 damage and its allies nearby take 76 damage)",
    ]);
  });
});
