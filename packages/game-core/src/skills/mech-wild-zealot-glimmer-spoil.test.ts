import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_MELEE } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { gainStrikes } from "./adrenaline.js";
import { getSkill } from "./catalog.js";
import { applyEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireTriggers, type AimedAt } from "./triggers.js";
import type { Combatant, Skill, Surroundings } from "./types.js";
import { resolveAttackSkill } from "./weapon-attack.js";

/**
 * Wild Blow, Zealot's Fire, Glimmering Mark and Spoil Victor (#2282):
 * losing all adrenaline on an energy skill, a use trigger on a skill aimed
 * at an ally, a hex its own caster ends, and a trigger on a weaker victim.
 * The corpus's numbers, at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ATTRIBUTES = [
  "monk.smiting-prayers",
  "elementalist.air-magic",
  "necromancer.blood-magic",
  "warrior.swordsmanship",
];
const ranked = (rank: number) => new Map(ATTRIBUTES.map((id) => [id, rank]));

const steady = (roll = 0.9): SimulationRng =>
  Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => roll });

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

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

function placed(...entries: readonly (readonly [Combatant, Vec2])[]): Surroundings {
  return new Map(
    entries.map(([combatant, position]) => [
      combatant.id,
      { combatant, position, floors: 1, layer: 0, creature: undefined, corpseExploited: false },
    ]),
  );
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

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `casterId` uses its `slot` on `targetId`: every event logged for the next `seconds`, entry by entry. */
function cast(
  sim: MatchSimulation,
  casterId: string,
  slot: number,
  targetId: string,
  seconds = 2,
): { readonly skillId: string; readonly events: readonly CombatEvent[] }[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  const logged: { skillId: string; events: readonly CombatEvent[] }[] = [];
  for (let tick = 0; tick < Math.round(seconds / DT); tick += 1) {
    for (const entry of sim.step(DT).log) {
      if (entry.skillId !== undefined) {
        logged.push({ skillId: entry.skillId, events: entry.events });
      }
    }
  }
  return logged;
}

const eventsOf = (logged: ReturnType<typeof cast>, skillId: string): CombatEvent[] =>
  logged.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);

describe("the four are the corpus's (#2282)", () => {
  it.each([
    ["warrior.wild-blow", 321, "attack", undefined, 5, 0, 8, false],
    ["monk.zealots-fire", 271, "enchantment", "monk.smiting-prayers", 10, 0.25, 30, false],
    ["elementalist.glimmering-mark", 227, "hex", "elementalist.air-magic", 10, 1, 15, true],
    ["necromancer.spoil-victor", 1066, "hex", "necromancer.blood-magic", 10, 1, 10, true],
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

  it("loses all adrenaline wherever it moved from the cost", () => {
    expect(
      ["warrior.wild-blow", "warrior.heavy-blow", "warrior.decapitate"].map(
        (id) => skill(id).losesAllAdrenaline,
      ),
    ).toEqual([true, true, true]);
  });
});

describe("Wild Blow (#2282)", () => {
  function warrior(): Combatant {
    const w = makeCombatant({ id: "w", equipment: SWORD, attributeRanks: ranked(12) });
    w.adrenaline.set("warrior.sever-artery", 0);
    gainStrikes(w, 6, 0);
    return w;
  }

  function strike(w: Combatant, foe: Combatant, roll?: number): CombatEvent[] {
    payCost(skill("warrior.wild-blow"), w);
    return resolveAttackSkill(
      {
        skill: skill("warrior.wild-blow"),
        caster: w,
        targets: [foe],
        rng: steady(roll),
        rules: RULES.combat,
        surroundings: new Map(),
      },
      () => false,
      [],
    );
  }

  it("costs 5 Energy and empties every pool", () => {
    const w = warrior();
    const before = w.energy;
    payCost(skill("warrior.wild-blow"), w);
    expect(w.energy).toBe(before - 5);
    expect([...w.adrenaline.values()]).toEqual([0]);
  });

  it("a hit is a critical, unblocked, and ends the target's stance", () => {
    const foe = makeCombatant({ id: "f", team: 1 });
    foe.statuses.apply("gladiators-defense", 30, "f", NO_RANKS);
    const events = strike(warrior(), foe);
    expect(events.some((event) => event.kind === "attack-blocked")).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ kind: "damage", targetId: "f", critical: true }),
    );
    expect(foe.statuses.has("gladiators-defense")).toBe(false);
  });

  it("a miss still empties adrenaline, with no critical, and the stance stays", () => {
    const w = warrior();
    w.statuses.apply("blind", 30, "f", NO_RANKS);
    const foe = makeCombatant({ id: "f", team: 1 });
    foe.statuses.apply("gladiators-defense", 30, "f", NO_RANKS);
    const events = strike(w, foe, 0);
    expect(events.some((event) => event.kind === "damage")).toBe(false);
    expect(foe.statuses.has("gladiators-defense")).toBe(true);
    expect([...w.adrenaline.values()]).toEqual([0]);
  });

  it("is usable with no adrenaline, and its blow earns none back", () => {
    const sim = new MatchSimulation({
      seed: "wild-blow",
      participants: [
        spec("w", 0, vec2(0, 0), {
          skillBar: ["warrior.wild-blow", "warrior.sever-artery"],
          equipment: SWORD,
          attributeRanks: ranked(12),
        }),
        spec("f", 1, vec2(RANGE_MELEE / 2, 0)),
      ],
    });
    const logged = cast(sim, "w", 0, "f", 2);
    expect(eventsOf(logged, "warrior.wild-blow")).toContainEqual(
      expect.objectContaining({ kind: "damage", targetId: "f", critical: true }),
    );
    expect([...get(sim, "w").combatant.adrenaline.values()].every((units) => units === 0)).toBe(
      true,
    );
  });
});

