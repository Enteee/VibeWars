import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffect, applySkillEffects, type CombatEvent } from "../skills/effects.js";
import type { StatusId } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The Ritualist's second weapon spells (#1022): Vengeful Weapon and Weapon
 * of Remedy turn the bearer on the foe that next hurts it and steal from
 * that foe, Splinter Weapon splashes the foes beside each of the next 4
 * hits, and Mending Grip heals and, on a weapon-spelled ally, cleanses one.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RADIUS = RULES.collision.playerRadius;
/** Close enough to swing at. */
const TOUCHING = 2 * RADIUS + 10;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function armed(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

/** Someone who does nothing it is not told to: team 0 unless said. */
function body(id: string, spawn: Vec2, overrides: Partial<ParticipantSpec> = {}): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 500,
    spawn,
    facing: 0,
    ...overrides,
  };
}

/** A foe with a rank-12 sword. */
function swordsman(id: string, spawn: Vec2, team = 1): ParticipantSpec {
  return body(id, spawn, {
    team,
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    equipment: armed(WEAPONS.sword, "warrior.swordsmanship"),
    facing: Math.PI,
  });
}

function combatant(match: MatchSimulation, id: string): Combatant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** What `skillId` did in `log`, entry by entry. */
function by(log: readonly CombatLogEntry[], skillId: string): (readonly CombatEvent[])[] {
  return log.filter((entry) => entry.skillId === skillId).map((entry) => entry.events);
}

/** `dealer` hurts `target` for 40 fire damage, out of turn, as a Fireball would. */
function burn(dealer: Combatant, target: Combatant): void {
  applyEffect(
    { kind: "damage", amount: { flat: 40 }, type: "fire", armorPenetration: 0 },
    { caster: dealer, target, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
  );
}

describe("the four skills (#1022)", () => {
  it("are the corpus's PvP numbers at rank 12", () => {
    expect(skill("ritualist.weapon-of-remedy")).toMatchObject({
      type: "weapon-spell",
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "ritualist.restoration-magic",
      cost: { kind: "energy", amount: 3 },
      activationSeconds: 0.25,
      rechargeSeconds: 3,
      target: "single-ally",
      effects: [
        { kind: "apply-status", statusId: "weapon-of-remedy", durationSeconds: { flat: 8 } },
      ],
    });
    expect(skill("ritualist.vengeful-weapon")).toMatchObject({
      type: "weapon-spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.25,
      rechargeSeconds: 3,
      effects: [
        { kind: "apply-status", statusId: "vengeful-weapon", durationSeconds: { flat: 8 } },
      ],
    });
    expect(skill("ritualist.splinter-weapon")).toMatchObject({
      type: "weapon-spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      attributeId: "ritualist.channeling-magic",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 8,
      effects: [
        { kind: "apply-status", statusId: "splinter-weapon", durationSeconds: { flat: 20 } },
      ],
    });
    expect(skill("ritualist.mending-grip")).toMatchObject({
      type: "spell",
      elite: false,
      flash: false,
      disabledAfterUseSeconds: undefined,
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 4,
    });
  });
});

describe("the three weapon spells' tooltips (#1022)", () => {
  it("say the next hurt, and the hits without a weapon", () => {
    expect(describeStatus("weapon-of-remedy")).toBe(
      "the next time it takes damage or life steal from a foe: " +
        "steals 68 Health from that foe, loses 2 conditions",
    );
    expect(describeStatus("vengeful-weapon")).toBe(
      "the next time it takes damage or life steal from a foe: steals 51 Health from that foe",
    );
    expect(describeStatus("splinter-weapon")).toBe(
      "your attacks: Adjacent foes take 25 damage, ends after 4 hits",
    );
  });
});

describe("Vengeful Weapon (#1022)", () => {
  /** An ally at 300 under the ritualist's Vengeful Weapon, a swordsman at its side. */
  function vengeful(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "vengeful",
      participants: [
        body("ally", vec2(0, 0)),
        body("rit", vec2(0, 200)),
        swordsman("war", vec2(TOUCHING, 0)),
        body("ele", vec2(-TOUCHING, 0), { team: 1 }),
      ],
    });
    const ally = combatant(match, "ally");
    ally.health = 300;
    ally.statuses.apply("vengeful-weapon", 8, "rit", NO_RANKS);
    return match;
  }

  it("a blow steals 51 from the foe that struck, ends it, and the next blow steals nothing", () => {
    const match = vengeful();
    match.requestAttack("war", "ally");
    const log = stepFor(match, 6);
    expect(by(log, "ritualist.vengeful-weapon")).toEqual([
      [
        { kind: "life-stolen", targetId: "war", amount: 51 },
        { kind: "heal", targetId: "ally", amount: 51 },
        { kind: "status-expired", targetId: "ally", statusId: "vengeful-weapon" },
      ],
    ]);
    const blows = log.filter(
      (entry) => entry.sourceId === "war" && entry.events.some((event) => event.kind === "damage"),
    );
    expect(blows.length).toBeGreaterThan(1);
    expect(combatant(match, "ally").statuses.has("vengeful-weapon")).toBe(false);
  });

  it("two foes in one tick: one steal, from the first", () => {
    const match = vengeful();
    const ally = combatant(match, "ally");
    burn(combatant(match, "ele"), ally);
    burn(combatant(match, "war"), ally);
    const stolen = by(stepFor(match, DT), "ritualist.vengeful-weapon")
      .flat()
      .filter((event) => event.kind === "life-stolen");
    expect(stolen).toEqual([{ kind: "life-stolen", targetId: "ele", amount: 51 }]);
  });

  it("Burning alone never sets it off, and it expires after 8 s", () => {
    const match = vengeful();
    combatant(match, "ally").statuses.apply("burning", 7, "ele", NO_RANKS);
    const log = stepFor(match, 9);
    expect(log.flatMap((entry) => entry.events).some((e) => e.kind === "life-stolen")).toBe(false);
    expect(combatant(match, "ally").statuses.has("vengeful-weapon")).toBe(false);
  });

  it("against Vengeful Weapon: the steal is a firing, and sets off nothing", () => {
    const match = vengeful();
    const foe = combatant(match, "ele");
    foe.statuses.apply("vengeful-weapon", 8, "ele", NO_RANKS);
    burn(foe, combatant(match, "ally"));
    const log = stepFor(match, 1);
    expect(
      log.flatMap((entry) => entry.events).filter((event) => event.kind === "life-stolen"),
    ).toEqual([{ kind: "life-stolen", targetId: "ele", amount: 51 }]);
    expect(foe.statuses.has("vengeful-weapon")).toBe(true);
  });
});

