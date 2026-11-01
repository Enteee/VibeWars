import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import type { DamageType } from "../equipment/types.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeSkill, describeStatus } from "../skills/describe.js";
import { applyEffects } from "../skills/effects.js";
import { getSkill } from "../skills/catalog.js";
import type { StatusId } from "../skills/status.js";
import type { Combatant, Skill } from "../skills/types.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Casting-state hexes and Death Nova (#1931), at rank 12: Spinal Shivers
 * and Shivers of Dread answer a cold hit on a foe using a skill, Power
 * Leech and Power Flux interrupt a spell or chant and hex the foe
 * either way, Death Nova bursts from a dead ally.
 */
const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SHIVERS = ["spinal-shivers", "shivers-of-dread"] as const;

/**
 * `f` on team 0 casts: a 2 s spell, a 1 s chant, an instant shout, and a
 * second spell. `n` the Necromancer and `m` the Mesmer on team 1; `b` their
 * ally, `near` and `far` two more of team 0.
 */
function participant(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["elementalist.fire-magic", 12],
      ["paragon.leadership", 12],
      ["paragon.command", 12],
      ["necromancer.curses", 12],
      ["necromancer.death-magic", 12],
      ["mesmer.inspiration-magic", 12],
      ["mesmer.domination-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e4,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function sim(): MatchSimulation {
  return new MatchSimulation({
    seed: "reactive-hexes",
    participants: [
      participant(
        "f",
        0,
        [
          "elementalist.fireball",
          "paragon.anthem-of-flame",
          "paragon.fall-back",
          "elementalist.flare",
        ],
        vec2(0, 0),
      ),
      participant(
        "n",
        1,
        ["necromancer.spinal-shivers", "necromancer.shivers-of-dread", "necromancer.death-nova"],
        vec2(300, 0),
      ),
      participant("m", 1, ["mesmer.power-leech", "mesmer.power-flux"], vec2(300, 40)),
      participant("b", 1, [], vec2(600, 0)),
      participant("near", 0, [], vec2(600 + AREA_ADJACENT / 2, 0)),
      participant("far", 0, [], vec2(600 + AREA_ADJACENT * 4, 0)),
    ],
  });
}

function get(match: MatchSimulation, id: string): Combatant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.max(1, Math.round(seconds / DT)); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `id` uses its skill in `slot` on `target`. */
function use(match: MatchSimulation, id: string, slot: number, target: string): void {
  match.setTarget(id, target);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
}

/** `n` hits `f` for 10 damage of `type`, outside any skill. */
function hit(match: MatchSimulation, type: DamageType): void {
  applyEffects([{ kind: "damage", amount: { flat: 10 }, type, armorPenetration: 0 }], {
    caster: get(match, "n"),
    target: get(match, "f"),
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
    usedSkill: undefined,
  });
}

/** `far` burns `id` to death, as the simulation sees it; what happened meanwhile. */
function kill(match: MatchSimulation, id: string): CombatLogEntry[] {
  const victim = get(match, id);
  victim.statuses.apply("burning", 10, "far", NO_RANKS);
  victim.health = 0.2;
  const log = stepFor(match, 4 * DT);
  expect(victim.dead).toBe(true);
  return log;
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function interrupted(log: readonly CombatLogEntry[], id: string): boolean {
  return log.some(({ events }) =>
    events.some((event) => event.kind === "interrupted" && event.targetId === id),
  );
}

describe("Spinal Shivers and Shivers of Dread (#1931)", () => {
  it("are cast as their hexes, for 34 seconds", () => {
    for (const [slot, id] of SHIVERS.entries()) {
      const match = sim();
      use(match, "n", slot, "f");
      stepFor(match, 2.5);
      expect(get(match, "f").statuses.has(id)).toBe(true);
      expect(
        get(match, "f").statuses.active.find((status) => status.id === id)?.durationSeconds,
      ).toBe(34);
    }
  });

  it("a cold hit mid-cast interrupts the skill and costs the caster 4 Energy", () => {
    for (const id of SHIVERS) {
      const match = sim();
      get(match, "f").statuses.apply(id, 34, "n", NO_RANKS);
      use(match, "f", 0, "n");
      stepFor(match, 0.25);
      expect(get(match, "f").cast.isCasting).toBe(true);
      get(match, "n").energy = 50;
      hit(match, "cold");
      const log = stepFor(match, DT);
      expect(interrupted(log, "f"), id).toBe(true);
      expect(get(match, "f").cast.isCasting).toBe(false);
      expect(get(match, "n").energy).toBeCloseTo(46, 0);
      expect(get(match, "f").statuses.has(id)).toBe(true);
    }
  });

  it("answers several cold packets in one tick once", () => {
    const match = sim();
    get(match, "f").statuses.apply("spinal-shivers", 34, "n", NO_RANKS);
    use(match, "f", 0, "n");
    stepFor(match, 0.25);
    get(match, "n").energy = 50;
    hit(match, "cold");
    hit(match, "cold");
    stepFor(match, DT);
    expect(get(match, "n").energy).toBeCloseTo(46, 0);
  });

  it("leaves an idle foe alone, and a fire hit on a casting one, at no cost", () => {
    const idle = sim();
    get(idle, "f").statuses.apply("spinal-shivers", 34, "n", NO_RANKS);
    get(idle, "n").energy = 50;
    hit(idle, "cold");
    stepFor(idle, DT);
    expect(get(idle, "n").energy).toBeCloseTo(50, 0);

    const fire = sim();
    get(fire, "f").statuses.apply("spinal-shivers", 34, "n", NO_RANKS);
    use(fire, "f", 0, "n");
    stepFor(fire, 0.25);
    get(fire, "n").energy = 50;
    hit(fire, "fire");
    const log = stepFor(fire, DT);
    expect(interrupted(log, "f")).toBe(false);
    expect(get(fire, "f").cast.isCasting).toBe(true);
    expect(get(fire, "n").energy).toBeCloseTo(50, 0);
  });

  it("ends, and interrupts nothing, when its caster has less than 4 Energy", () => {
    const match = sim();
    get(match, "f").statuses.apply("spinal-shivers", 34, "n", NO_RANKS);
    use(match, "f", 0, "n");
    stepFor(match, 0.25);
    get(match, "n").energy = 3;
    hit(match, "cold");
    const log = stepFor(match, DT);
    expect(interrupted(log, "f")).toBe(false);
    expect(get(match, "f").cast.isCasting).toBe(true);
    expect(get(match, "f").statuses.has("spinal-shivers")).toBe(false);
    expect(get(match, "n").energy).toBeGreaterThanOrEqual(3);
  });

  it("says so in its tooltip", () => {
    expect(describeStatus("spinal-shivers")).toContain(
      "is struck for cold damage while using a skill, it is interrupted and you lose 4 Energy or this ends",
    );
  });
});

describe("Power Leech and Power Flux (#1931)", () => {
  const POWER: readonly [number, StatusId][] = [
    [0, "power-leech"],
    [1, "power-flux"],
  ];

  /** `m` uses its skill in `slot` as `f` begins its skill in `fSlot`. */
  function against(
    slot: number,
    fSlot: number | undefined,
  ): { match: MatchSimulation; log: CombatLogEntry[] } {
    const match = sim();
    if (fSlot !== undefined) {
      use(match, "f", fSlot, fSlot === 2 ? "f" : "n");
    }
    use(match, "m", slot, "f");
    return { match, log: stepFor(match, 0.5) };
  }

  it("interrupt a spell or a chant and hex the foe", () => {
    for (const [slot, id] of POWER) {
      for (const fSlot of [0, 1]) {
        const { match, log } = against(slot, fSlot);
        expect(interrupted(log, "f"), `${id} on ${String(fSlot)}`).toBe(true);
        expect(get(match, "f").statuses.has(id), `${id} on ${String(fSlot)}`).toBe(true);
      }
    }
  });

  it("do nothing to a foe that only shouted, or cast nothing", () => {
    for (const [slot, id] of POWER) {
      for (const fSlot of [2, undefined]) {
        const { match, log } = against(slot, fSlot);
        expect(interrupted(log, "f")).toBe(false);
        expect(get(match, "f").statuses.has(id), `${id} on ${String(fSlot)}`).toBe(false);
      }
    }
  });

  it("Power Leech lasts 10 s, Power Flux 9 s", () => {
    const remaining = (slot: number, id: StatusId): number | undefined =>
      get(against(slot, 0).match, "f").statuses.active.find((status) => status.id === id)
        ?.durationSeconds;
    expect(remaining(0, "power-leech")).toBe(10);
    expect(remaining(1, "power-flux")).toBe(9);
  });

  it("Power Leech steals 13 Energy on the foe's next spell", () => {
    const match = sim();
    get(match, "f").statuses.apply("power-leech", 10, "m", NO_RANKS);
    get(match, "m").energy = 50;
    get(match, "f").energy = 80;
    use(match, "f", 3, "n");
    stepFor(match, 1.5);
    expect(get(match, "m").energy).toBeGreaterThan(62);
    expect(get(match, "m").energy).toBeLessThan(64);
  });

  it("Power Flux drains 2 pips of Energy", () => {
    expect(describeStatus("power-flux")).toContain("−2 Energy");
    expect(
      describeSkill(skill("mesmer.power-flux"), new Map())
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("If target is casting a spell or chant");
  });
});

describe("Death Nova (#1931)", () => {
  it("is cast on an ally as its enchantment, for 30 seconds", () => {
    const match = sim();
    use(match, "n", 2, "b");
    stepFor(match, 2.5);
    expect(get(match, "b").statuses.has("death-nova")).toBe(true);
  });

  it("a death under it costs adjacent foes 85 and poisons them, not a far one", () => {
    const match = sim();
    get(match, "b").statuses.apply("death-nova", 30, "n", NO_RANKS);
    const log = kill(match, "b");
    const dealt = log
      .filter((entry) => entry.skillId === "necromancer.death-nova")
      .flatMap(({ events }) => events.flatMap((event) => (event.kind === "damage" ? [event] : [])));
    expect(dealt.map(({ targetId, amount }) => [targetId, amount])).toEqual([["near", 85]]);
    expect(get(match, "near").statuses.has("poison")).toBe(true);
    expect(get(match, "far").statuses.has("poison")).toBe(false);
  });

  it("does nothing once it is gone", () => {
    const match = sim();
    get(match, "b").statuses.apply("death-nova", 30, "n", NO_RANKS);
    get(match, "b").statuses.end("death-nova");
    kill(match, "b");
    expect(get(match, "near").statuses.has("poison")).toBe(false);
  });
});
