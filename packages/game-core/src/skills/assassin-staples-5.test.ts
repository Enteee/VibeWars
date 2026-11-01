import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, stateHolds, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { ChainRole, Combatant, Skill } from "./types.js";
import { resolveAttackSkillOutcome } from "./weapon-attack.js";

/**
 * Assassin staples 5 (#1757): Desperate Strike, Repeating Strike, Impale,
 * Siphon Speed and Way of the Fox, and the two conditions they need:
 * `caster-health-below` and `target-chain-mark`. Numbers are the corpus's
 * at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([
  ["assassin.dagger-mastery", 12],
  ["assassin.deadly-arts", 12],
  ["assassin.shadow-arts", 12],
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

/** A dagger Assassin at `health` of 100. */
function assassin(health = 100): Combatant {
  return makeCombatant({
    id: "a",
    team: 0,
    energy: 10,
    health,
    maxHealth: 100,
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

/** `caster`'s mark of `role` on `target`, as if its chain led there. */
function marked(caster: Combatant, target: Combatant, role: ChainRole): Combatant {
  caster.chainMarks.set(target.id, { role, remainingSeconds: 10 });
  return caster;
}

/** `target` blocks 75% of attacks. */
function guarded(target: Combatant): Combatant {
  target.statuses.apply("critical-defenses", 10, target.id, NO_RANKS);
  return target;
}

/** `caster` attacks `target` with attack skill `skillId`. */
function attack(skillId: string, caster: Combatant, target: Combatant, rng = steady()) {
  return resolveAttackSkillOutcome(
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
function land(skillId: string, caster: Combatant, target: Combatant) {
  return resolveSkillEffects({
    skill: skill(skillId),
    caster,
    targets: [target],
    rng: steady(),
    rules: RULES,
    surroundings: new Map(),
  });
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

/** A plain dagger blow's damage under `steady`: Jagged Strike's. */
function plainBlow(): number {
  const [blow] = damageTo(attack("assassin.jagged-strike", assassin(), body("f")).events, "f");
  return blow ?? 0;
}

describe("the five are the corpus's (#1757)", () => {
  it.each([
    ["assassin.desperate-strike", 948, "attack", "dagger-mastery", 0, 6, RANGE_MELEE],
    ["assassin.repeating-strike", 976, "attack", "dagger-mastery", 0, 0, RANGE_MELEE],
    ["assassin.impale", 1033, "skill", "deadly-arts", 1, 15, RANGE_MELEE],
    ["assassin.siphon-speed", 951, "hex", "deadly-arts", 1, 30, RANGE_SPELL],
    ["assassin.way-of-the-fox", 949, "enchantment", "shadow-arts", 0.25, 30, RANGE_SPELL],
  ] as const)(
    "%s: gwId %i, %s, %s, 5 energy, %d s, %i s recharge",
    (id, gwId, type, attribute, activation, recharge, range) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite: false,
        attributeId: `assassin.${attribute}`,
        cost: { kind: "energy", amount: 5 },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
      });
    },
  );

  it("names what each does in its text", () => {
    const text = (id: string) =>
      describeSkill(skill(id), RANKS)
        .effects.map(({ text: line }) => line)
        .join(" | ");
    expect(text("assassin.desperate-strike")).toContain("If you have less than 74% Health");
    expect(text("assassin.desperate-strike")).toContain("51");
    expect(text("assassin.repeating-strike")).toContain("15");
    expect(text("assassin.impale")).toContain("If it follows a dual attack");
    expect(text("assassin.impale")).toContain("85");
    expect(text("assassin.siphon-speed")).toContain("33%");
    expect(text("assassin.way-of-the-fox")).toContain("5");
  });
});

describe("caster-health-below (#1757)", () => {
  const below = { kind: "caster-health-below", fraction: 0.74 } as const;

  it("holds at 73% and not at 74%", () => {
    expect(stateHolds(below, assassin(73), body("f"), new Map())).toBe(true);
    expect(stateHolds(below, assassin(74), body("f"), new Map())).toBe(false);
  });

  it("reads the caster, not the target", () => {
    const foe = body("f");
    foe.health = 1;
    expect(stateHolds(below, assassin(100), foe, new Map())).toBe(false);
  });
});

describe("target-chain-mark (#1757)", () => {
  const dual = { kind: "target-chain-mark", role: "dual" } as const;

  it("holds only for the caster's own mark of that role", () => {
    const caster = assassin();
    const other = assassin();
    const foe = body("f");
    expect(stateHolds(dual, caster, foe, new Map())).toBe(false);
    marked(caster, foe, "off-hand");
    expect(stateHolds(dual, caster, foe, new Map())).toBe(false);
    marked(other, foe, "dual");
    expect(stateHolds(dual, caster, foe, new Map())).toBe(false);
    marked(caster, foe, "dual");
    expect(stateHolds(dual, caster, foe, new Map())).toBe(true);
  });
});

describe("Desperate Strike (#1757)", () => {
  it("strikes for +51 below 74% Health, and for a plain blow at 74%", () => {
    const [low] = damageTo(
      attack("assassin.desperate-strike", assassin(73), body("f")).events,
      "f",
    );
    const [high] = damageTo(
      attack("assassin.desperate-strike", assassin(74), body("f")).events,
      "f",
    );
    expect(high).toBe(plainBlow());
    expect(low).toBe(plainBlow() + 51);
  });

  it("is a lead attack: it leaves a lead mark", () => {
    const caster = assassin();
    attack("assassin.desperate-strike", caster, body("f"));
    expect(caster.chainMarks.get("f")?.role).toBe("lead");
  });
});

describe("Repeating Strike (#1757)", () => {
  it("follows an off-hand attack and strikes for +26, recharging as usual", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "off-hand");
    const outcome = attack("assassin.repeating-strike", caster, foe);
    expect(damageTo(outcome.events, "f")).toEqual([plainBlow() + 26]);
    expect(outcome.rechargeLongerSeconds).toBe(0);
    expect(caster.chainMarks.get("f")?.role).toBe("off-hand");
  });

  it("takes 15 s more to recharge when blocked", () => {
    const caster = assassin();
    const foe = guarded(body("f"));
    marked(caster, foe, "off-hand");
    const outcome = attack("assassin.repeating-strike", caster, foe, blocking());
    expect(damageTo(outcome.events, "f")).toEqual([]);
    expect(outcome.rechargeLongerSeconds).toBe(15);
  });

  it("takes 15 s more to recharge out of sequence, a miss as well", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "lead");
    const outcome = attack("assassin.repeating-strike", caster, foe);
    expect(missed(outcome.events, "f")).toBe(true);
    expect(damageTo(outcome.events, "f")).toEqual([]);
    expect(outcome.rechargeLongerSeconds).toBe(15);
  });
});