describe("Weapon of Remedy (#1022)", () => {
  /** An ally at 300, bleeding, crippled then poisoned, under the ritualist's Weapon of Remedy. */
  function remedy(): MatchSimulation {
    const match = new MatchSimulation({
      seed: "remedy",
      participants: [
        body("ally", vec2(0, 0)),
        body("rit", vec2(0, 200)),
        body("ele", vec2(300, 0), { team: 1 }),
      ],
    });
    const ally = combatant(match, "ally");
    ally.health = 300;
    for (const id of ["bleeding", "crippled", "poison"] as const) {
      ally.statuses.apply(id, 15, "ele", NO_RANKS);
    }
    ally.statuses.apply("weapon-of-remedy", 8, "rit", NO_RANKS);
    return match;
  }

  const has = (ally: Combatant): StatusId[] => ally.statuses.active.map(({ id }) => id);

  it("a foe's spell: steals 68 from it and the newest 2 conditions come off", () => {
    const match = remedy();
    const ally = combatant(match, "ally");
    burn(combatant(match, "ele"), ally);
    expect(by(stepFor(match, DT), "ritualist.weapon-of-remedy")).toEqual([
      [
        { kind: "life-stolen", targetId: "ele", amount: 68 },
        { kind: "heal", targetId: "ally", amount: 68 },
        { kind: "status-removed", targetId: "ally", statusId: "poison" },
        { kind: "status-removed", targetId: "ally", statusId: "crippled" },
        { kind: "status-expired", targetId: "ally", statusId: "weapon-of-remedy" },
      ],
    ]);
    expect(has(ally)).toEqual(["bleeding"]);
  });

  it("a hit Reversal of Fortune reverses took nothing: Remedy stays up", () => {
    const match = remedy();
    const ally = combatant(match, "ally");
    ally.statuses.apply("reversal-of-fortune", 8, "rit", NO_RANKS);
    burn(combatant(match, "ele"), ally);
    expect(by(stepFor(match, DT), "ritualist.weapon-of-remedy")).toEqual([]);
    expect(ally.statuses.has("weapon-of-remedy")).toBe(true);
    expect(ally.statuses.has("reversal-of-fortune")).toBe(false);
  });

  it("Mark of Pain's splash is a firing: Remedy stays up for the next hurt", () => {
    const match = new MatchSimulation({
      seed: "remedy-mark",
      participants: [
        body("marked", vec2(0, 0)),
        body("ally", vec2(0, 2 * RADIUS + 4)),
        body("rit", vec2(0, 200)),
        body("nec", vec2(-300, 0), { team: 1 }),
        swordsman("war", vec2(TOUCHING, 0)),
      ],
    });
    combatant(match, "marked").statuses.apply("mark-of-pain", 30, "nec", NO_RANKS);
    const ally = combatant(match, "ally");
    ally.statuses.apply("weapon-of-remedy", 8, "rit", NO_RANKS);
    match.requestAttack("war", "marked");
    const log = stepFor(match, 3);
    const splashed = by(log, "necromancer.mark-of-pain")
      .flat()
      .filter((event) => event.kind === "damage" && event.targetId === "ally");
    expect(splashed.length).toBeGreaterThan(0);
    expect(by(log, "ritualist.weapon-of-remedy")).toEqual([]);
    expect(ally.statuses.has("weapon-of-remedy")).toBe(true);
  });
});