describe("Zealot's Fire (#2282)", () => {
  /** Monk `m` under Zealot's Fire at `rank`, ally `a` with foe `g` adjacent, foe `f` far off. */
  function scene(rank: number) {
    const sim = new MatchSimulation({
      seed: "zealots-fire",
      participants: [
        spec("m", 0, vec2(0, 0), {
          skillBar: ["monk.zealots-fire", "monk.orison-of-healing", "monk.smite"],
          attributeRanks: ranked(rank),
        }),
        spec("a", 0, vec2(400, 0)),
        spec("g", 1, vec2(400 + AREA_ADJACENT / 2, 0)),
        spec("f", 1, vec2(-600, 0)),
      ],
    });
    const lit = cast(sim, "m", 0, "m");
    expect(get(sim, "m").combatant.statuses.has("zealots-fire")).toBe(true);
    return { sim, lit };
  }

  const fireOf = (logged: ReturnType<typeof cast>) => eventsOf(logged, "monk.zealots-fire");

  it("its own cast does not set it off", () => {
    const { lit } = scene(12);
    expect(lit.flatMap((entry) => entry.events)).not.toContainEqual(
      expect.objectContaining({ kind: "energy-loss", targetId: "m" }),
    );
  });

  it.each([
    [12, 29],
    [0, 5],
  ] as const)(
    "at Smiting Prayers %i a skill on an ally burns its adjacent foes for %i",
    (rank, damage) => {
      const { sim } = scene(rank);
      const fired = fireOf(cast(sim, "m", 1, "a"));
      expect(fired).toContainEqual(
        expect.objectContaining({ kind: "damage", targetId: "g", amount: damage }),
      );
      expect(fired).not.toContainEqual(expect.objectContaining({ targetId: "a" }));
      expect(fired).not.toContainEqual(expect.objectContaining({ targetId: "f" }));
      expect(fired).toContainEqual({ kind: "energy-loss", targetId: "m", amount: 1 });
    },
  );

  it("a skill on itself counts, and costs the Energy with no foe adjacent", () => {
    const { sim } = scene(12);
    const fired = fireOf(cast(sim, "m", 1, "m"));
    expect(fired.some((event) => event.kind === "damage")).toBe(false);
    expect(fired).toContainEqual({ kind: "energy-loss", targetId: "m", amount: 1 });
  });

  it("a skill on a foe does nothing", () => {
    const { sim } = scene(12);
    get(sim, "f").combatant.statuses.apply("bleeding", 30, "m", NO_RANKS);
    expect(fireOf(cast(sim, "m", 2, "g"))).toEqual([]);
  });

  it("lasts 60 s, flat", () => {
    const { sim } = scene(0);
    expect(get(sim, "m").combatant.statuses.get("zealots-fire")?.remainingSeconds).toBeGreaterThan(
      57,
    );
  });
});

