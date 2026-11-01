import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeSkill } from "../skills/describe.js";
import { applyEffects, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill, SplashEffect, Surroundings } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Ritualist Spawning Power creation staples (#1316): Boon of Creation,
 * Explosive Growth and Spirit's Gift answer each creature their wearer
 * creates, and Signet of Creation pays for each one standing near.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const BOON = "ritualist.boon-of-creation";
const GROWTH = "ritualist.explosive-growth";
const GIFT = "ritualist.spirits-gift";
const SIGNET = "ritualist.signet-of-creation";
const SHELTER = "ritualist.shelter";
const MINIONS = "necromancer.animate-bone-minions";

function skillOf(id: string): Skill {
  const skill = getSkill(id);
  if (skill === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return skill;
}

function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [BOON, GROWTH, GIFT, SIGNET, SHELTER, MINIONS],
    attributeRanks: new Map([
      ["ritualist.spawning-power", 12],
      ["ritualist.communing", 12],
      ["necromancer.death-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/** A creature of `r`'s already standing, as `#summon` would make it. */
function standing(id: string, spawn: Vec2, kind: "spirit" | "minion" | "pet"): ParticipantSpec {
  return {
    ...spec(id, 0, spawn),
    skillBar: [],
    attributeRanks: new Map(),
    creature: {
      ownerId: "r",
      kind,
      look: kind === "pet" ? "beast" : "bone-minion",
      name: "Creature",
      expiresInSeconds: Number.POSITIVE_INFINITY,
      ageSeconds: 0,
      summonedAtTick: 0,
      skillId: MINIONS,
      aura: undefined,
      onDeath: "vanish",
      ownerDisableSeconds: 0,
      deathBurst: undefined,
      onDeathInRange: undefined,
      replacedBy: undefined,
      corpsesLeft: 0,
      companionSkillId: undefined,
      leaderId: undefined,
      mode: "guard",
    },
  };
}

/** Ritualist `r` on team 0 at the origin, and `more`. */
function match(more: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "spawning-creation",
    participants: [spec("r", 0, vec2(0, 0)), ...more],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `r` uses `skillId`, and steps until it has landed, and one step more. */
function use(sim: MatchSimulation, skillId: string): CombatLogEntry[] {
  get(sim, "r").combatant.energy = 100;
  const slot = get(sim, "r").skillBar.indexOf(skillId);
  expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
  const log: CombatLogEntry[] = [];
  for (
    let i = 0;
    !log.some((entry) => entry.sourceId === "r" && entry.skillId === skillId);
    i += 1
  ) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return [...log, ...stepFor(sim, DT)];
}

/** Every entry `skillId` of `r` logged in `log`, one per firing. */
function firings(log: readonly CombatLogEntry[], skillId: string): CombatEvent[][] {
  return log
    .filter((entry) => entry.sourceId === "r" && entry.skillId === skillId)
    .map((entry) => [...entry.events]);
}

function amounts(
  events: readonly CombatEvent[],
  kind: "damage" | "heal" | "energy-gain",
  targetId: string,
): number[] {
  return events.flatMap((event) =>
    event.kind === kind && event.targetId === targetId ? [event.amount] : [],
  );
}

/** Kill `id` as burning would: a fresh corpse. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "r", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

describe("Boon of Creation (#1316)", () => {
  it("gives 41 Health and 5 Energy, its rank-12 values, for the spirit a binding ritual makes", () => {
    const sim = match([]);
    use(sim, BOON);
    expect(get(sim, "r").combatant.statuses.get("boon-of-creation")?.remainingSeconds).toBeCloseTo(
      51 - DT,
    );
    const r = get(sim, "r").combatant;
    r.health = 200;
    const log = use(sim, SHELTER);
    // Shelter's 25 energy is paid as the cast starts; the boon pays at the spirit.
    const fired = firings(log, BOON);
    expect(fired).toHaveLength(1);
    expect(amounts(fired[0] ?? [], "heal", "r")).toEqual([41]);
    expect(amounts(fired[0] ?? [], "energy-gain", "r")).toEqual([5]);
  });

  it("pays twice for the two Bone Minions one cast raises", () => {
    const sim = match([spec("x", 1, vec2(200, 0))]);
    kill(sim, "x");
    use(sim, BOON);
    get(sim, "r").combatant.health = 200;
    const fired = firings(use(sim, MINIONS), BOON);
    expect(fired.map((events) => amounts(events, "heal", "r"))).toEqual([[41], [41]]);
  });

  it("pays nothing without a creature made, and nothing once it is gone", () => {
    const sim = match([]);
    use(sim, BOON);
    get(sim, "r").combatant.statuses.end("boon-of-creation");
    expect(firings(use(sim, SHELTER), BOON)).toEqual([]);
  });
});

describe("Explosive Growth (#1316)", () => {
  it("strikes the 5 foes nearest the new spirit for lightning damage, and spares the sixth and an ally", () => {
    // Six foes round the origin, each farther than the last, all nearby.
    const foes = [0, 1, 2, 3, 4, 5].map((i) => {
      const angle = (i * Math.PI) / 3;
      const away = 30 + 8 * i;
      return spec(`f${String(i)}`, 1, vec2(Math.cos(angle) * away, Math.sin(angle) * away));
    });
    const sim = match([...foes, spec("a", 0, vec2(20, 20))]);
    use(sim, GROWTH);
    const fired = firings(use(sim, SHELTER), GROWTH);
    expect(fired).toHaveLength(1);
    const events = fired[0] ?? [];
    for (const i of [0, 1, 2, 3, 4]) {
      expect(amounts(events, "damage", `f${String(i)}`)).toHaveLength(1);
    }
    expect(amounts(events, "damage", "f5")).toEqual([]);
    expect(amounts(events, "damage", "a")).toEqual([]);
    expect(amounts(events, "damage", "r")).toEqual([]);
  });
});

describe("Spirit's Gift (#1316)", () => {
  it("heals an ally near the new spirit for 41 and takes its Bleeding; one farther off is untouched", () => {
    const sim = match([spec("near", 0, vec2(40, 0)), spec("far", 0, vec2(AREA_NEARBY + 60, 0))]);
    use(sim, GIFT);
    for (const id of ["near", "far"]) {
      const ally = get(sim, id).combatant;
      ally.health = 200;
      ally.statuses.apply("bleeding", 30, "x", NO_RANKS);
    }
    const fired = firings(use(sim, SHELTER), GIFT);
    expect(fired).toHaveLength(1);
    const events = fired[0] ?? [];
    expect(amounts(events, "heal", "near")).toEqual([41]);
    expect(get(sim, "near").combatant.statuses.has("bleeding")).toBe(false);
    expect(amounts(events, "heal", "far")).toEqual([]);
    expect(get(sim, "far").combatant.statuses.has("bleeding")).toBe(true);
  });
});

describe("Signet of Creation (#1316)", () => {
  const gained = (more: readonly ParticipantSpec[]): number[] => {
    const sim = match(more);
    get(sim, "r").combatant.energy = 0;
    const slot = get(sim, "r").skillBar.indexOf(SIGNET);
    expect(sim.requestSkill("r", slot)?.check.ok).toBe(true);
    const log = stepFor(sim, 1 + 2 * DT);
    expect(log.some((entry) => entry.sourceId === "r" && entry.skillId === SIGNET)).toBe(true);
    expect(get(sim, "r").combatant.cast.rechargeRemaining.size).toBeGreaterThan(0);
    return firings(log, SIGNET).flatMap((events) => amounts(events, "energy-gain", "r"));
  };

  it("gives nothing with no creature, but is used and recharges", () => {
    expect(gained([])).toEqual([]);
  });

  it("gives 4 for one creature in earshot, and nothing for one beyond it or a pet", () => {
    expect(gained([standing("m", vec2(100, 0), "minion")])).toEqual([4]);
    expect(gained([standing("m", vec2(AREA_EARSHOT + 50, 0), "minion")])).toEqual([]);
    expect(gained([standing("p", vec2(100, 0), "pet")])).toEqual([]);
  });

  it("caps four creatures' 16 at 10, its rank-12 maximum", () => {
    expect(
      gained([
        standing("m1", vec2(100, 0), "minion"),
        standing("m2", vec2(-100, 0), "minion"),
        standing("s1", vec2(0, 100), "spirit"),
        standing("s2", vec2(0, -100), "spirit"),
      ]),
    ).toEqual([10]);
  });
});

describe("a splash's sides and cap (#1316)", () => {
  /** `centre` at the origin, foes `f0`... and allies `a0`... each 10 farther out. */
  function crowd(foes: number, allies: number) {
    const caster = makeCombatant({ id: "caster" });
    const centre = makeCombatant({ id: "centre" });
    const bodies: Combatant[] = [
      caster,
      centre,
      ...Array.from({ length: foes }, (_, i) => makeCombatant({ id: `f${String(i)}`, team: 1 })),
      ...Array.from({ length: allies }, (_, i) => makeCombatant({ id: `a${String(i)}` })),
    ];
    const surroundings: Surroundings = new Map(
      bodies.map((combatant, i) => [
        combatant.id,
        {
          combatant,
          position: combatant.id === "centre" ? vec2(0, 0) : vec2(10 * i, 0),
          creature: undefined,
          corpseExploited: false,
        },
      ]),
    );
    return { caster, centre, surroundings };
  }

  const splash = (hits: SplashEffect["hits"], maxTargets: number | undefined): SplashEffect => ({
    kind: "splash",
    hits,
    radius: AREA_NEARBY,
    maxTargets,
    effects: [{ kind: "damage", amount: { flat: 10 }, type: "lightning", armorPenetration: 0 }],
  });

  const hit = (effect: SplashEffect, foes: number, allies: number): string[] => {
    const { caster, centre, surroundings } = crowd(foes, allies);
    return applyEffects([effect], {
      caster,
      target: centre,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings,
    }).flatMap((event) => (event.kind === "damage" ? [event.targetId] : []));
  };

  it("takes the nearest first up to its cap, and every one without", () => {
    expect(hit(splash("foes", 2), 4, 0)).toEqual(["f0", "f1"]);
    expect(hit(splash("foes", undefined), 4, 0)).toEqual(["f0", "f1", "f2", "f3"]);
  });

  it("reaches the caster's side, the caster too, with `allies`, and never the centre", () => {
    expect(hit(splash("allies", undefined), 1, 2)).toEqual(["caster", "a0", "a1"]);
    expect(hit(splash("foes", undefined), 1, 2)).toEqual(["f0"]);
  });
});

describe("the tooltips (#1316)", () => {
  const ranks = new Map([["ritualist.spawning-power", 12]]);
  const text = (id: string): string[] =>
    describeSkill(skillOf(id), ranks).effects.map(({ text }) => text);

  it("words each as the corpus does, at the rank-12 numbers", () => {
    expect(text(BOON)).toEqual([
      "Applies Boon of Creation for 51s " +
        "(whenever you create a creature: you gain 41 Health and 5 Energy)",
    ]);
    expect(text(GROWTH)).toEqual([
      "Applies Explosive Growth for 51s " +
        "(whenever you create a creature: up to 5 foes near that creature take 56 lightning damage)",
    ]);
    expect(text(GIFT)).toEqual([
      "Applies Spirit's Gift for 60s " +
        "(whenever you create a creature: all allies near that creature gain 41 Health and lose 1 condition)",
    ]);
    expect(text(SIGNET)).toEqual([
      "Gain 4 energy for every summoned creature you control within earshot (maximum 10 Energy)",
    ]);
  });
});
