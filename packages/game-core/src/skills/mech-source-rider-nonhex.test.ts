import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import type { CombatEvent } from "./effects.js";
import type { StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { netPips } from "./tick.js";
import { resolveSwing } from "./weapon-attack.js";

/**
 * A rider at its caster's ranks, and an enchantment that ends on a
 * non-hex skill (#2411): Withering Aura, Hexer's Vigor, and Order of Pain
 * and Order of the Vampire at their Necromancer's Blood Magic. Numbers are
 * the corpus's, at rank 0 and rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DEATH = "necromancer.death-magic";
const SOUL = "necromancer.soul-reaping";
const BLOOD = "necromancer.blood-magic";

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  equipment = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: bar,
    attributeRanks: ranks,
    equipment,
    maxHealth: 500,
    maxEnergy: 1000,
    startHealthFraction: 1,
    spawn,
    facing: 0,
  };
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** `caster` uses its `slot`th skill on `target`, and the use resolves. */
function cast(match: MatchSimulation, caster: string, target: string, slot = 0): void {
  match.setTarget(caster, target);
  expect(match.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  stepFor(match, 1.5);
}

function remaining(match: MatchSimulation, id: string, status: StatusId): number {
  return get(match, id).combatant.statuses.get(status)?.remainingSeconds ?? 0;
}

describe("#2411's data", () => {
  it.each([
    ["necromancer.withering-aura", 1997, "death-magic", 1, 3, "single-ally"],
    ["necromancer.hexers-vigor", 2138, "soul-reaping", 0.25, 10, "self"],
  ] as const)(
    "%s: gwId %i, %s, 5 energy, %d s, %i s recharge, %s",
    (id, gwId, attribute, activation, recharge, target) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type: "enchantment",
        elite: false,
        attributeId: `necromancer.${attribute}`,
        cost: { kind: "energy", amount: 5 },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );
});

describe("Withering Aura (#2411)", () => {
  /** A Necromancer at `deathMagic` puts it on a swordsman with none, who swings at a foe. */
  function aura(deathMagic: number): { aura: number; weakness: number } {
    const match = new MatchSimulation({
      seed: "withering-aura",
      participants: [
        spec("n", 0, vec2(0, 0), ["necromancer.withering-aura"], new Map([[DEATH, deathMagic]])),
        spec(
          "w",
          0,
          vec2(0, 30),
          [],
          new Map([["warrior.swordsmanship", 12]]),
          wielding(WEAPONS.sword, "warrior.swordsmanship"),
        ),
        spec("foe", 1, vec2(0, 60), [], new Map()),
      ],
    });
    cast(match, "n", "w");
    const auraLeft = remaining(match, "w", "withering-aura");
    expect(match.requestAttack("w", "foe")?.ok).toBe(true);
    let weakness = 0;
    for (let i = 0; i < Math.round(4 / DT) && weakness === 0; i += 1) {
      match.step(DT);
      weakness = remaining(match, "foe", "weakness");
    }
    return { aura: auraLeft, weakness };
  }

  it("lasts 17 s at Death Magic 12 and weakens for 17 s, though the swordsman has none", () => {
    const { aura: left, weakness } = aura(12);
    expect(left).toBeGreaterThan(16);
    expect(left).toBeLessThanOrEqual(17);
    expect(weakness).toBeGreaterThan(16);
    expect(weakness).toBeLessThanOrEqual(17);
  });

  it("lasts 5 s at Death Magic 0 and weakens for 5 s", () => {
    const { aura: left, weakness } = aura(0);
    expect(left).toBeGreaterThan(4);
    expect(left).toBeLessThanOrEqual(5);
    expect(weakness).toBeGreaterThan(4);
    expect(weakness).toBeLessThanOrEqual(5);
  });
});

describe("Hexer's Vigor (#2411)", () => {
  function vigor(soulReaping: number): MatchSimulation {
    const match = new MatchSimulation({
      seed: "hexers-vigor",
      participants: [
        spec(
          "n",
          0,
          vec2(0, 0),
          ["necromancer.hexers-vigor", "necromancer.faintheartedness", "necromancer.blood-renewal"],
          new Map([[SOUL, soulReaping]]),
        ),
        spec("foe", 1, vec2(0, 60), [], new Map()),
      ],
    });
    cast(match, "n", "n");
    return match;
  }

  it("regenerates +7 at Soul Reaping 12 and +1 at 0", () => {
    expect(netPips(get(vigor(12), "n").combatant, 0, 0).health).toBe(7);
    expect(netPips(get(vigor(0), "n").combatant, 0, 0).health).toBe(1);
  });

  it("stays through a hex, and ends on a non-hex skill", () => {
    const match = vigor(12);
    expect(remaining(match, "n", "hexers-vigor")).toBeGreaterThan(0);
    cast(match, "n", "foe", 1);
    expect(remaining(match, "n", "hexers-vigor")).toBeGreaterThan(0);
    cast(match, "n", "n", 2);
    expect(remaining(match, "n", "hexers-vigor")).toBe(0);
  });
});

describe("Order of Pain and Order of the Vampire at their caster's Blood Magic (#2411)", () => {
  const steady = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

  /** What `order`'s rider gave a sword swing, its caster at `bloodMagic`. */
  function rider(order: StatusId, bloodMagic: number): readonly CombatEvent[] {
    const swordsman = makeCombatant({
      id: "attacker",
      team: 0,
      equipment: wielding(WEAPONS.sword, "warrior.swordsmanship"),
      attributeRanks: new Map([
        ["warrior.swordsmanship", 12],
        [BLOOD, 12],
      ]),
      health: 100,
      maxHealth: 500,
    });
    swordsman.statuses.apply(order, 5, "necro", new Map([[BLOOD, bloodMagic]]));
    const { fired } = resolveSwing({
      attacker: swordsman,
      target: {
        combatant: makeCombatant({ id: "foe", team: 1, health: 1e6, maxHealth: 1e6 }),
        position: vec2(40, 0),
        floors: 1,
        layer: 0,
        creature: undefined,
      },
      surroundings: new Map(),
      rng: steady(),
      rules: RULES.combat,
      exposed: () => false,
    });
    return fired.flatMap(({ events }) => events);
  }

  const amounts = (events: readonly CombatEvent[], kind: "damage" | "life-stolen"): number[] =>
    events.flatMap((event) => (event.kind === kind ? [event.amount] : []));

  it("Order of Pain: +13 damage at rank 12, +3 at rank 0, whatever the attacker's", () => {
    expect(amounts(rider("order-of-pain", 12), "damage")).toEqual([13]);
    expect(amounts(rider("order-of-pain", 0), "damage")).toEqual([3]);
  });

  it("Order of the Vampire: steals 13 at rank 12, 3 at rank 0", () => {
    expect(amounts(rider("order-of-the-vampire", 12), "life-stolen")).toEqual([13]);
    expect(amounts(rider("order-of-the-vampire", 0), "life-stolen")).toEqual([3]);
  });
});
