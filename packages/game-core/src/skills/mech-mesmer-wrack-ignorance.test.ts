import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { copyKey, slotSkill } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, SkillEffect } from "./types.js";

/**
 * Mind Wrack, Ignorance, Simple Thievery and Churning Earth (#2290): a
 * trigger on its source's skill at the bearer, a signet lockout, a copy
 * of the skill interrupted, and a knockdown for a foe moving faster than
 * normal. The corpus's numbers, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = ["mesmer.domination-magic", "elementalist.earth-magic"];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

const MIND_WRACK = "mesmer.mind-wrack";
const IGNORANCE = "mesmer.ignorance";
const SIMPLE_THIEVERY = "mesmer.simple-thievery";
const CHURNING_EARTH = "elementalist.churning-earth";
const SHATTER_ENCHANTMENT = "mesmer.shatter-enchantment";
const POWER_SPIKE = "mesmer.power-spike";
const SHRINKING_ARMOR = "mesmer.shrinking-armor";
const BLINDING_FLASH = "elementalist.blinding-flash";
const HEALING_SIGNET = "warrior.healing-signet";
const FIREBALL = "elementalist.fireball";
const FLARE = "elementalist.flare";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1000,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  } satisfies ParticipantSpec;
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

interface Logged {
  readonly skillId: string;
  readonly events: readonly CombatEvent[];
}

function stepFor(sim: MatchSimulation, seconds: number): Logged[] {
  const logged: Logged[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    for (const entry of sim.step(DT).log) {
      if (entry.skillId !== undefined) {
        logged.push({ skillId: entry.skillId, events: entry.events });
      }
    }
  }
  return logged;
}

/** `casterId` uses its `slot` on `targetId`, which is allowed: every event logged for the next `seconds`. */
function cast(
  sim: MatchSimulation,
  casterId: string,
  slot: number,
  targetId: string,
  seconds = 2,
): Logged[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, seconds);
}

const eventsOf = (logged: readonly Logged[], skillId: string): CombatEvent[] =>
  logged.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

describe("the four are the corpus's (#2290)", () => {
  it.each([
    [MIND_WRACK, 49, "hex", "mesmer.domination-magic", 5, 1, 7, false],
    [IGNORANCE, 35, "hex", "mesmer.domination-magic", 10, 1, 10, false],
    [SIMPLE_THIEVERY, 1350, "spell", "mesmer.domination-magic", 10, 0.25, 10, true],
    [CHURNING_EARTH, 844, "spell", "elementalist.earth-magic", 15, 2, 30, false],
  ] as const)(
    "%s: gwId %i, %s, %s, %i energy, %d s, %i s recharge, elite %s",
    (id, gwId, type, attributeId, energy, activation, recharge, elite) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        elite,
      });
    },
  );
});

describe("Mind Wrack (#2290)", () => {
  /** Mesmer `e` at `rank`, its ally Mesmer `o`, foe `f`, hexed by `e`. */
  function wracked(rank: number) {
    const sim = new MatchSimulation({
      seed: "mind-wrack",
      participants: [
        spec("e", 0, vec2(0, 0), {
          skillBar: [MIND_WRACK, SHATTER_ENCHANTMENT, SHRINKING_ARMOR, BLINDING_FLASH, POWER_SPIKE],
          attributeRanks: ranked(rank),
        }),
        spec("o", 0, vec2(0, 100), { skillBar: [SHATTER_ENCHANTMENT] }),
        spec("f", 1, vec2(250, 0)),
      ],
    });
    cast(sim, "e", 0, "f", 1.2);
    expect(get(sim, "f").statuses.get("mind-wrack")?.sourceId).toBe("e");
    return sim;
  }

  const wrackLoss = (logged: readonly Logged[]) =>
    eventsOf(logged, MIND_WRACK).filter((event) => event.kind === "energy-loss");

  it.each([
    [12, 33],
    [0, 5],
  ] as const)("at Domination %i lasts %i s", (rank, seconds) => {
    const remaining = get(wracked(rank), "f").statuses.get("mind-wrack")?.remainingSeconds ?? 0;
    expect(remaining).toBeGreaterThan(seconds - 0.5);
    expect(remaining).toBeLessThanOrEqual(seconds);
  });

  it("its caster's non-hex Mesmer skill on the foe costs the foe 1 Energy", () => {
    const sim = wracked(12);
    expect(wrackLoss(cast(sim, "e", 1, "f"))).toEqual([
      { kind: "energy-loss", targetId: "f", amount: 1 },
    ]);
  });

  it("its caster's hex, its caster's non-Mesmer skill, and another Mesmer's skill do nothing", () => {
    const sim = wracked(12);
    expect(wrackLoss(cast(sim, "e", 2, "f"))).toEqual([]);
    expect(wrackLoss(cast(sim, "e", 3, "f"))).toEqual([]);
    expect(wrackLoss(cast(sim, "o", 0, "f"))).toEqual([]);
    expect(get(sim, "f").statuses.has("mind-wrack")).toBe(true);
  });

  it.each([
    [12, 83],
    [0, 15],
  ] as const)(
    "at Domination %i, the loss that empties the foe ends the hex for %i damage, once",
    (rank, damage) => {
      const sim = wracked(rank);
      get(sim, "f").energy = 1.05;
      const logged = cast(sim, "e", 4, "f", 1);
      const wrack = eventsOf(logged, MIND_WRACK);
      expect(wrack.filter((event) => event.kind === "damage")).toEqual([
        expect.objectContaining({ kind: "damage", targetId: "f", amount: damage }),
      ]);
      expect(get(sim, "f").statuses.has("mind-wrack")).toBe(false);
    },
  );
});