describe("Impale (#1757)", () => {
  it("after a dual attack: 85 earth damage and a 17 s Deep Wound, and the mark stays", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "dual");
    const { events } = land("assassin.impale", caster, foe);
    expect(damageTo(events, "f")).toHaveLength(1);
    expect(foe.statuses.get("deep-wound")?.remainingSeconds).toBe(17);
    expect(caster.chainMarks.get("f")?.role).toBe("dual");
  });

  it("deals earth damage: armor counts, so it is no more than 85", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "dual");
    const [packet] = damageTo(land("assassin.impale", caster, foe).events, "f");
    expect(packet).toBeGreaterThan(0);
    expect(packet).toBeLessThanOrEqual(85);
  });

  it("without the dual mark does nothing", () => {
    const caster = assassin();
    const foe = body("f");
    marked(caster, foe, "off-hand");
    const { events } = land("assassin.impale", caster, foe);
    expect(damageTo(events, "f")).toEqual([]);
    expect(foe.statuses.has("deep-wound")).toBe(false);
  });
});

describe("Siphon Speed (#1757)", () => {
  it("slows the foe 33% and hastes the caster 33% for 13 s, each its own status", () => {
    const caster = assassin();
    const foe = body("f");
    land("assassin.siphon-speed", caster, foe);
    expect(foe.statuses.get("siphon-speed")?.remainingSeconds).toBe(13);
    expect(caster.statuses.get("siphon-speed-haste")?.remainingSeconds).toBe(13);
    expect(getStatusDefinition("siphon-speed")).toMatchObject({
      category: "hex",
      moveSpeedMultiplier: 0.67,
    });
    expect(getStatusDefinition("siphon-speed-haste").moveSpeedMultiplier).toBe(1.33);
    // The haste stays when the hex is removed.
    foe.statuses.removeByCategory("hex");
    expect(caster.statuses.has("siphon-speed-haste")).toBe(true);
  });

  it("recharges 50% faster on a moving foe, and as usual on a still one", () => {
    const still = body("f");
    expect(land("assassin.siphon-speed", assassin(), still).rechargeFraction).toBe(0);
    const moving = body("g");
    moving.moving = true;
    expect(land("assassin.siphon-speed", assassin(), moving).rechargeFraction).toBe(0.5);
  });
});

describe("Way of the Fox (#1757)", () => {
  it("makes the next 5 attacks unblockable for 30 s", () => {
    const caster = assassin();
    land("assassin.way-of-the-fox", caster, caster);
    expect(caster.statuses.get("way-of-the-fox")).toMatchObject({
      remainingSeconds: 30,
      unblockableLeft: 5,
    });
    const foe = guarded(body("f"));
    for (let blow = 1; blow <= 5; blow += 1) {
      const { events } = attack("assassin.jagged-strike", caster, foe, blocking());
      expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
    }
    expect(caster.statuses.has("way-of-the-fox")).toBe(false);
    const { events } = attack("assassin.jagged-strike", caster, foe, blocking());
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(true);
  });
});