describe("Glimmering Mark (#2282)", () => {
  /** Elementalist `e` at `rank`, foe `f` with `g` adjacent and `h` far off; ally `o` of `e`'s. */
  function hexed(rank: number) {
    const sim = new MatchSimulation({
      seed: "glimmering-mark",
      participants: [
        spec("e", 0, vec2(0, 0), {
          skillBar: ["elementalist.glimmering-mark", "elementalist.blinding-flash"],
          attributeRanks: ranked(rank),
        }),
        spec("o", 0, vec2(0, 100), { skillBar: ["elementalist.blinding-flash"] }),
        spec("f", 1, vec2(250, 0)),
        spec("g", 1, vec2(250 + AREA_ADJACENT / 2, 0)),
        spec("h", 1, vec2(250 + AREA_ADJACENT * 3, 0)),
      ],
    });
    cast(sim, "e", 0, "f", 1.2);
    expect(get(sim, "f").combatant.statuses.get("glimmering-mark")?.sourceId).toBe("e");
    return sim;
  }

  it.each([
    [12, 21],
    [0, 5],
  ] as const)(
    "at Air Magic %i strikes the foe and its adjacent foes for %i lightning a second",
    (rank, damage) => {
      const sim = hexed(rank);
      const pulses = eventsOf(cast(sim, "o", 0, "h", 1.05), "elementalist.glimmering-mark");
      for (const id of ["f", "g"]) {
        expect(pulses).toContainEqual(
          expect.objectContaining({ kind: "damage", targetId: id, amount: damage }),
        );
      }
      expect(pulses).not.toContainEqual(expect.objectContaining({ targetId: "h" }));
    },
  );

  it("lasts 10 s, flat", () => {
    expect(
      get(hexed(0), "f").combatant.statuses.get("glimmering-mark")?.remainingSeconds,
    ).toBeGreaterThan(8.5);
  });

  it("ends when its caster uses a skill on the foe, before that skill lands, which still does", () => {
    const sim = hexed(12);
    const logged = cast(sim, "e", 1, "f", 2.5);
    const flash = logged.findIndex(
      (entry) =>
        entry.skillId === "elementalist.blinding-flash" &&
        entry.events.some((event) => event.kind === "status-applied"),
    );
    const ended = logged.findIndex((entry) =>
      entry.events.some(
        (event) =>
          event.kind === "status-expired" &&
          event.targetId === "f" &&
          event.statusId === "glimmering-mark",
      ),
    );
    expect(ended).toBeGreaterThanOrEqual(0);
    expect(ended).toBeLessThan(flash);
    expect(get(sim, "f").combatant.statuses.has("glimmering-mark")).toBe(false);
    expect(get(sim, "f").combatant.statuses.has("blind")).toBe(true);
  });

  it("another's skill on the foe leaves it", () => {
    const sim = hexed(12);
    cast(sim, "o", 0, "f", 1.2);
    expect(get(sim, "f").combatant.statuses.has("blind")).toBe(true);
    expect(get(sim, "f").combatant.statuses.has("glimmering-mark")).toBe(true);
  });

  it("Blinds for 3 s only those using an attack skill as it pulses, the hexed foe too", () => {
    const e = makeCombatant({ id: "e", attributeRanks: ranked(12) });
    const f = makeCombatant({ id: "f", team: 1 });
    const g = makeCombatant({ id: "g", team: 1 });
    const k = makeCombatant({ id: "k", team: 1 });
    f.cast.beginCast("warrior.wild-blow", "e", 1, undefined);
    g.cast.beginCast("monk.orison-of-healing", "g", 1, undefined);
    k.cast.beginCast("warrior.wild-blow", "e", 1, undefined);
    const pulse = getStatusDefinition("glimmering-mark").pulse;
    if (pulse === undefined) {
      throw new Error("no pulse");
    }
    applyEffects(pulse.effects, {
      caster: e,
      target: f,
      rng: steady(),
      rules: RULES.combat,
      surroundings: placed(
        [e, vec2(0, 0)],
        [f, vec2(500, 0)],
        [g, vec2(500 + AREA_ADJACENT / 2, 0)],
        [k, vec2(500, AREA_ADJACENT / 2)],
      ),
      usedSkill: undefined,
    });
    expect(f.statuses.get("blind")?.remainingSeconds).toBe(3);
    expect(k.statuses.get("blind")?.remainingSeconds).toBe(3);
    expect(g.statuses.has("blind")).toBe(false);
  });
});