describe("Ignorance (#2290)", () => {
  function ignorant(rank: number) {
    const sim = new MatchSimulation({
      seed: "ignorance",
      participants: [
        spec("e", 0, vec2(0, 0), { skillBar: [IGNORANCE], attributeRanks: ranked(rank) }),
        spec("f", 1, vec2(250, 0), { skillBar: [HEALING_SIGNET, FIREBALL] }),
      ],
    });
    return sim;
  }

  it.each([
    // 8...20 at 12: 17.6, as durations round.
    [12, 18],
    [0, 8],
  ] as const)("at Domination %i lasts %i s", (rank, seconds) => {
    const sim = ignorant(rank);
    cast(sim, "e", 0, "f", 1.2);
    const remaining = get(sim, "f").statuses.get("ignorance")?.remainingSeconds ?? 0;
    expect(remaining).toBeGreaterThan(seconds - 0.5);
    expect(remaining).toBeLessThanOrEqual(seconds);
  });

  it("refuses the foe's signet, and nothing else", () => {
    const sim = ignorant(12);
    cast(sim, "e", 0, "f", 1.2);
    sim.setTarget("f", "e");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: false, reason: "cannot-use-signets" });
    expect(sim.requestSkill("f", 1)?.check).toEqual({ ok: true });
  });

  it("a signet already activating finishes", () => {
    const sim = ignorant(12);
    get(sim, "f").health = 500;
    sim.setTarget("f", "f");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    const logged = cast(sim, "e", 0, "f", 2.5);
    expect(get(sim, "f").statuses.has("ignorance")).toBe(true);
    expect(eventsOf(logged, HEALING_SIGNET)).toContainEqual(
      expect.objectContaining({ kind: "heal", targetId: "f" }),
    );
  });
});

describe("Simple Thievery (#2290)", () => {
  /** Mesmer `a` at `rank`; foe `f`, whose Flare recharges at once. */
  function thief(rank: number) {
    return new MatchSimulation({
      seed: "simple-thievery",
      participants: [
        spec("a", 0, vec2(0, 0), {
          skillBar: [SIMPLE_THIEVERY],
          attributeRanks: ranked(rank),
        }),
        spec("f", 1, vec2(250, 0), { skillBar: [FLARE] }),
      ],
    });
  }

  const held = (sim: MatchSimulation) => {
    const a = get(sim, "a");
    return slotSkill(a.skillBar, a.cast, 0);
  };

  it.each([
    [12, 17],
    [0, 5],
  ] as const)(
    "at Domination %i interrupts the skill, disables it %i s, and holds it as long",
    (rank, seconds) => {
      const sim = thief(rank);
      sim.setTarget("f", "a");
      expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
      stepFor(sim, 0.5);
      const logged = cast(sim, "a", 0, "f", 0.5);
      expect(eventsOf(logged, SIMPLE_THIEVERY)).toContainEqual(
        expect.objectContaining({ kind: "interrupted", targetId: "f" }),
      );
      const disabled = get(sim, "f").cast.rechargeRemaining.get(FLARE) ?? 0;
      expect(disabled).toBeGreaterThan(seconds - 0.5);
      expect(disabled).toBeLessThanOrEqual(seconds);
      expect(held(sim)).toEqual({ skillId: FLARE, key: copyKey(FLARE, 0) });
      stepFor(sim, seconds);
      expect(held(sim)?.skillId).toBe(SIMPLE_THIEVERY);
    },
  );

  it("a foe doing nothing loses nothing, and the slot keeps Simple Thievery", () => {
    const sim = thief(12);
    cast(sim, "a", 0, "f", 0.5);
    expect(get(sim, "f").cast.rechargeRemaining.has(FLARE)).toBe(false);
    expect(held(sim)?.skillId).toBe(SIMPLE_THIEVERY);
  });

  it("Arcane Thievery copies its random spell", () => {
    expect(skill("mesmer.arcane-thievery").effects).toContainEqual({
      kind: "copy-disabled",
      which: "random-spell",
    });
  });
});

