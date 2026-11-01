import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import type { CombatEvent } from "../skills/effects.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { makeCombatant } from "../skills/testing.js";
import { effectiveMaxHealth } from "../skills/tick.js";
import type { Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Nature rituals 4 (#1956): three elite spirits whose auras answer what
 * the bodies in range do. Quicksand drains each attack and skill, Famine
 * strikes a drop to 0 Energy, Lacerate worsens Bleeding and makes its
 * own when it dies.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};

const RITUALS = ["ranger.quicksand", "ranger.famine", "ranger.lacerate"];

const RANKS = new Map([
  ["ranger.beast-mastery", 12],
  ["ranger.marksmanship", 12],
  ["ranger.wilderness-survival", 12],
  ["elementalist.fire-magic", 12],
]);

const BOW: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.flatbow,
    attributeId: "ranger.marksmanship",
    damageType: WEAPONS.flatbow.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** `f`'s bar: a 5e spell and a 10e attack skill. */
const FLARE = 0;
const POWER_SHOT = 1;

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2, skillBar: string[]): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: RANKS,
    equipment: BOW,
    maxHealth: 480,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** `r` on team 0 at the origin with `a` beside it, `f` on team 1 in range, `far` out of it. */
function match(): MatchSimulation {
  const foeBar = ["elementalist.flare", "ranger.power-shot"];
  return new MatchSimulation({
    seed: "nature-rituals-4",
    matchRules: MATCH,
    participants: [
      spec("r", 0, vec2(0, 0), RITUALS),
      spec("a", 0, vec2(0, 200), []),
      spec("f", 1, vec2(300, 0), foeBar),
      spec("far", 1, vec2(4000, 0), foeBar),
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

/** `r` casts each of `skillIds` from its bar in turn, stepping until each has gone off. */
function ritual(sim: MatchSimulation, ...skillIds: string[]): void {
  for (const skillId of skillIds) {
    const slot = get(sim, "r").skillBar.indexOf(skillId);
    expect(sim.requestSkill("r", slot)?.check).toEqual({ ok: true });
    stepFor(sim, skillOf(skillId).activationSeconds + 1);
  }
}

/** The Famine damage `id` takes over `seconds`. */
function famineHits(sim: MatchSimulation, id: string, seconds: number): number[] {
  const hits: number[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      if (entry.skillId === "ranger.famine") {
        for (const event of entry.events) {
          if (event.kind === "damage" && event.targetId === id) {
            hits.push(event.amount);
          }
        }
      }
    }
  }
  return hits;
}

/**
 * How much more Energy `id` spends doing `act` with Quicksand up than
 * without it: the two matches differ only in the ritual.
 */
function quicksandCost(id: string, act: (sim: MatchSimulation) => void): number {
  const energyAfter = (withRitual: boolean): number => {
    const sim = match();
    if (withRitual) {
      ritual(sim, "ranger.quicksand");
    } else {
      stepFor(sim, skillOf("ranger.quicksand").activationSeconds + 1);
    }
    get(sim, id).combatant.energy = 20;
    act(sim);
    return get(sim, id).combatant.energy;
  };
  return energyAfter(false) - energyAfter(true);
}

describe("nature rituals 4 (#1956)", () => {
  it("summons each as a spirit wearing its aura over both teams", () => {
    for (const [skillId, statusId] of [
      ["ranger.quicksand", "quicksand"],
      ["ranger.famine", "famine"],
      ["ranger.lacerate", "lacerate"],
    ] as const) {
      const sim = match();
      ritual(sim, skillId);
      expect(get(sim, "f").combatant.statuses.has(statusId)).toBe(true);
      expect(get(sim, "a").combatant.statuses.has(statusId)).toBe(true);
      expect(get(sim, "far").combatant.statuses.has(statusId)).toBe(false);
    }
  });

  it("Quicksand: a spell costs 1 more, a plain shot 1, an attack skill 2", () => {
    const use = (slot: number) => (sim: MatchSimulation) => {
      sim.setTarget("f", "r");
      expect(sim.requestSkill("f", slot)?.check).toEqual({ ok: true });
      stepFor(sim, 2);
    };
    expect(quicksandCost("f", use(FLARE))).toBeCloseTo(1, 6);
    expect(quicksandCost("f", use(POWER_SHOT))).toBeCloseTo(2, 6);
    // Plain shots: 1 each, whatever the bow's pace.
    const shots = quicksandCost("f", (sim) => {
      sim.requestAttack("f", "r");
      stepFor(sim, 3);
    });
    expect(shots).toBeGreaterThanOrEqual(1);
    expect(shots).toBeCloseTo(Math.round(shots), 6);
  });

  it("Famine: a drop to 0 Energy takes 60 once; staying there takes no more", () => {
    const sim = match();
    ritual(sim, "ranger.famine");
    const f = get(sim, "f").combatant;
    f.energy = 5.5;
    sim.setTarget("f", "r");
    expect(sim.requestSkill("f", FLARE)?.check).toEqual({ ok: true });
    const hits: number[] = [];
    for (let i = 0; i < Math.round(5 / DT); i += 1) {
      hits.push(...famineHits(sim, "f", DT));
      if (f.energy > 0.5) {
        f.energy = 0.5;
      }
    }
    expect(hits).toEqual([60]);
  });

  it("Famine: a body that walks in already at 0 takes nothing", () => {
    const sim = match();
    ritual(sim, "ranger.famine");
    const far = get(sim, "far");
    far.combatant.energy = 0;
    stepFor(sim, DT);
    far.position = vec2(300, 100);
    far.combatant.energy = 0;
    expect(famineHits(sim, "far", 0.5)).toEqual([]);
    expect(far.combatant.statuses.has("famine")).toBe(true);
  });

  it("Famine with Quicksand: a 1-Energy foe that shoots loses its last and takes 60", () => {
    const sim = match();
    ritual(sim, "ranger.quicksand", "ranger.famine");
    const f = get(sim, "f").combatant;
    sim.requestAttack("f", "r");
    const hits: number[] = [];
    for (let i = 0; i < Math.round(3 / DT) && hits.length === 0; i += 1) {
      f.energy = 1;
      hits.push(...famineHits(sim, "f", DT));
    }
    expect(hits).toEqual([60]);
  });

  it("Lacerate: -2 more degeneration on a Bleeding body only", () => {
    const bearer = makeCombatant({ id: "bearer" });
    bearer.statuses.project("lacerate", "r/c1", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).healthPips).toBe(0);
    bearer.statuses.apply("bleeding", 10, "f", NO_RANKS);
    expect(aggregateModifiers(bearer.statuses.active).healthPips).toBe(-3 - 2);
  });

  it("Lacerate: at its end every non-spirit in range under 90% Health bleeds 21 s", () => {
    const sim = match();
    ritual(sim, "ranger.lacerate");
    const spirit = [...sim.participants()].find((p) => p.creature?.kind === "spirit");
    if (spirit?.creature === undefined) {
      throw new Error("no spirit");
    }
    const [f, a, r, far] = ["f", "a", "r", "far"].map((id) => get(sim, id).combatant);
    if (f === undefined || a === undefined || r === undefined || far === undefined) {
      throw new Error("missing");
    }
    for (const body of [f, a, far]) {
      body.health = 0.8 * effectiveMaxHealth(body);
    }
    r.health = 0.9 * effectiveMaxHealth(r);
    spirit.creature.expiresInSeconds = DT / 2;
    stepFor(sim, DT);
    expect(sim.get(spirit.id)).toBeUndefined();
    expect(f.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(21, 0);
    expect(a.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(21, 0);
    expect(r.statuses.has("bleeding")).toBe(false);
    expect(far.statuses.has("bleeding")).toBe(false);
  });

  it("says what each does", () => {
    const lines = (id: string) => describeSkill(skillOf(id), RANKS).effects.map(({ text }) => text);
    expect(lines("ranger.lacerate")).toContain(
      "When it dies, non-spirit creatures in its range under 90% Health begin Bleeding for 21 seconds",
    );
    expect(lines("ranger.quicksand").join(" ")).toContain("uses a skill");
    expect(lines("ranger.famine").join(" ")).toContain("drops to 0 Energy");
  });
});