describe("Spoil Victor (#2282)", () => {
  /** Foe `f` hexed by `n` at `rank`, at 500 Health. */
  function victor(rank: number): { n: Combatant; f: Combatant } {
    const n = makeCombatant({ id: "n", attributeRanks: ranked(rank) });
    const f = makeCombatant({ id: "f", team: 1, health: 500, maxHealth: 1000 });
    f.statuses.apply("spoil-victor", 10, "n", NO_RANKS);
    return { n, f };
  }

  function fire(
    { n, f }: { n: Combatant; f: Combatant },
    event: "bearer-attacks" | "bearer-casts-spell",
    aimedAt: AimedAt | undefined,
  ): CombatEvent[] {
    return fireTriggers(
      f,
      event,
      {
        sourceOf: (id) => [n, f].find((combatant) => combatant.id === id),
        rng: steady(),
        rules: RULES.combat,
        surroundings: new Map(),
        usedSkill: { skillId: "elementalist.blinding-flash", key: "elementalist.blinding-flash" },
        ...(aimedAt === undefined ? {} : { aimedAt }),
      },
      new Set(),
    ).flatMap(({ events }) => events);
  }

  it.each([
    ["bearer-attacks", 12, 63],
    ["bearer-casts-spell", 12, 63],
    ["bearer-attacks", 0, 15],
    ["bearer-casts-spell", 0, 15],
  ] as const)("on %s at a weaker creature, at Blood Magic %i, loses %i", (event, rank, lost) => {
    const pair = victor(rank);
    fire(pair, event, { id: "a", hadLessHealth: true });
    expect(pair.f.health).toBe(500 - lost);
  });

  it("not at a creature with as much Health or more, nor with no aim", () => {
    const pair = victor(12);
    fire(pair, "bearer-attacks", { id: "a", hadLessHealth: false });
    fire(pair, "bearer-casts-spell", { id: "a", hadLessHealth: false });
    fire(pair, "bearer-casts-spell", undefined);
    expect(pair.f.health).toBe(500);
  });

  it.each([
    [12, 13],
    [0, 3],
  ] as const)("at Blood Magic %i hexes for %i s", (rank, seconds) => {
    const n = makeCombatant({ id: "n", attributeRanks: ranked(rank) });
    const f = makeCombatant({ id: "f", team: 1 });
    payCost(skill("necromancer.spoil-victor"), n);
    applyEffects(skill("necromancer.spoil-victor").effects, {
      caster: n,
      target: f,
      rng: steady(),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    });
    expect(f.statuses.get("spoil-victor")?.remainingSeconds).toBe(seconds);
  });

  /** `f`, hexed, at `health`, casts at ally `a` of its own at 500 Health, and at `b` at 900. */
  function casting(health: number) {
    const sim = new MatchSimulation({
      seed: "spoil-victor",
      participants: [
        spec("n", 0, vec2(0, 0), {
          skillBar: ["necromancer.spoil-victor"],
          attributeRanks: ranked(12),
        }),
        spec("f", 1, vec2(250, 0), {
          skillBar: ["monk.orison-of-healing"],
          maxHealth: 1000,
        }),
        spec("a", 1, vec2(250, 200), { maxHealth: 1000 }),
      ],
    });
    get(sim, "a").combatant.health = 500;
    cast(sim, "n", 0, "f", 1.2);
    get(sim, "f").combatant.health = health;
    return sim;
  }

  it("in the match, a spell on a weaker creature, an ally of its own, costs it", () => {
    const sim = casting(900);
    const logged = cast(sim, "f", 0, "a", 1.2);
    expect(eventsOf(logged, "necromancer.spoil-victor")).toContainEqual(
      expect.objectContaining({ kind: "health-loss", targetId: "f" }),
    );
  });

  it("in the match, a spell on a stronger one does not", () => {
    const sim = casting(400);
    expect(eventsOf(cast(sim, "f", 0, "a", 1.2), "necromancer.spoil-victor")).toEqual([]);
  });
});
