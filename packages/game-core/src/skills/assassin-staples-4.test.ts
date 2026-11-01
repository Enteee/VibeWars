import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";
import { NO_RANKS } from "./status.js";

/**
 * Assassin staples 4 (#1637): Black Mantis Thrust, Black Spider Strike,
 * Golden Fox, Golden Fang, Lotus, Falling Lotus and Nine Tail Strike,
 * Disrupting Stab, Temple Strike, Vampiric and Shattering Assault, and
 * Signet of Shadows. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["assassin.dagger-mastery", 12],
  ["assassin.deadly-arts", 12],
  ["assassin.critical-strikes", 12],
]);

/** A float stream of 0.9: no crit, no block, no blind miss. */
const steady = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.9 });

/** A float stream of 0.5: a 75% block blocks. */
const blocking = (): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.5 });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function assassin(): Combatant {
  return makeCombatant({
    id: "a",
    team: 0,
    energy: 10,
    health: 100,
    equipment: {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.daggers,
        attributeId: "assassin.dagger-mastery",
        damageType: WEAPONS.daggers.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    },
    attributeRanks: RANKS,
  });
}

const body = (id: string): Combatant => makeCombatant({ id, team: 1, health: 1e6, maxHealth: 1e6 });

/** An enchantment on `caster`. */
function enchant(caster: Combatant): Combatant {
  caster.statuses.apply("mystic-regeneration", 15, caster.id, NO_RANKS);
  return caster;
}

/** A Mesmer hex on `target`. */
function hex(target: Combatant): Combatant {
  target.statuses.apply("empathy", 10, "x", NO_RANKS);
  return target;
}

/** `target` blocks 75% of attacks. */
function guarded(target: Combatant): Combatant {
  target.statuses.apply("critical-defenses", 10, target.id, NO_RANKS);
  return target;
}

/** `target` is casting `skillId`, with time left to cut. */
function casting(target: Combatant, skillId: string): Combatant {
  target.cast.beginCast(skillId, undefined, 3, undefined);
  return target;
}

/** `caster`'s mark of `role` on `target`, as if its chain led there. */
function marked(caster: Combatant, target: Combatant, role: "lead" | "off-hand"): Combatant {
  caster.chainMarks.set(target.id, { role, remainingSeconds: 10 });
  return caster;
}

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(
  skillId: string,
  caster: Combatant,
  target: Combatant,
  rng: SimulationRng = steady(),
): CombatEvent[] {
  return resolveAttackSkill(
    {
      skill: skill(skillId),
      caster,
      targets: [target],
      rng,
      rules: RULES,
      surroundings: new Map(),
    },
    () => false,
    [],
  );
}

/** `caster`'s non-attack skill `skillId` lands on `target`. */
function land(skillId: string, caster: Combatant, target: Combatant): CombatEvent[] {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  }).events;
}

const damageTo = (events: readonly CombatEvent[], targetId: string): number[] =>
  events.flatMap((event) =>
    event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
  );

const missed = (events: readonly CombatEvent[], targetId: string): boolean =>
  events.some(
    (event) =>
      event.kind === "attack-missed" &&
      event.targetId === targetId &&
      event.reason === "out-of-sequence",
  );

const blockedCount = (events: readonly CombatEvent[]): number =>
  events.filter((event) => event.kind === "attack-blocked").length;

const secondsOf = (target: Combatant, statusId: string): number | undefined =>
  [...target.statuses.active].find((status) => status.id === statusId)?.remainingSeconds;

/** A plain dagger blow's damage under `steady`: Fox Fangs' without its bonus. */
function plainBlow(): number {
  const caster = assassin();
  const foe = body("f");
  marked(caster, foe, "lead");
  const [blow] = damageTo(attack("assassin.fox-fangs", caster, foe), foe.id);
  return (blow ?? 0) - 22;
}

