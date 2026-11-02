import { describe, expect, it } from "vitest";

import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { effectiveArmor, mitigate, type DamagePacket } from "../skills/damage.js";
import type { CombatEvent } from "../skills/effects.js";
import { effectiveMaxEnergy } from "../skills/overcast.js";
import { NO_RANKS } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { advanceStatuses, effectiveMaxHealth } from "../skills/tick.js";
import type { Combatant } from "../skills/types.js";
import { resolveSwing } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import { defaultEquipmentFor } from "./loadout.js";
import { NO_UPGRADES } from "./mods.js";
import type { OffhandId } from "./offhands.js";
import { resolveLoadout } from "./resolve.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;

/** Set 1 of a rank-12 warrior: a sword inscribed with `inscription`, or a wand and `offhand` carrying `offhandMods`. */
function held(
  mods: { inscription?: string; offhand?: OffhandId; offhandMods?: Partial<typeof NO_UPGRADES> },
  weaponId: "sword" | "wand" = mods.offhand === undefined ? "sword" : "wand",
) {
  return resolveLoadout(
    {
      primaryProfession: "warrior",
      secondaryProfession: undefined,
      allocatedRanks: new Map([["warrior.swordsmanship", 12]]),
      equipment: {
        ...defaultEquipmentFor("warrior"),
        weaponSets: [
          {
            mainHand: {
              weaponId,
              requirementAttributeId: null,
              upgrades: { ...NO_UPGRADES, inscription: mods.inscription ?? null },
            },
            offHand:
              mods.offhand === undefined
                ? null
                : {
                    offhandId: mods.offhand,
                    requirementAttributeId: null,
                    upgrades: { ...NO_UPGRADES, ...mods.offhandMods },
                  },
          },
          null,
          null,
          null,
        ],
      },
    },
    RULES.combat,
  ).weaponSets[0];
}

/** Someone holding `set`, at full Health. */
function bearer(set: ReturnType<typeof held>, id = "bearer"): Combatant {
  return makeCombatant({
    id,
    team: 0,
    equipment: set.equipment,
    attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    maxHealth: set.maxHealth,
    health: set.maxHealth,
    maxEnergy: set.maxEnergy,
    energy: set.maxEnergy,
  });
}

/** Floats in order, then 0.5 forever; every damage roll 100, so a percentage comes out whole. */
const scripted = (...floats: number[]): SimulationRng =>
  Object.assign(createRng(1), {
    nextInt: () => 100,
    nextFloat: () => floats.shift() ?? 0.5,
  });

/** What one plain swing of `who`'s deals to a fresh dummy, hexed if `hexed`. */
function swingDamage(who: Combatant, hexed = false): number {
  const dummy = makeCombatant({ id: "dummy", team: 1, health: 1e6, maxHealth: 1e6 });
  if (hexed) {
    dummy.statuses.apply("imagined-burden", 1e6, "someone", NO_RANKS);
  }
  const events: readonly CombatEvent[] = resolveSwing({
    attacker: who,
    target: { combatant: dummy, position: vec2(40, 0), creature: undefined },
    surroundings: new Map(),
    rng: scripted(),
    rules: RULES.combat,
    exposed: () => false,
  }).events;
  return events.reduce((sum, event) => sum + (event.kind === "damage" ? event.amount : 0), 0);
}

