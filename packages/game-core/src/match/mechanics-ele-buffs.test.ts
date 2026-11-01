import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS, aggregateModifiers, type StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { rankOf } from "../skills/tick.js";
import type { FiredTrigger } from "../skills/triggers.js";
import { attackHitRiders } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Elementalist self-buffs (#1984): the Conjures' rider for one weapon
 * element, Ether Prodigy's Health per point of Energy, Ether Renewal's
 * gains per enchantment, and Elemental Attunement's ranks and return,
 * each at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

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

describe("Conjures (#1984)", () => {
  /** What `conjure` adds to one hit of `weapon` nominating `attributeId`. */
  const added = (conjure: StatusId, weapon: Weapon, attributeId: string, also?: StatusId) => {
    const attacker = makeCombatant({ id: "e", equipment: wielding(weapon, attributeId) });
    attacker.statuses.apply(conjure, 60, "e", NO_RANKS);
    if (also !== undefined) {
      attacker.statuses.apply(also, 60, "e", NO_RANKS);
    }
    const victim = makeCombatant({ id: "f", team: 1, maxHealth: 1000, health: 1000 });
    const fired: FiredTrigger[] = [];
    attackHitRiders(
      attacker,
      victim,
      attacker.equipment.mainHand,
      false,
      0,
      createRng(1),
      RULES.combat,
      new Map(),
      fired,
      [],
    );
    return 1000 - victim.health;
  };

  it("Conjure Flame: +17 fire on a fire staff's bolt", () => {
    expect(added("conjure-flame", WEAPONS.staff, "elementalist.fire-magic")).toBe(17);
  });

  it("Conjure Flame: nothing on a sword, nor on a sword under Greater Conflagration", () => {
    expect(added("conjure-flame", WEAPONS.sword, "warrior.swordsmanship")).toBe(0);
    expect(
      added("conjure-flame", WEAPONS.sword, "warrior.swordsmanship", "greater-conflagration"),
    ).toBe(0);
  });

  it("Conjure Frost on a fire staff: nothing; Conjure Lightning on an air staff: +17", () => {
    expect(added("conjure-frost", WEAPONS.staff, "elementalist.fire-magic")).toBe(0);
    expect(added("conjure-lightning", WEAPONS.staff, "elementalist.air-magic")).toBe(17);
  });
});

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function spec(id: string, team: number, x: number, skillBar: readonly string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn: vec2(x, 0),
    facing: 0,
  };
}

/**
 * `c` uses its slot `slot` at `targetId`, then the match runs until the
 * cast and its aftercast are done. Returns the log of those steps.
 */
