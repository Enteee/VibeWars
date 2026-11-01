import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { NO_RANKS } from "../skills/status.js";
import { strikesOf } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Blood Magic orders and leeches (#1979): Order of the Vampire, Dark Fury,
 * Awaken the Blood and Soul Leech, in a match.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const HEALTH = 1e4;
const BAR = [
  "necromancer.order-of-the-vampire",
  "necromancer.dark-fury",
  "necromancer.awaken-the-blood",
  "necromancer.soul-leech",
  "necromancer.order-of-pain",
  "warrior.backbreaker",
] as const;
const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
  (typeof BAR)[number],
  number
>;

const UNARMED = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
const AXE: ResolvedEquipment = {
  ...UNARMED,
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};
const WAND: ResolvedEquipment = {
  ...UNARMED,
  mainHand: { ...UNARMED.mainHand, weapon: WEAPONS.wand, damageType: WEAPONS.wand.damageType },
};

function body(
  id: string,
  team: number,
  spawn: Vec2,
  equipment: ResolvedEquipment,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...BAR],
    attributeRanks: new Map([
      ["necromancer.blood-magic", 12],
      ["necromancer.curses", 12],
      ["warrior.axe-mastery", 12],
    ]),
    equipment,
    maxHealth: HEALTH,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/** Necromancer `c` with axe ally `a` and wand ally `w`; foe `f` adjacent to `a`. */
function match(): MatchSimulation {
  return new MatchSimulation({
    seed: "blood-orders",
    participants: [
      body("c", 1, vec2(0, 0), UNARMED),
      body("a", 1, vec2(0, 40), AXE),
      body("w", 1, vec2(0, -40), WAND),
      body("f", 0, vec2(AREA_ADJACENT - 10, 40), AXE),
    ],
  });
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
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

/** `user` uses `skillId` on `targetId`, and the steps until it has landed. */
function cast(sim: MatchSimulation, user: string, skillId: (typeof BAR)[number], targetId: string) {
  sim.setTarget(user, targetId);
  expect(sim.requestSkill(user, SLOT[skillId])?.check).toEqual({ ok: true });
  return stepFor(sim, 2.5);
}

/** What `sourceId` stole, entry by entry, under `skillId`. */
function steals(log: readonly CombatLogEntry[], sourceId: string, skillId: string): number[] {
  return log
    .filter((entry) => entry.sourceId === sourceId && entry.skillId === skillId)
    .flatMap((entry) =>
      entry.events.flatMap((event) => (event.kind === "life-stolen" ? [event.amount] : [])),
    );
}

describe("Order of the Vampire (#1979)", () => {
  it("costs the caster 17% once and enchants the party", () => {
    const sim = match();
    cast(sim, "c", "necromancer.order-of-the-vampire", "c");
    expect(get(sim, "c").health).toBe(HEALTH - 1700);
    for (const id of ["c", "a", "w"]) {
      expect(get(sim, id).statuses.has("order-of-the-vampire"), id).toBe(true);
    }
    expect(get(sim, "f").statuses.has("order-of-the-vampire")).toBe(false);
  });

  it("an axe blow that hits steals 13", () => {
    const sim = match();
    cast(sim, "c", "necromancer.order-of-the-vampire", "c");
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    const stolen = steals(stepFor(sim, 3), "a", "necromancer.order-of-the-vampire");
    expect(stolen.length).toBeGreaterThan(0);
    expect(stolen.every((amount) => amount === 13)).toBe(true);
  });

  it("steals nothing under Order of Pain, whose 13 damage still lands", () => {
    const sim = match();
    cast(sim, "c", "necromancer.order-of-the-vampire", "c");
    cast(sim, "c", "necromancer.order-of-pain", "c");
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    expect(steals(log, "a", "necromancer.order-of-the-vampire")).toEqual([]);
    expect(
      log.some((entry) => entry.sourceId === "a" && entry.skillId === "necromancer.order-of-pain"),
    ).toBe(true);
  });

  it("a wand bolt is not physical: no steal", () => {
    const sim = match();
    cast(sim, "c", "necromancer.order-of-the-vampire", "c");
    expect(sim.requestAttack("w", "f")).toEqual({ ok: true });
    const log = stepFor(sim, 4);
    expect(log.some((entry) => entry.sourceId === "w")).toBe(true);
    expect(steals(log, "w", "necromancer.order-of-the-vampire")).toEqual([]);
  });

  it("says so", () => {
    expect(
      describeSkill(skill("necromancer.order-of-the-vampire"))
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("If you have no other Necromancer enchantment");
  });
});

describe("Dark Fury (#1979)", () => {
  /** Strikes `a` earns in 4 s of axe swings, Dark Fury on it or not. */
  function strikes(fury: boolean): number {
    const sim = match();
    if (fury) {
      get(sim, "a").statuses.apply("dark-fury", 30, "c", NO_RANKS);
    }
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    stepFor(sim, 4);
    return strikesOf(get(sim, "a"), "warrior.backbreaker");
  }

  it("each hit earns one more strike of adrenaline", () => {
    const plain = strikes(false);
    expect(plain).toBeGreaterThan(0);
    expect(strikes(true)).toBe(2 * plain);
  });

  it("is the party's for 5 s, for 17% of the caster's health", () => {
    const sim = match();
    cast(sim, "c", "necromancer.dark-fury", "c");
    expect(get(sim, "c").health).toBe(HEALTH - 1700);
    expect(get(sim, "a").statuses.has("dark-fury")).toBe(true);
  });
});

describe("Awaken the Blood (#1979)", () => {
  it("makes the Order's 17% sacrifice 50% larger, for +2 Blood Magic and Curses", () => {
    const sim = match();
    cast(sim, "c", "necromancer.awaken-the-blood", "c");
    expect(get(sim, "c").statuses.get("awaken-the-blood")?.remainingSeconds).toBeGreaterThan(30);
    cast(sim, "c", "necromancer.order-of-pain", "c");
    expect(get(sim, "c").health).toBe(HEALTH - 2550);
  });

  it("at 480 health the 17% is 122, not 82", () => {
    const sim = match();
    const caster = get(sim, "c");
    caster.maxHealth = 480;
    caster.health = 480;
    caster.statuses.apply("awaken-the-blood", 39, "c", NO_RANKS);
    cast(sim, "c", "necromancer.order-of-pain", "c");
    expect(caster.health).toBe(480 - 122);
  });

  it("says so", () => {
    expect(
      describeSkill(skill("necromancer.awaken-the-blood"))
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("your Health sacrifices are 50% larger");
  });
});

describe("Soul Leech (#1979)", () => {
  it("each spell the foe casts gives the Necromancer 67 of its health", () => {
    const sim = match();
    cast(sim, "c", "necromancer.soul-leech", "f");
    expect(get(sim, "f").statuses.has("soul-leech")).toBe(true);
    const log = [
      ...cast(sim, "f", "necromancer.awaken-the-blood", "f"),
      ...cast(sim, "f", "necromancer.dark-fury", "f"),
    ];
    expect(steals(log, "c", "necromancer.soul-leech")).toEqual([67, 67]);
  });

  it("a cast that never completes steals nothing", () => {
    const sim = match();
    cast(sim, "c", "necromancer.soul-leech", "f");
    sim.setTarget("f", "f");
    expect(sim.requestSkill("f", SLOT["necromancer.awaken-the-blood"])?.check).toEqual({
      ok: true,
    });
    sim.step(DT);
    sim.cancelAction("f");
    expect(steals(stepFor(sim, 2), "c", "necromancer.soul-leech")).toEqual([]);
  });
});
