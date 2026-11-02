import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describe, expect, it } from "vitest";

import { AREA_NEARBY, PET_REACH } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { isElementalDamage, isPhysicalDamage } from "../equipment/types.js";
import { WEAPONS } from "../equipment/weapons.js";
import { getAttribute } from "../professions.js";
import { createRng } from "../rng.js";
import { vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { CastState } from "./cast-state.js";
import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import { computeCoverage, formatCoverage } from "./coverage.js";
import { applyEffects } from "./effects.js";
import { chargeAdrenaline, makeCombatant } from "./testing.js";
import { getStatusDefinition } from "./status.js";
import { blowRuleOf, type Combatant, type Magnitude } from "./types.js";

/** A hammer in hand, for the hammer's attack skills. */
const HAMMER = {
  ...unarmedResolvedEquipment(MINIMAL_GW_INSPIRED_PVP_V1.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.hammer,
    attributeId: "warrior.hammer-mastery",
    damageType: WEAPONS.hammer.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

describe("skill catalog integrity", () => {
  it("has no duplicate skill ids", () => {
    const ids = IMPLEMENTED_SKILLS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every skill a non-empty name and a positive range", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.name.length).toBeGreaterThan(0);
      expect(skill.range).toBeGreaterThan(0);
    }
  });

  it("gives every skill something to do — no empty placeholder skills", () => {
    // A companion's skill does its job by being on the bar, a pet attack
    // by its pet's blow (#1046).
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(
        skill.effects.length +
          (blowRuleOf(skill) === undefined ? 0 : 1) +
          (skill.companion === undefined ? 0 : 1),
        skill.id,
      ).toBeGreaterThan(0);
    }
  });

  it("makes every flash skill an instant enchantment on its caster (#1421)", () => {
    const flash = IMPLEMENTED_SKILLS.filter((skill) => skill.flash);
    expect(flash.length).toBeGreaterThan(0);
    for (const skill of flash) {
      expect([skill.type, skill.activationSeconds, skill.target], skill.id).toEqual([
        "enchantment",
        0,
        "self",
      ]);
    }
  });

  it("gives an aura only to a spirit, and a ritual is what summons one (#1064)", () => {
    const summons = IMPLEMENTED_SKILLS.flatMap((skill) =>
      skill.effects.flatMap((effect) => (effect.kind === "summon" ? [{ skill, effect }] : [])),
    );
    expect(summons.length).toBeGreaterThan(0);
    for (const { skill, effect } of summons) {
      const { kind, aura } = effect.creature;
      if (aura !== undefined) {
        expect(kind, skill.id).toBe("spirit");
        // A nature ritual touches everyone; a binding ritual takes a side,
        // its party's (Shelter) or the foes' (Earthbind).
        if (skill.type === "nature-ritual") expect(aura.affects, skill.id).toBe("all");
        else expect(aura.affects, skill.id).not.toBe("all");
      }
      expect(kind === "spirit", skill.id).toBe(
        skill.type === "nature-ritual" || skill.type === "binding-ritual",
      );
    }
  });

  it("leaves a ground effect from a ward, a well, a trap or a symbol, and only from those (#1087, #1104, #1105, #1113)", () => {
    for (const type of ["ward", "well", "trap"]) {
      expect(
        IMPLEMENTED_SKILLS.some((skill) => skill.type === type),
        type,
      ).toBe(true);
    }
    for (const skill of IMPLEMENTED_SKILLS) {
      const grounds = skill.effects.flatMap((effect) =>
        effect.kind === "create-ground-effect" ? [effect.act.kind] : [],
      );
      // A spell may leave a pulse where its target stands: a symbol.
      const pulse = skill.type === "spell" && grounds.length > 0 ? ["pulse"] : [];
      expect(grounds, skill.id).toEqual(
        skill.type === "ward" || skill.type === "well"
          ? ["aura"]
          : skill.type === "trap"
            ? ["trap"]
            : pulse,
      );
    }
  });

  it("anchors a ground effect where its act says (#1104, #1113)", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      for (const effect of skill.effects) {
        if (effect.kind === "create-ground-effect") {
          expect(effect.anchor === "corpse", skill.id).toBe(skill.corpse !== undefined);
          // A well stands on its corpse; a spell may burst there too, as
          // Putrid Explosion's (#1583).
          if (skill.type === "well") {
            expect(effect.anchor, skill.id).toBe("corpse");
          }
          // A symbol pulses at its target (#1113); a pulse may also stay
          // where the caster stood, as Lava Font's (#1540).
          if (effect.anchor === "target") {
            expect(effect.act.kind, skill.id).toBe("pulse");
            expect(skill.target, skill.id).toBe("single-enemy");
          }
        }
      }
    }
  });

  it("lasts a pulse its delay and its pulses, and nests no ground effect in one (#1113)", () => {
    const pulses = IMPLEMENTED_SKILLS.flatMap((skill) =>
      skill.effects.flatMap((effect) => {
        if (effect.kind !== "create-ground-effect" || effect.act.kind === "aura") {
          return [];
        }
        const pulse = effect.act.kind === "trap" ? effect.act.trap.spring : effect.act.pulse;
        return [{ id: skill.id, effect, pulse }];
      }),
    );
    expect(pulses.some(({ effect }) => effect.act.kind === "pulse")).toBe(true);
    for (const { id, effect, pulse } of pulses) {
      expect(pulse.count, id).toBeGreaterThanOrEqual(1);
      expect(pulse.everySeconds, id).toBeGreaterThan(0);
      expect(pulse.area.origin, id).toBe("caster");
      expect(
        pulse.effects.some((inner) => inner.kind === "create-ground-effect"),
        id,
      ).toBe(false);
      if (effect.act.kind === "pulse") {
        expect(pulse.delaySeconds, id).toBeGreaterThanOrEqual(0);
        expect(effect.durationSeconds, id).toEqual({
          flat: pulse.delaySeconds + pulse.count * pulse.everySeconds,
        });
      } else {
        // A trap's first pulse lands as it springs (#1270).
        expect(pulse.delaySeconds, id).toBe(0);
      }
    }
  });

  it("makes every attack skill a blow of its weapon, and no other skill (ADR-0029)", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.attack !== undefined, skill.id).toBe(skill.type === "attack");
      if (skill.type === "attack") {
        // Its damage is the blow's bonus, never an effect of its own.
        expect(
          skill.effects.map((effect) => effect.kind),
          skill.id,
        ).not.toContain("damage");
      }
    }
  });

  it("gives every damage effect one of GW1's damage types (#759)", () => {
    const otherTypes: readonly string[] = ["chaos", "dark", "holy", "shadow", "typeless"];
    for (const skill of IMPLEMENTED_SKILLS) {
      for (const effect of [...skill.effects, ...(skill.attack?.onBlocked ?? [])]) {
        if (effect.kind === "damage") {
          expect(
            isPhysicalDamage(effect.type) ||
              isElementalDamage(effect.type) ||
              otherTypes.includes(effect.type),
            skill.id,
          ).toBe(true);
        }
      }
    }
    expect(getSkill("elementalist.fireball")?.effects).toContainEqual(
      expect.objectContaining({ kind: "damage", type: "fire" }),
    );
  });

  it("maintains only enchantments (#837)", () => {
    const maintained = IMPLEMENTED_SKILLS.flatMap((skill) =>
      skill.effects.flatMap((effect) =>
        effect.kind === "maintain-status" ? [effect.statusId] : [],
      ),
    );
    expect(maintained).toContain("mending");
    for (const statusId of maintained) {
      expect(getStatusDefinition(statusId).category, statusId).toBe("enchantment");
    }
  });

  it("flies no skill whose area is the whole party (#1013)", () => {
    const party = IMPLEMENTED_SKILLS.filter((skill) => skill.area?.origin === "party");
    expect(party.map((skill) => skill.id)).toContain("monk.heal-party");
    for (const skill of party) {
      expect(skill.projectile, skill.id).toBeUndefined();
    }
  });

  it("uses non-negative activation and recharge everywhere", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      expect(skill.activationSeconds).toBeGreaterThanOrEqual(0);
      expect(skill.rechargeSeconds).toBeGreaterThanOrEqual(0);
    }
  });

  it("looks up a known skill and misses an unknown one", () => {
    expect(getSkill("elementalist.fireball")?.name).toBe("Fireball");
    expect(getSkill("not.a.skill")).toBeUndefined();
  });
});

