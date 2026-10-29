import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { effectiveArmor, skillDamage } from "../skills/damage.js";
import { describeSkill } from "../skills/describe.js";
import { applySkillEffects } from "../skills/effects.js";
import { aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveSwing } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * The Elementalist Water Magic staples in a match (#1367): the snares,
 * Ice Spear's overcast regeneration, Maelstrom's interrupting ground,
 * Blurred Vision's misses, Armor of Mist, and the two elites.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const WATER = "elementalist.water-magic";
const ICE_PRISON = 0;
const FROZEN_BURST = 1;
const ICE_SPEAR = 2;
const MAELSTROM = 3;
const BLURRED_VISION = 4;
const ARMOR_OF_MIST = 5;
const SHATTERSTONE = 6;
const MIND_FREEZE = 7;

const SWORD: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.sword,
    attributeId: "warrior.swordsmanship",
    damageType: WEAPONS.sword.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A rank-12 Water Magic Elementalist of team 1 with the eight. */
function elementalist(spawn: Vec2): ParticipantSpec {
  return {
    id: "n",
    team: 1,
    skillBar: [
      "elementalist.ice-prison",
      "elementalist.frozen-burst",
      "elementalist.ice-spear",
      "elementalist.maelstrom",
      "elementalist.blurred-vision",
      "elementalist.armor-of-mist",
      "elementalist.shatterstone",
      "elementalist.mind-freeze",
    ],
    attributeRanks: new Map([[WATER, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A foe of team 0 with a sword and `skillBar`, that stands still until asked. */
function foe(id: string, spawn: Vec2, skillBar: string[] = []): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar,
    attributeRanks: new Map(),
    equipment: SWORD,
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** The Elementalist at `at`, foe `a` at the origin, and whoever else is asked for. */
function sim(at: Vec2, ...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "elementalist-water",
    participants: [foe("a", vec2(0, 0)), elementalist(at), ...more],
  });
}

function get(match: MatchSimulation, id: string) {
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

/** `n` uses the skill in `slot` on `target`; what it did. */
function cast(match: MatchSimulation, slot: number, target: string): CombatLogEntry[] {
  match.setTarget("n", target);
  expect(match.requestSkill("n", slot)?.check).toEqual({ ok: true });
  return stepFor(match, 2.5).filter((entry) => entry.sourceId === "n");
}

/** Each damage event a skill dealt, its target and amount, in order. */
function damage(log: readonly CombatLogEntry[]): [string, number][] {
  return log.flatMap((entry) =>
    entry.skillId === undefined
      ? []
      : entry.events.flatMap((event): [string, number][] =>
          event.kind === "damage" ? [[event.targetId, event.amount]] : [],
        ),
  );
}

/** Whether `id` has `statusId` from `n` for at most `seconds` and more than 2.5 s less. */
function hasFor(match: MatchSimulation, id: string, statusId: string, seconds: number): void {
  const status = get(match, id).statuses.active.find((active) => active.id === statusId);
  expect(status?.sourceId, `${id} ${statusId}`).toBe("n");
  expect(status?.remainingSeconds, id).toBeGreaterThan(seconds - 2.5);
  expect(status?.remainingSeconds, id).toBeLessThanOrEqual(seconds);
}

/** `id`'s summed movement speed multiplier, before the clamp. */
function speed(match: MatchSimulation, id: string): number {
  return aggregateModifiers(get(match, id).statuses.active).moveSpeedMultiplier;
}

describe("Ice Prison and Frozen Burst (#1367)", () => {
  it("Ice Prison slows its target to 0.34 for 18 s", () => {
    const match = sim(vec2(300, 0));
    expect(damage(cast(match, ICE_PRISON, "a"))).toEqual([]);
    hasFor(match, "a", "ice-prison", 18);
    expect(speed(match, "a")).toBe(0.34);
    stepFor(match, 18);
    expect(speed(match, "a")).toBe(1);
  });

  it("Frozen Burst strikes a nearby foe for 70 and slows it 7 s, not one past nearby", () => {
    const match = sim(
      vec2(0, 30),
      foe("b", vec2(0, 30 + AREA_NEARBY - 5)),
      foe("d", vec2(0, 30 + AREA_NEARBY + 20)),
    );
    expect(damage(cast(match, FROZEN_BURST, "n")).sort()).toEqual([
      ["a", 70],
      ["b", 70],
    ]);
    for (const id of ["a", "b"]) {
      hasFor(match, id, "frozen-burst", 7);
      expect(speed(match, id)).toBe(0.34);
    }
    expect(get(match, "d").statuses.has("frozen-burst")).toBe(false);
    stepFor(match, 7);
    expect(speed(match, "a")).toBe(1);
  });
});

describe("Ice Spear (#1367)", () => {
  it("strikes for 50 and gives nothing while the caster is not overcast", () => {
    const match = sim(vec2(300, 0));
    expect(damage(cast(match, ICE_SPEAR, "a"))).toEqual([["a", 50]]);
    expect(get(match, "n").statuses.has("ice-spear")).toBe(false);
  });

  it("after a Maelstrom, gives its caster +3 regeneration for 5 s, once", () => {
    const match = sim(vec2(300, 0));
    cast(match, MAELSTROM, "a");
    expect(get(match, "n").overcast).toBeGreaterThan(0);
    const log = cast(match, ICE_SPEAR, "a").filter(
      (entry) => entry.skillId === "elementalist.ice-spear",
    );
    expect(damage(log)).toEqual([["a", 50]]);
    const gained = log.flatMap((entry) =>
      entry.events.filter(
        (event) => event.kind === "status-applied" && event.statusId === "ice-spear",
      ),
    );
    expect(gained).toHaveLength(1);
    hasFor(match, "n", "ice-spear", 5);
    expect(aggregateModifiers(get(match, "n").statuses.active).healthPips).toBe(3);
  });

  it("dodged, it deals nothing and gives nothing", () => {
    const match = sim(vec2(400, 0));
    get(match, "n").overcast = 10;
    match.setTarget("n", "a");
    expect(match.requestSkill("n", ICE_SPEAR)?.check).toEqual({ ok: true });
    const log = stepFor(match, 1 + 2 * DT);
    expect(match.projectiles.length).toBeGreaterThan(0);
    const dodger = match.get("a");
    if (dodger === undefined) {
      throw new Error("no participant a");
    }
    dodger.position = vec2(0, 300);
    log.push(...stepFor(match, 2));
    expect(damage(log)).toEqual([]);
    expect(get(match, "n").statuses.has("ice-spear")).toBe(false);
  });
});

describe("Maelstrom (#1367)", () => {
  it("interrupts a foe casting a spell in it, not one attacking", () => {
    // n stands beside a; d swings at n from inside the area, c casts at it.
    const match = sim(
      vec2(0, -30),
      foe("c", vec2(-20, 0), ["elementalist.meteor-shower"]),
      foe("d", vec2(20, 0)),
    );
    match.setTarget("c", "n");
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
    expect(match.requestAttack("d", "n")).toEqual({ ok: true });
    const log = cast(match, MAELSTROM, "a");
    const interrupted = log.flatMap((entry) =>
      entry.events.flatMap((event) => (event.kind === "interrupted" ? [event.targetId] : [])),
    );
    expect(interrupted).toEqual(["c"]);
    expect(get(match, "c").cast.activeCast).toBeUndefined();
    expect(get(match, "d").attack).toBeDefined();
  });

  it("strikes a foe who stays for 22 each second, ten times", () => {
    const match = sim(vec2(300, 0));
    const log = cast(match, MAELSTROM, "a");
    log.push(...stepFor(match, 10));
    expect(damage(log)).toEqual(Array.from({ length: 10 }, () => ["a", 22]));
  });

  it("stops striking a foe who stepped out", () => {
    const match = sim(vec2(300, 0));
    match.setTarget("n", "a");
    expect(match.requestSkill("n", MAELSTROM)?.check).toEqual({ ok: true });
    const log = stepFor(match, 1.5 + DT * 2);
    expect(damage(log)).toEqual([["a", 22]]);
    const walker = match.get("a");
    if (walker === undefined) {
      throw new Error("no participant a");
    }
    walker.position = vec2(0, AREA_ADJACENT + 50);
    expect(damage(stepFor(match, 10))).toEqual([]);
  });

  it("overcasts its caster by 10", () => {
    const match = sim(vec2(300, 0));
    cast(match, MAELSTROM, "a");
    expect(get(match, "n").overcast).toBeGreaterThan(9);
    expect(get(match, "n").overcast).toBeLessThanOrEqual(10);
  });
});

describe("Blurred Vision (#1367)", () => {
  /** Of 200 seeded swings by `attacker` at a dummy, how many missed. */
  function misses(attacker: Combatant): number {
    const rng = createRng(3);
    const dummy = {
      combatant: makeCombatant({ id: "dummy", team: 1, health: 1e6, maxHealth: 1e6 }),
      position: vec2(40, 0),
      creature: undefined,
      corpseExploited: false,
    };
    let missed = 0;
    for (let i = 0; i < 200; i += 1) {
      const events = resolveSwing({
        attacker,
        target: dummy,
        surroundings: new Map(),
        rng,
        rules: RULES.combat,
        exposed: () => false,
      }).events;
      if (events[0]?.kind === "attack-missed") {
        missed += 1;
      }
    }
    return missed;
  }

  it("hexes the target and an adjacent foe 9 s, not a farther one; about half their swings miss", () => {
    const match = sim(
      vec2(300, 0),
      foe("b", vec2(0, AREA_ADJACENT - 5)),
      foe("c", vec2(0, -(AREA_ADJACENT + 20))),
    );
    cast(match, BLURRED_VISION, "a");
    for (const id of ["a", "b"]) {
      hasFor(match, id, "blurred-vision", 9);
      expect(misses(get(match, id)) / 200, id).toBeGreaterThan(0.4);
      expect(misses(get(match, id)) / 200, id).toBeLessThan(0.6);
    }
    expect(get(match, "c").statuses.has("blurred-vision")).toBe(false);
    expect(misses(get(match, "c"))).toBe(0);
  });
});

describe("Armor of Mist (#1367)", () => {
  it("gives its caster +34 armor and 1.33 speed for 18 s", () => {
    const match = sim(vec2(300, 0));
    const caster = get(match, "n");
    const packet = skillDamage(100, "cold", 0);
    const before = effectiveArmor(caster, packet, "chest");
    cast(match, ARMOR_OF_MIST, "n");
    hasFor(match, "n", "armor-of-mist", 18);
    expect(effectiveArmor(caster, packet, "chest")).toBe(before + 34);
    expect(speed(match, "n")).toBe(1.33);
    stepFor(match, 18);
    expect(effectiveArmor(caster, packet, "chest")).toBe(before);
    expect(speed(match, "n")).toBe(1);
  });
});

describe("Shatterstone (#1367)", () => {
  const shattered = (): MatchSimulation => {
    const match = sim(
      vec2(300, 0),
      foe("b", vec2(0, AREA_NEARBY - 5)),
      foe("c", vec2(0, -(AREA_NEARBY + 20))),
    );
    expect(damage(cast(match, SHATTERSTONE, "a"))).toEqual([["a", 85]]);
    expect(speed(match, "a")).toBe(0.34);
    return match;
  };

  it("strikes for 85, then the bearer and a nearby foe for 85 as it expires at 3 s", () => {
    const match = shattered();
    hasFor(match, "a", "shatterstone", 3);
    const log = stepFor(match, 3).filter((entry) => entry.sourceId === "n");
    expect(damage(log).sort()).toEqual([
      ["a", 85],
      ["b", 85],
    ]);
    expect(get(match, "a").statuses.has("shatterstone")).toBe(false);
  });

  it("bursts as well when it is removed early", () => {
    const match = shattered();
    get(match, "a").statuses.remove("shatterstone");
    const log = stepFor(match, DT).filter((entry) => entry.sourceId === "n");
    expect(damage(log).sort()).toEqual([
      ["a", 85],
      ["b", 85],
    ]);
    expect(damage(stepFor(match, 3))).toEqual([]);
  });
});

describe("Mind Freeze (#1367)", () => {
  it("against a foe with less energy, strikes for 50 twice and slows it to 0.1 for 4 s", () => {
    const match = sim(vec2(300, 0));
    get(match, "n").energy = 50;
    get(match, "a").energy = 10;
    expect(damage(cast(match, MIND_FREEZE, "a"))).toEqual([
      ["a", 50],
      ["a", 50],
    ]);
    hasFor(match, "a", "mind-freeze", 4);
    expect(speed(match, "a")).toBe(0.1);
  });

  it("with equal energy, after its cost is paid: one hit, no hex", () => {
    const skill: Skill | undefined = getSkill("elementalist.mind-freeze");
    if (skill === undefined) {
      throw new Error("no Mind Freeze");
    }
    const caster = makeCombatant({ id: "n", attributeRanks: new Map([[WATER, 12]]), energy: 30 });
    const target = makeCombatant({ id: "a", team: 1, energy: 20 });
    payCost(skill, caster);
    expect(caster.energy).toBe(target.energy);
    const events = applySkillEffects({
      surroundings: new Map(),
      skill,
      caster,
      targets: [target],
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(events.map((event) => event.kind)).toEqual(["damage"]);
    expect(target.statuses.has("mind-freeze")).toBe(false);
  });
});

describe("Water Magic texts (#1367)", () => {
  const lines = (id: string): string[] => {
    const found = getSkill(id);
    if (found === undefined) {
      throw new Error(`unknown skill ${id}`);
    }
    return describeSkill(found, new Map([[WATER, 12]])).effects.map((effect) => effect.text);
  };

  it("says what each does", () => {
    expect({
      icePrison: lines("elementalist.ice-prison"),
      frozenBurst: lines("elementalist.frozen-burst"),
      iceSpear: lines("elementalist.ice-spear"),
      maelstrom: lines("elementalist.maelstrom"),
      blurredVision: lines("elementalist.blurred-vision"),
      armorOfMist: lines("elementalist.armor-of-mist"),
      shatterstone: lines("elementalist.shatterstone"),
      mindFreeze: lines("elementalist.mind-freeze"),
    }).toMatchInlineSnapshot(`
      {
        "armorOfMist": [
          "Applies Armor of Mist for 18s (+34 armor, moves at 133% speed)",
        ],
        "blurredVision": [
          "Applies Blurred Vision for 9s (50% of attacks miss)",
        ],
        "frozenBurst": [
          "Deals 70 damage",
          "Applies Frozen Burst for 7s (moves at 34% speed)",
        ],
        "icePrison": [
          "Applies Ice Prison for 18s (moves at 34% speed)",
        ],
        "iceSpear": [
          "Deals 50 damage",
          "If you are Overcast: you gain Ice Spear for 5s (+3 Health regeneration)",
          "Projectile: can be dodged",
        ],
        "maelstrom": [
          "Creates a symbol at your target's location for 10 seconds",
          "Every 1s for 10s, foes adjacent: deals 22 damage",
          "Every 1s for 10s, foes adjacent: interrupts the target's spell, if they are casting one",
        ],
        "mindFreeze": [
          "Deals 50 damage",
          "If you have more Energy than target: deals 50 damage",
          "If you have more Energy than target: applies Mind Freeze for 4s (moves at 10% speed)",
        ],
        "shatterstone": [
          "Deals 85 damage",
          "Applies Shatterstone for 3s (moves at 34% speed, takes 85 damage when it ends, its allies nearby take 85 damage when it ends)",
        ],
      }
    `);
  });
});