describe("target-moving-faster (#2290)", () => {
  const KNOCK: readonly SkillEffect[] = [
    {
      kind: "if",
      condition: { kind: "target-moving-faster" },
      effects: [{ kind: "knockdown", durationSeconds: 2 }],
    },
  ];

  function knocked(target: Combatant): boolean {
    const caster = makeCombatant({ id: "c", team: 0 });
    return applyEffects(KNOCK, {
      caster,
      target,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    }).some((event) => event.kind === "knocked-down");
  }

  it("knocks down a foe moving with a speed boost", () => {
    const target = makeCombatant({ id: "t", team: 1, moving: true });
    target.statuses.apply("armor-of-mist", 10, "t", NO_RANKS);
    expect(knocked(target)).toBe(true);
  });

  it("not one moving at normal speed, or slowed", () => {
    expect(knocked(makeCombatant({ id: "t", team: 1, moving: true }))).toBe(false);
    const slowed = makeCombatant({ id: "s", team: 1, moving: true });
    slowed.statuses.apply("crippled", 10, "s", NO_RANKS);
    expect(knocked(slowed)).toBe(false);
  });

  it("not one standing still with a speed boost", () => {
    const target = makeCombatant({ id: "t", team: 1, moving: false });
    target.statuses.apply("armor-of-mist", 10, "t", NO_RANKS);
    expect(knocked(target)).toBe(false);
  });
});

describe("Churning Earth (#2290)", () => {
  /**
   * Elementalist `e` at `rank` casts on `f`; `f` and `h` walk off as it
   * lands, `f` with a speed boost; `g`, boosted too, stands still.
   */
  function churned(rank: number): Logged[] {
    const sim = new MatchSimulation({
      seed: "churning-earth",
      participants: [
        spec("e", 0, vec2(0, 0), { skillBar: [CHURNING_EARTH], attributeRanks: ranked(rank) }),
        spec("f", 1, vec2(300, 0)),
        spec("g", 1, vec2(300, -60)),
        spec("h", 1, vec2(300, 60)),
      ],
    });
    get(sim, "f").statuses.apply("armor-of-mist", 30, "f", NO_RANKS);
    get(sim, "g").statuses.apply("armor-of-mist", 30, "g", NO_RANKS);
    sim.setTarget("e", "f");
    expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
    const logged = stepFor(sim, 1.8);
    sim.walkTo("f", vec2(2000, 0));
    sim.walkTo("h", vec2(2000, 60));
    return [...logged, ...stepFor(sim, 0.5)];
  }

  it.each([
    [12, 34],
    [0, 10],
  ] as const)(
    "at Earth Magic %i strikes each foe near, %i earth to one in no armor",
    (rank, damage) => {
      const strikes = eventsOf(churned(rank), CHURNING_EARTH);
      expect(strikes).toContainEqual(
        expect.objectContaining({ kind: "damage", targetId: "h", amount: damage }),
      );
      // Armor of Mist's armor takes its share.
      for (const id of ["f", "g"]) {
        expect(strikes).toContainEqual(expect.objectContaining({ kind: "damage", targetId: id }));
      }
    },
  );

  it("knocks down only the foe moving faster than normal", () => {
    const knocked = eventsOf(churned(12), CHURNING_EARTH)
      .filter((event) => event.kind === "knocked-down")
      .map((event) => ("targetId" in event ? event.targetId : undefined));
    expect(knocked).toEqual(["f"]);
  });

  it("lasts 5 s, flat", () => {
    const [ground] = skill(CHURNING_EARTH).effects;
    expect(ground).toMatchObject({ kind: "create-ground-effect", durationSeconds: { flat: 5 } });
  });
});