describe("skill coverage reporting", () => {
  it("counts implemented vs imported and names the gap", () => {
    const imported = [
      "elementalist.fireball",
      "monk.orison-of-healing",
      "warrior.whirlwind-attack",
    ];
    const coverage = computeCoverage(imported);
    expect(coverage.imported).toBe(3);
    expect(coverage.implemented).toBe(IMPLEMENTED_SKILLS.length);
    const ids = coverage.unimplemented.map((skill) => skill.id);
    expect(ids).toContain("warrior.whirlwind-attack");
    expect(ids).not.toContain("elementalist.fireball");
  });

  it("flags implemented skills that are original design, not imports", () => {
    const coverage = computeCoverage(["elementalist.fireball"]);
    expect(coverage.originalDesign).toContain("necromancer.blood-renewal-lite");
  });

  it("formats a human-readable report naming every unimplemented skill", () => {
    const text = formatCoverage(
      computeCoverage(["warrior.whirlwind-attack", "elementalist.fireball"]),
    );
    expect(text).toContain("warrior.whirlwind-attack");
    expect(text).toContain("imported:");
    expect(text).toContain("implemented:");
  });
});

/**
 * Headless combat simulation (brief §15). These run a full
 * validate -> pay -> cast -> resolve cycle with no server, no socket and
 * no browser, which is exactly the property that makes combat rules
 * testable at all.
 */