describe("the twelve are the corpus's (#1637)", () => {
  it.each([
    ["assassin.black-mantis-thrust", 1024, false, "dagger-mastery", 5, 1, 6],
    ["assassin.black-spider-strike", 1636, false, "dagger-mastery", 5, 0, 8],
    ["assassin.golden-fox-strike", 1637, false, "dagger-mastery", 5, 0, 4],
    ["assassin.golden-fang-strike", 1988, false, "dagger-mastery", 5, 0, 4],
    ["assassin.lotus-strike", 1987, false, "dagger-mastery", 10, 0, 12],
    ["assassin.falling-lotus-strike", 1990, false, "dagger-mastery", 5, 0, 8],
    ["assassin.nine-tail-strike", 986, false, "dagger-mastery", 5, 0, 8],
    ["assassin.disrupting-stab", 1025, false, "dagger-mastery", 5, 0, 10],
    ["assassin.temple-strike", 988, true, "dagger-mastery", 15, 0, 20],
    ["assassin.vampiric-assault", 1986, false, "deadly-arts", 5, 0, 8],
    ["assassin.shattering-assault", 1634, true, "critical-strikes", 10, 0, 6],
  ] as const)(
    "%s: gwId %i, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, elite, attribute, energy, activation, recharge) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type: "attack",
        elite,
        attributeId: `assassin.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_MELEE,
        attack: { weapon: "daggers", weaponDamage: 1 },
      });
    },
  );

  it("Signet of Shadows: gwId 876, a free signet, 1 s, 15 s recharge", () => {
    expect(skill("assassin.signet-of-shadows")).toMatchObject({
      gwId: 876,
      type: "signet",
      elite: false,
      attributeId: "assassin.deadly-arts",
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 15,
      range: RANGE_SPELL,
    });
  });
});

describe("Black Mantis Thrust", () => {
  it("strikes for +18 and opens a chain; cripples only a hexed foe, for 13 s", () => {
    const caster = assassin();
    const clean = body("c");
    expect(damageTo(attack("assassin.black-mantis-thrust", caster, clean), clean.id)).toEqual([
      plainBlow() + 18,
    ]);
    expect(caster.chainMarks.get(clean.id)?.role).toBe("lead");
    expect(secondsOf(clean, "crippled")).toBeUndefined();
    const hexed = hex(body("h"));
    attack("assassin.black-mantis-thrust", assassin(), hexed);
    expect(secondsOf(hexed, "crippled")).toBe(13);
  });
});

describe("Black Spider Strike", () => {
  it("misses an unhexed foe out of sequence", () => {
    const caster = assassin();
    const foe = body("f");
    const events = attack("assassin.black-spider-strike", caster, foe);
    expect(missed(events, foe.id)).toBe(true);
    expect(secondsOf(foe, "poison")).toBeUndefined();
  });

  it("needs no lead: strikes a hexed foe for +17 and poisons it for 17 s", () => {
    const caster = assassin();
    const foe = hex(body("f"));
    expect(damageTo(attack("assassin.black-spider-strike", caster, foe), foe.id)).toEqual([
      plainBlow() + 17,
    ]);
    expect(secondsOf(foe, "poison")).toBe(17);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("off-hand");
  });
});

describe("Golden Fox Strike", () => {
  it("strikes for +26 and opens a chain", () => {
    const caster = assassin();
    const foe = body("f");
    expect(damageTo(attack("assassin.golden-fox-strike", caster, foe), foe.id)).toEqual([
      plainBlow() + 26,
    ]);
    expect(caster.chainMarks.get(foe.id)?.role).toBe("lead");
  });

  it("is blocked unenchanted, and not while enchanted", () => {
    const bare = guarded(body("b"));
    expect(blockedCount(attack("assassin.golden-fox-strike", assassin(), bare, blocking()))).toBe(
      1,
    );
    const foe = guarded(body("f"));
    const events = attack("assassin.golden-fox-strike", enchant(assassin()), foe, blocking());
    expect(blockedCount(events)).toBe(0);
    expect(damageTo(events, foe.id)).toHaveLength(1);
  });
});

describe("Golden Fang Strike", () => {
  it("misses without a lead", () => {
    const foe = body("f");
    expect(missed(attack("assassin.golden-fang-strike", enchant(assassin()), foe), foe.id)).toBe(
      true,
    );
  });

  it("unenchanted, a plain off-hand blow; enchanted, a 17 s Deep Wound", () => {
    const foe = body("f");
    const bare = marked(assassin(), foe, "lead");
    expect(damageTo(attack("assassin.golden-fang-strike", bare, foe), foe.id)).toEqual([
      plainBlow(),
    ]);
    expect(secondsOf(foe, "deep-wound")).toBeUndefined();
    expect(bare.chainMarks.get(foe.id)?.role).toBe("off-hand");
    const wounded = body("w");
    attack("assassin.golden-fang-strike", marked(enchant(assassin()), wounded, "lead"), wounded);
    expect(secondsOf(wounded, "deep-wound")).toBe(17);
  });
});

describe("Lotus Strike", () => {
  it("after a lead, strikes for +22 and gives 17 energy", () => {
    const foe = body("f");
    const caster = marked(assassin(), foe, "lead");
    expect(damageTo(attack("assassin.lotus-strike", caster, foe), foe.id)).toEqual([
      plainBlow() + 22,
    ]);
    expect(caster.energy).toBe(10 + 17);
  });
});

describe("Falling Lotus Strike", () => {
  it("misses a standing foe; strikes a knocked-down one for +31 and gives 10 energy", () => {
    const standing = body("s");
    const first = assassin();
    expect(missed(attack("assassin.falling-lotus-strike", first, standing), standing.id)).toBe(
      true,
    );
    expect(first.energy).toBe(10);
    const down = body("d");
    down.knockdownRemaining = 2;
    const caster = assassin();
    expect(damageTo(attack("assassin.falling-lotus-strike", caster, down), down.id)).toEqual([
      plainBlow() + 31,
    ]);
    expect(caster.energy).toBe(10 + 10);
  });
});

describe("Nine Tail Strike", () => {
  it("after an off-hand, strikes twice for +35 each, through a block", () => {
    const foe = guarded(body("f"));
    const caster = marked(assassin(), foe, "off-hand");
    const events = attack("assassin.nine-tail-strike", caster, foe, blocking());
    expect(blockedCount(events)).toBe(0);
    expect(damageTo(events, foe.id)).toHaveLength(2);
  });

  it("strikes for +35 a blow", () => {
    const foe = body("f");
    const caster = marked(assassin(), foe, "off-hand");
    expect(damageTo(attack("assassin.nine-tail-strike", caster, foe), foe.id)).toEqual([
      plainBlow() + 35,
      plainBlow() + 35,
    ]);
  });
});

describe("Disrupting Stab", () => {
  it("cuts a spell and disables it for 9 s", () => {
    const foe = casting(body("f"), "elementalist.fireball");
    const events = attack("assassin.disrupting-stab", assassin(), foe);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(events).toContainEqual({
      kind: "skill-disabled",
      targetId: foe.id,
      skillId: "elementalist.fireball",
      seconds: 9,
    });
  });

  it("cuts an attack skill and disables nothing", () => {
    const foe = casting(body("f"), "warrior.hamstring");
    const events = attack("assassin.disrupting-stab", assassin(), foe);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
  });
});

describe("Temple Strike", () => {
  it("after a lead, cuts a spell, and dazes and blinds for 8 s", () => {
    const foe = casting(body("f"), "elementalist.fireball");
    attack("assassin.temple-strike", marked(assassin(), foe, "lead"), foe);
    expect(foe.cast.activeCast).toBeUndefined();
    expect(secondsOf(foe, "dazed")).toBe(8);
    expect(secondsOf(foe, "blind")).toBe(8);
  });

  it("dazes and blinds a foe that is not casting, and leaves an attack skill be", () => {
    const idle = body("i");
    attack("assassin.temple-strike", marked(assassin(), idle, "lead"), idle);
    expect(secondsOf(idle, "dazed")).toBe(8);
    expect(secondsOf(idle, "blind")).toBe(8);
    const swinging = casting(body("s"), "warrior.hamstring");
    attack("assassin.temple-strike", marked(assassin(), swinging, "lead"), swinging);
    expect(swinging.cast.activeCast?.skillId).toBe("warrior.hamstring");
  });
});

describe("Vampiric Assault", () => {
  const stolen = (events: readonly CombatEvent[]): number[] =>
    events.flatMap((event) => (event.kind === "life-stolen" ? [event.amount] : []));

  it("after an off-hand, steals 34 with each of two blows", () => {
    const foe = body("f");
    const caster = marked(assassin(), foe, "off-hand");
    expect(stolen(attack("assassin.vampiric-assault", caster, foe))).toEqual([34, 34]);
  });

  it("steals nothing with a blocked blow", () => {
    const foe = guarded(body("f"));
    const caster = marked(assassin(), foe, "off-hand");
    const events = attack("assassin.vampiric-assault", caster, foe, blocking());
    expect(blockedCount(events)).toBe(2);
    expect(stolen(events)).toEqual([]);
  });
});

describe("Shattering Assault", () => {
  it("after an off-hand, strikes twice for +41, unblockable, an enchantment off per blow", () => {
    // Critical Defenses blocks, and is itself the second enchantment.
    const foe = guarded(body("f"));
    foe.statuses.apply("mystic-regeneration", 15, foe.id, NO_RANKS);
    const caster = marked(assassin(), foe, "off-hand");
    const events = attack("assassin.shattering-assault", caster, foe, blocking());
    expect(blockedCount(events)).toBe(0);
    expect(damageTo(events, foe.id)).toHaveLength(2);
    expect(foe.statuses.active).toEqual([]);
  });
});

describe("Signet of Shadows", () => {
  it("deals 29, or one packet of 80 to a Blind foe", () => {
    expect(damageTo(land("assassin.signet-of-shadows", assassin(), body("c")), "c")).toEqual([29]);
    const blind = body("b");
    blind.statuses.apply("blind", 10, "x", NO_RANKS);
    expect(damageTo(land("assassin.signet-of-shadows", assassin(), blind), "b")).toEqual([80]);
  });
});