describe("conditional weapon mods (#2010)", () => {
  const plain = swingDamage(bearer(held({})));

  it("Strength and Honor adds 15% above half Health, and nothing at exactly half", () => {
    const honored = bearer(held({ inscription: "strength-and-honor" }));
    honored.health = Math.floor(honored.maxHealth * 0.51);
    expect(swingDamage(honored)).toBeCloseTo(plain * 1.15, 6);
    honored.health = honored.maxHealth / 2;
    expect(swingDamage(honored)).toBeCloseTo(plain, 6);
  });

  it("Vengeance is Mine adds 20% only below half Health", () => {
    const vengeful = bearer(held({ inscription: "vengeance-is-mine" }));
    expect(swingDamage(vengeful)).toBeCloseTo(plain, 6);
    vengeful.health = Math.floor(vengeful.maxHealth * 0.49);
    expect(swingDamage(vengeful)).toBeCloseTo(plain * 1.2, 6);
  });

  it("waits on an enchantment, a stance, a hex on the wielder, and a hexed target", () => {
    for (const [inscription, statusId, increase] of [
      ["guided-by-fate", "mending", 0.15],
      ["dance-with-death", "balanced-stance", 0.15],
      ["dont-fear-the-reaper", "imagined-burden", 0.2],
    ] as const) {
      const wielder = bearer(held({ inscription }));
      expect(swingDamage(wielder)).toBeCloseTo(plain, 6);
      wielder.statuses.apply(statusId, 1e6, "someone", NO_RANKS);
      expect(swingDamage(wielder)).toBeCloseTo(plain * (1 + increase), 6);
    }
    const informed = bearer(held({ inscription: "too-much-information" }));
    expect(swingDamage(informed)).toBeCloseTo(plain, 6);
    expect(swingDamage(informed, true)).toBeCloseTo(plain * 1.15, 6);
  });

  it("To the Pain! adds 15% always, and costs 10 armor only while attacking", () => {
    const pained = bearer(held({ inscription: "to-the-pain" }));
    expect(swingDamage(pained)).toBeCloseTo(plain * 1.15, 6);
    const hit: DamagePacket = {
      armored: 50,
      armorIgnoring: 0,
      type: "slashing",
      source: "weapon",
      armorPenetration: 0,
    };
    const resting = effectiveArmor(pained, hit, null);
    pained.attack = { targetId: "dummy", swingElapsed: 0, unreachableSeconds: 0 };
    expect(effectiveArmor(pained, hit, null)).toBe(resting - 10);
  });

  it("Luck of the Draw takes 5 off a physical hit on a 20% roll, and draws for nothing else", () => {
    const lucky = bearer(
      held({ offhand: "shield", offhandMods: { inscription: "luck-of-the-draw" } }),
    );
    const hit = (type: "slashing" | "fire"): DamagePacket => ({
      armored: 50,
      armorIgnoring: 0,
      type,
      source: "weapon",
      armorPenetration: 0,
    });
    const unlucky = mitigate(hit("slashing"), lucky, RULES.combat, null, scripted(0.2));
    expect(mitigate(hit("slashing"), lucky, RULES.combat, null, scripted(0.19))).toBeCloseTo(
      unlucky - 5,
      6,
    );
    let draws = 0;
    const counting = Object.assign(createRng(1), {
      nextFloat: () => {
        draws += 1;
        return 0;
      },
    });
    mitigate(hit("fire"), lucky, RULES.combat, null, counting);
    expect(draws).toBe(0);
  });

  it("of Devotion raises maximum Health 45 while enchanted, and takes it and the Health above back when it ends", () => {
    const devoted = bearer(held({ offhand: "focus", offhandMods: { suffix: "of-devotion" } }));
    const base = devoted.maxHealth;
    expect(effectiveMaxHealth(devoted)).toBe(base);
    devoted.statuses.apply("mending", 1, "someone", NO_RANKS);
    expect(effectiveMaxHealth(devoted)).toBe(base + 45);
    devoted.health = base + 45;
    advanceStatuses(devoted, 2, 0);
    expect(effectiveMaxHealth(devoted)).toBe(base);
    expect(devoted.health).toBe(base);
  });

  it("Knowing is Half the Battle adds 5 armor only while a spell activates", () => {
    const knowing = bearer(
      held({ offhand: "focus", offhandMods: { inscription: "knowing-is-half-the-battle" } }),
    );
    const hit: DamagePacket = {
      armored: 50,
      armorIgnoring: 0,
      type: "fire",
      source: "skill",
      armorPenetration: 0,
    };
    const idle = effectiveArmor(knowing, hit, null);
    knowing.cast.beginCast("elementalist.fireball", "x", 2, undefined);
    expect(effectiveArmor(knowing, hit, null)).toBe(idle + 5);
  });

  it("Hale and Hearty adds 5 maximum Energy above half Health, and loses what is over when it ends", () => {
    const hale = bearer(held({ inscription: "hale-and-hearty" }));
    const base = hale.maxEnergy;
    expect(effectiveMaxEnergy(hale)).toBe(base + 5);
    hale.energy = base + 5;
    hale.health = hale.maxHealth / 2;
    advanceStatuses(hale, 0.1, 0);
    expect(effectiveMaxEnergy(hale)).toBe(base);
    expect(hale.energy).toBe(base);
  });
});