describe("headless combat simulation", () => {
  const TICK = 1 / 20;

  interface SimActor {
    readonly combatant: Combatant;
    readonly cast: CastState;
    readonly position: { x: number; y: number };
    readonly skillBar: readonly string[];
  }

  function actor(combatant: Combatant, skillBar: readonly string[], x = 0): SimActor {
    return {
      combatant,
      cast: new CastState(combatant.id, combatant.statuses),
      position: vec2(x, 0),
      skillBar,
    };
  }

  /** Try to start a cast; returns the rejection reason, or undefined on success. */
  function tryCast(
    caster: SimActor,
    skillId: string,
    target: SimActor | undefined,
  ): string | undefined {
    const skill = getSkill(skillId);
    if (skill === undefined) {
      return "unknown-skill";
    }
    const check = canActivate({
      skill,
      caster: caster.combatant,
      casterPosition: caster.position,
      target: target?.combatant,
      targetPosition: target?.position,
      targetCreatureKind: undefined,
      targetCreatureOwnerId: undefined,
      rechargeRemaining: caster.cast.rechargeRemaining,
      spent: caster.cast.spent,
      isCasting: caster.cast.isCasting,
      skillBar: caster.skillBar,
      losBlockers: [],
    });
    if (!check.ok) {
      return check.reason;
    }
    payCost(skill, caster.combatant);
    caster.cast.beginCast(
      skill.id,
      target?.combatant.id,
      skill.activationSeconds,
      skill.whileActivating,
    );
    return undefined;
  }

  /** Advance one tick, resolving any cast that completes. */
  function tick(caster: SimActor, target: SimActor | undefined): void {
    const completed = caster.cast.advance(TICK);
    if (completed === undefined) {
      return;
    }
    const skill = getSkill(completed.skillId);
    if (skill === undefined) {
      return;
    }
    applyEffects(skill.effects, {
      surroundings: new Map(),
      caster: caster.combatant,
      target: target?.combatant,
      rng: createRng(1),
      rules: MINIMAL_GW_INSPIRED_PVP_V1.combat,
    });
    caster.cast.startRecharge(skill.id, skill.rechargeSeconds);
  }

  it("an elementalist with Fire Magic 12 kills a 500hp target with repeated Fireballs", () => {
    const ele = actor(
      makeCombatant({
        id: "ele",
        team: 0,
        energy: 100,
        maxEnergy: 100,
        attributeRanks: new Map([["elementalist.fire-magic", 12]]),
      }),
      ["elementalist.fireball"],
    );
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);

    // 91 damage per cast at rank 12 -> 6 casts to kill 500hp.
    for (let elapsed = 0; elapsed < 60 && !victim.combatant.dead; elapsed += TICK) {
      tryCast(ele, "elementalist.fireball", victim);
      tick(ele, victim);
    }

    expect(victim.combatant.dead).toBe(true);
    expect(victim.combatant.health).toBe(0);
  });

  it("respects recharge: a second Fireball cannot start until recharge elapses", () => {
    const ele = actor(makeCombatant({ id: "ele", team: 0, energy: 100, maxEnergy: 100 }), [
      "elementalist.fireball",
    ]);
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);

    expect(tryCast(ele, "elementalist.fireball", victim)).toBeUndefined();
    // Finish the 1s cast.
    for (let i = 0; i < 20; i += 1) {
      tick(ele, victim);
    }
    // Immediately after, the 7s recharge is running.
    expect(tryCast(ele, "elementalist.fireball", victim)).toBe("still-recharging");
  });

  it("a monk heals a damaged ally, and the heal scales with Healing Prayers", () => {
    const makeMonk = (rank: number): SimActor =>
      actor(
        makeCombatant({
          id: "monk",
          team: 0,
          attributeRanks: new Map([["monk.healing-prayers", rank]]),
        }),
        ["monk.orison-of-healing"],
      );

    const healAmountAtRank = (rank: number): number => {
      const monk = makeMonk(rank);
      const ally = actor(makeCombatant({ id: "ally", team: 0, health: 100 }), [], 50);
      expect(tryCast(monk, "monk.orison-of-healing", ally)).toBeUndefined();
      for (let i = 0; i < 25; i += 1) {
        tick(monk, ally);
      }
      return ally.combatant.health - 100;
    };

    expect(healAmountAtRank(0)).toBe(20);
    expect(healAmountAtRank(12)).toBe(60);
    expect(healAmountAtRank(12)).toBeGreaterThan(healAmountAtRank(6));
  });

  it("energy runs out: a monk cannot heal forever", () => {
    const monk = actor(makeCombatant({ id: "monk", team: 0, energy: 12, maxEnergy: 50 }), [
      "monk.orison-of-healing",
    ]);
    const ally = actor(makeCombatant({ id: "ally", team: 0, health: 10 }), [], 50);

    const reasons: (string | undefined)[] = [];
    for (let elapsed = 0; elapsed < 20; elapsed += TICK) {
      reasons.push(tryCast(monk, "monk.orison-of-healing", ally));
      tick(monk, ally);
    }

    // 12 energy at 5 per cast = 2 casts, then it must report running dry.
    expect(reasons).toContain("insufficient-energy");
    expect(monk.combatant.energy).toBeLessThan(5);
  });

  it("the whole simulation is deterministic: identical runs produce identical state", () => {
    const run = (): number => {
      const ele = actor(
        makeCombatant({
          id: "ele",
          team: 0,
          energy: 100,
          maxEnergy: 100,
          attributeRanks: new Map([["elementalist.fire-magic", 9]]),
        }),
        ["elementalist.fireball"],
      );
      const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);
      for (let elapsed = 0; elapsed < 30; elapsed += TICK) {
        tryCast(ele, "elementalist.fireball", victim);
        tick(ele, victim);
      }
      return victim.combatant.health;
    };
    expect(run()).toBe(run());
  });

  it("a sacrifice skill can kill its own caster", () => {
    const necro = actor(makeCombatant({ id: "necro", team: 0, health: 30, maxHealth: 500 }), [
      "necromancer.blood-renewal-lite",
    ]);
    const ally = actor(makeCombatant({ id: "ally", team: 0, health: 100 }), [], 50);

    expect(tryCast(necro, "necromancer.blood-renewal-lite", ally)).toBeUndefined();
    for (let i = 0; i < 25; i += 1) {
      tick(necro, ally);
    }

    // 10% of 500 max health = 50 sacrifice, from 30 current -> dead.
    expect(necro.combatant.dead).toBe(true);
    // The ally is still healed: the effects resolve in order.
    expect(ally.combatant.health).toBeGreaterThan(100);
  });

  it("Blood Ritual sacrifices 17% of health and enchants a touched ally with +3 energy pips", () => {
    const necro = actor(
      makeCombatant({
        id: "necro",
        team: 0,
        health: 500,
        maxHealth: 500,
        attributeRanks: new Map([["necromancer.blood-magic", 12]]),
      }),
      ["necromancer.blood-ritual"],
    );
    const far = actor(makeCombatant({ id: "far", team: 0 }), [], 100);
    expect(tryCast(necro, "necromancer.blood-ritual", far)).toBe("out-of-range");
    expect(tryCast(necro, "necromancer.blood-ritual", necro)).toBe("invalid-target-self");

    const ally = actor(makeCombatant({ id: "ally", team: 0 }), [], 30);
    expect(tryCast(necro, "necromancer.blood-ritual", ally)).toBeUndefined();
    for (let i = 0; i < 20; i += 1) {
      tick(necro, ally);
    }

    expect(necro.combatant.health).toBe(415);
    expect(ally.combatant.statuses.active.map((s) => [s.id, s.remainingSeconds])).toEqual([
      ["blood-ritual", 13],
    ]);
  });

  it("Malaise hexes a foe at spell range", () => {
    const necro = actor(makeCombatant({ id: "necro", team: 0 }), ["necromancer.malaise"]);
    const foe = actor(makeCombatant({ id: "foe", team: 1 }), [], 300);

    expect(tryCast(necro, "necromancer.malaise", foe)).toBeUndefined();
    for (let i = 0; i < 40; i += 1) {
      tick(necro, foe);
    }

    expect(foe.combatant.statuses.active.map((s) => [s.id, s.remainingSeconds])).toEqual([
      ["malaise", 24],
    ]);
  });

  it("Enfeeble weakens a foe at spell range for its rank-12 26 s (#762)", () => {
    const necro = actor(
      makeCombatant({
        id: "necro",
        team: 0,
        attributeRanks: new Map([["necromancer.curses", 12]]),
      }),
      ["necromancer.enfeeble"],
    );
    const foe = actor(makeCombatant({ id: "foe", team: 1 }), [], 300);

    expect(tryCast(necro, "necromancer.enfeeble", foe)).toBeUndefined();
    for (let i = 0; i < 10; i += 1) {
      tick(necro, foe);
    }

    expect(foe.combatant.statuses.active.map((s) => [s.id, s.remainingSeconds])).toEqual([
      ["weakness", 26],
    ]);
  });

  it("a dead caster cannot act", () => {
    const ele = actor(makeCombatant({ id: "ele", team: 0, dead: true }), ["elementalist.fireball"]);
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 100);
    expect(tryCast(ele, "elementalist.fireball", victim)).toBe("caster-dead");
  });

  it("an adrenaline skill is gated on its own strikes, not energy: Backbreaker needs 9 (#463)", () => {
    const warrior = actor(
      makeCombatant({
        id: "war",
        team: 0,
        energy: 100,
        maxEnergy: 100,
        adrenaline: new Map([["warrior.backbreaker", 8 * ADRENALINE_PER_STRIKE]]),
        equipment: HAMMER,
      }),
      ["warrior.backbreaker"],
    );
    const victim = actor(makeCombatant({ id: "victim", team: 1 }), [], 20);

    expect(tryCast(warrior, "warrior.backbreaker", victim)).toBe("insufficient-adrenaline");

    warrior.combatant.adrenaline.set("warrior.backbreaker", 9 * ADRENALINE_PER_STRIKE);
    expect(tryCast(warrior, "warrior.backbreaker", victim)).toBeUndefined();
    expect(warrior.combatant.adrenaline.get("warrior.backbreaker")).toBe(0);
  });

  it("melee range is genuinely short: a melee skill fails at spell range", () => {
    const warrior = actor(makeCombatant({ id: "war", team: 0, equipment: HAMMER }), [
      "warrior.backbreaker",
    ]);
    chargeAdrenaline(warrior.combatant, "warrior.backbreaker");
    const far = actor(makeCombatant({ id: "far", team: 1 }), [], 300);
    expect(tryCast(warrior, "warrior.backbreaker", far)).toBe("out-of-range");
  });
});