describe("Splinter Weapon (#1022)", () => {
  /**
   * A swordsman under Splinter Weapon at a foe, with a second foe beside
   * that one and a third out of reach of it.
   */
  function splinter(attacker: ParticipantSpec, foeAt: Vec2): MatchSimulation {
    const match = new MatchSimulation({
      seed: "splinter",
      participants: [
        attacker,
        body("foe", foeAt, { team: 1, maxHealth: 1e6 }),
        body("near", vec2(foeAt.x, foeAt.y + 2 * RADIUS + 4), { team: 1, maxHealth: 1e6 }),
        body("far", vec2(foeAt.x + 90, foeAt.y), { team: 1, maxHealth: 1e6 }),
      ],
    });
    combatant(match, attacker.id).statuses.apply("splinter-weapon", 20, "war", NO_RANKS);
    match.requestAttack(attacker.id, "foe");
    return match;
  }

  /** Stepped until Splinter Weapon is gone; each splash, and the misses on the way. */
  function untilSpent(match: MatchSimulation): {
    splashes: (readonly CombatEvent[])[];
    misses: number;
  } {
    const log: CombatLogEntry[] = [];
    for (
      let i = 0;
      i < 20 / DT && combatant(match, "war").statuses.has("splinter-weapon");
      i += 1
    ) {
      log.push(...match.step(DT).log);
    }
    return {
      splashes: by(log, "ritualist.splinter-weapon"),
      misses: log
        .filter((entry) => entry.sourceId === "war")
        .flatMap((entry) => entry.events)
        .filter((event) => event.kind === "attack-missed").length,
    };
  }

  it("a sword's 4 hits each deal 25 to the foe beside the one hit, then it ends", () => {
    const { splashes } = untilSpent(splinter(swordsman("war", vec2(0, 0), 0), vec2(TOUCHING, 0)));
    expect(splashes).toEqual(
      Array.from({ length: 4 }, () => [
        { kind: "damage", targetId: "near", amount: 25, critical: false },
      ]),
    );
  });

  it("a miss spends nothing", () => {
    const match = splinter(swordsman("war", vec2(0, 0), 0), vec2(TOUCHING, 0));
    combatant(match, "war").statuses.apply("blind", 4, "foe", NO_RANKS);
    const { splashes, misses } = untilSpent(match);
    expect(misses).toBeGreaterThan(0);
    expect(splashes).toHaveLength(4);
  });

  it("an arrow splashes around the foe it hits", () => {
    const archer = body("war", vec2(0, 0), {
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: armed(WEAPONS.flatbow, "ranger.marksmanship"),
    });
    const { splashes } = untilSpent(splinter(archer, vec2(300, 0)));
    expect(splashes[0]).toEqual([
      { kind: "damage", targetId: "near", amount: 25, critical: false },
    ]);
  });
});

describe("Mending Grip (#1022)", () => {
  /** Mending Grip on an ally at 100, poisoned, with `weaponSpell` on it or not. */
  function grip(weaponSpell: boolean): Combatant {
    const ally = makeCombatant({ id: "ally", health: 100 });
    ally.statuses.apply("poison", 10, "foe", NO_RANKS);
    if (weaponSpell) {
      ally.statuses.apply("weapon-of-warding", 10, "rit", NO_RANKS);
    }
    applySkillEffects({
      skill: skill("ritualist.mending-grip"),
      caster: makeCombatant({
        id: "rit",
        attributeRanks: new Map([["ritualist.restoration-magic", 12]]),
      }),
      targets: [ally],
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
    return ally;
  }

  it("heals 68 and, under a weapon spell, takes one condition", () => {
    const ally = grip(true);
    expect(ally.health).toBe(168);
    expect(ally.statuses.has("poison")).toBe(false);
    expect(ally.statuses.has("weapon-of-warding")).toBe(true);
  });

  it("with no weapon spell, only heals", () => {
    const ally = grip(false);
    expect(ally.health).toBe(168);
    expect(ally.statuses.has("poison")).toBe(true);
  });
});