function cast(sim: MatchSimulation, slot: number, targetId: string): CombatLogEntry[] {
  const caster = get(sim, "c").combatant;
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (let i = 0; caster.cast.activeCast !== undefined || caster.cast.inAftercast; i++) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("Ether Prodigy (#1984)", () => {
  it("strips Armor of Earth, then lands with +6 Energy regeneration", () => {
    const sim = new MatchSimulation({
      seed: "ether-prodigy",
      participants: [spec("c", 0, 0, ["elementalist.ether-prodigy"])],
    });
    const caster = get(sim, "c").combatant;
    caster.statuses.apply("armor-boost", 30, "c", NO_RANKS);
    cast(sim, 0, "c");
    expect(caster.statuses.has("armor-boost")).toBe(false);
    expect(caster.statuses.has("ether-prodigy")).toBe(true);
    expect(aggregateModifiers(caster.statuses.active).energyPips).toBe(6);
  });

  it("costs 2 Health per point of Energy when it expires: 60 at 30", () => {
    // A 30 Energy cap holds it at 30 under the +6 regeneration.
    const sim = new MatchSimulation({
      seed: "ether-prodigy",
      participants: [{ ...spec("c", 0, 0, []), maxEnergy: 30 }],
    });
    const caster = get(sim, "c").combatant;
    caster.energy = 30;
    caster.statuses.apply("ether-prodigy", 0.5, "c", NO_RANKS);
    for (let i = 0; caster.statuses.has("ether-prodigy"); i++) {
      expect(i).toBeLessThan(2 * RULES.tickRateHz);
      sim.step(DT);
    }
    expect(caster.health).toBe(940);
  });

  it("costs the same when Drain Enchantment removes it", () => {
    const sim = new MatchSimulation({
      seed: "ether-prodigy",
      participants: [
        { ...spec("c", 0, 0, ["mesmer.drain-enchantment"]), maxEnergy: 30 },
        spec("f", 1, 100, []),
      ],
    });
    const prodigy = get(sim, "f").combatant;
    prodigy.statuses.apply("ether-prodigy", 18, "f", NO_RANKS);
    get(sim, "c").combatant.energy = 30;
    const before = prodigy.health;
    // The Elementalist here is `f`, capped at 30 Energy too.
    prodigy.maxEnergy = 30;
    prodigy.energy = 30;
    cast(sim, 0, "f");
    expect(prodigy.statuses.has("ether-prodigy")).toBe(false);
    expect(before - prodigy.health).toBe(60);
  });
});

/** What `skillId`'s entries in `log` gave `targetId`, by event kind. */
function gained(log: readonly CombatLogEntry[], skillId: string, targetId: string) {
  const sum = (kind: "energy-gain" | "heal"): number =>
    log
      .filter((entry) => entry.skillId === skillId)
      .flatMap(({ events }) => events)
      .reduce(
        (total, event) =>
          event.kind === kind && event.targetId === targetId ? total + event.amount : total,
        0,
      );
  return { energy: sum("energy-gain"), health: sum("heal") };
}

describe("Ether Renewal (#1984)", () => {
  const renewal = (): MatchSimulation =>
    new MatchSimulation({
      seed: "ether-renewal",
      participants: [
        spec("c", 0, 0, ["elementalist.ether-renewal", "elementalist.flare"]),
        spec("f", 1, 100, []),
      ],
    });

  it("with 3 enchantments up, a spell cast gives 9 Energy and 51 Health", () => {
    const sim = renewal();
    const caster = get(sim, "c").combatant;
    caster.health = 500;
    caster.energy = 50;
    caster.statuses.apply("ether-renewal", 10, "c", NO_RANKS);
    caster.statuses.apply("armor-boost", 30, "c", NO_RANKS);
    caster.statuses.apply("armor-of-mist", 30, "c", NO_RANKS);
    const log = cast(sim, 1, "f");
    expect(gained(log, "elementalist.ether-renewal", "c")).toEqual({ energy: 9, health: 51 });
  });

  it("does not answer its own cast", () => {
    const sim = renewal();
    const caster = get(sim, "c").combatant;
    caster.health = 500;
    caster.statuses.apply("armor-boost", 30, "c", NO_RANKS);
    const log = cast(sim, 0, "c");
    expect(caster.statuses.has("ether-renewal")).toBe(true);
    expect(gained(log, "elementalist.ether-renewal", "c")).toEqual({ energy: 0, health: 0 });
  });
});

describe("Elemental Attunement (#1984)", () => {
  const attuned = (): MatchSimulation => {
    const sim = new MatchSimulation({
      seed: "elemental-attunement",
      participants: [
        {
          ...spec("c", 0, 0, ["elementalist.fireball", "mesmer.illusion-of-weakness"]),
          attributeRanks: new Map([["elementalist.fire-magic", 10]]),
        },
        spec("f", 1, 100, []),
      ],
    });
    get(sim, "c").combatant.statuses.apply("elemental-attunement", 53, "c", NO_RANKS);
    return sim;
  };

  it("raises Fire Magic by 2", () => {
    const sim = attuned();
    expect(rankOf(get(sim, "c").combatant, "elementalist.fire-magic")).toBe(12);
  });

  it("a 10 Energy Fire spell returns 6 Energy; a Mesmer spell none", () => {
    const sim = attuned();
    const fire = cast(sim, 0, "f");
    expect(gained(fire, "elementalist.elemental-attunement", "c").energy).toBe(6);
    const mesmer = cast(sim, 1, "c");
    expect(gained(mesmer, "elementalist.elemental-attunement", "c").energy).toBe(0);
  });
});