describe("skill attribute ownership", () => {
  it("links every linked skill to a real attribute of its own profession", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      if (skill.attributeId === undefined) {
        continue;
      }
      expect(
        getAttribute(skill.attributeId)?.professionId,
        `${skill.id} -> ${skill.attributeId}`,
      ).toBe(skill.profession);
    }
  });

  it("scales a skill only with its own attribute, and a No Attribute skill not at all", () => {
    // An unlinked skill's numbers are GW1's rank-0 ones (#445).
    for (const skill of IMPLEMENTED_SKILLS) {
      const scaled = [
        skill.attack?.bonusDamage,
        ...skill.effects.flatMap((effect) => ("amount" in effect ? [effect.amount] : [])),
      ].flatMap((magnitude) =>
        magnitude !== undefined && "scaling" in magnitude ? [magnitude.scaling.attributeId] : [],
      );
      for (const attributeId of scaled) {
        expect(attributeId, skill.id).toBe(skill.attributeId);
      }
    }
  });

  it("gives a Common skill no attribute (#474)", () => {
    const common = IMPLEMENTED_SKILLS.filter((skill) => skill.profession === "common");
    expect(common.map((skill) => skill.id)).toEqual(["common.resurrection-signet"]);
    for (const skill of common) {
      expect(skill.attributeId, skill.id).toBeUndefined();
    }
  });

  it("has Distracting Blow as a warrior skill with no attribute (#445)", () => {
    const blow = getSkill("warrior.distracting-blow");
    expect(blow?.profession).toBe("warrior");
    expect(blow?.attributeId).toBeUndefined();
  });

  it("names the attribute explicitly rather than leaving it inferable", () => {
    // Broad Head Arrow has no attribute-scaled effect at all, so an
    // inference-based approach would have made it equippable by every
    // profession. This pins the explicit field that replaced it.
    const bha = getSkill("ranger.broad-head-arrow");
    expect(bha?.attributeId).toBe("ranger.marksmanship");
    expect(bha?.effects.some((e) => "amount" in e)).toBe(false);
  });
});

describe("skill types", () => {
  it("names each skill's kind the way GW1 does, one of each", () => {
    const typeOf = (id: string) => getSkill(id)?.type;
    expect(typeOf("ranger.broad-head-arrow")).toBe("attack");
    expect(typeOf("elementalist.fireball")).toBe("spell");
    expect(typeOf("elementalist.armor-of-earth")).toBe("enchantment");
    expect(typeOf("necromancer.faintheartedness")).toBe("hex");
    expect(typeOf("necromancer.malaise")).toBe("hex");
    expect(typeOf("necromancer.enfeeble")).toBe("spell");
    expect(typeOf("necromancer.blood-ritual")).toBe("enchantment");
    expect(typeOf("ranger.troll-unguent")).toBe("skill");
  });

  it("has the three pet attacks of the corpus (#1046): the owner pays, the pet strikes", () => {
    const pet = (id: string) => {
      const found = getSkill(id);
      return {
        type: found?.type,
        cost: found?.cost,
        recharge: found?.rechargeSeconds,
        target: found?.target,
        attack: found?.attack,
        bonus: found?.petAttack?.bonusDamage,
      };
    };
    const beastMastery = (atZero: number, atTwelve: number) => ({
      scaling: { attributeId: "ranger.beast-mastery", atZero, atTwelve },
    });
    const energy = (amount: number) => ({ kind: "energy", amount });
    const common = { type: "pet-attack", target: "companion", attack: undefined };
    expect(pet("ranger.brutal-strike")).toEqual({
      ...common,
      cost: energy(10),
      recharge: 5,
      bonus: beastMastery(5, 29),
    });
    expect(getSkill("ranger.brutal-strike")?.petAttack?.conditionalBonus).toEqual({
      condition: { kind: "target-health-below", fraction: 0.5 },
      amount: beastMastery(5, 29),
    });
    expect(pet("ranger.maiming-strike")).toEqual({
      ...common,
      cost: energy(10),
      recharge: 5,
      bonus: beastMastery(5, 17),
    });
    expect(pet("ranger.disrupting-lunge")).toEqual({
      ...common,
      cost: energy(5),
      recharge: 10,
      bonus: beastMastery(1, 9.8),
    });
  });

  it("has the calls and bonds on the pet (#1108): a living pet's, within reach of it", () => {
    const call = (id: string) => {
      const found = getSkill(id);
      return {
        type: found?.type,
        cost: found?.cost,
        recharge: found?.rechargeSeconds,
        target: found?.target,
        range: found?.range,
        effects: found?.effects,
      };
    };
    const energy = (amount: number) => ({ kind: "energy", amount });
    const common = { type: "shout", target: "living-companion", range: PET_REACH };
    const status = (statusId: string, durationSeconds: Magnitude) => [
      { kind: "apply-status", statusId, durationSeconds },
    ];
    expect(call("ranger.call-of-haste")).toEqual({
      ...common,
      cost: energy(10),
      recharge: 25,
      effects: status("call-of-haste", { flat: 30 }),
    });
    expect(call("ranger.call-of-protection")).toEqual({
      ...common,
      cost: energy(5),
      recharge: 90,
      effects: status("call-of-protection", { flat: 120 }),
    });
    expect(call("ranger.symbiotic-bond")).toEqual({
      ...common,
      cost: energy(10),
      recharge: 55,
      effects: status("symbiotic-bond", {
        scaling: { attributeId: "ranger.beast-mastery", atZero: 120, atTwelve: 264 },
      }),
    });
    expect(getSkill("ranger.revive-animal")).toMatchObject({
      type: "skill",
      target: "self",
      cost: energy(5),
      activationSeconds: 0.25,
      rechargeSeconds: 5,
      effects: [
        {
          kind: "resurrect-companions",
          radius: AREA_NEARBY,
          healthPercent: {
            scaling: { attributeId: "ranger.beast-mastery", atZero: 10, atTwelve: 77.2 },
          },
        },
      ],
    });
  });
});
