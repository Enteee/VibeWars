import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyEffects, stateHolds } from "./effects.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import { NO_RANKS, HEALTH_PER_PIP, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { effectiveActivationSeconds } from "./tick.js";
import { fireTriggers } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mesmer skill-use punishers (#1473): Wastrel's Worry, Overload,
 * Frustration, Price of Pride, Signet of Humility, Migraine, Visions of
 * Regret and Unnatural Signet, plus the Elementalist's Mind Blast, and the
 * primitives they need. Durations and pips are rank-12 values; damage is
 * the caster's rank.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["mesmer.domination-magic", 12],
  ["mesmer.illusion-magic", 12],
  ["mesmer.inspiration-magic", 12],
  ["elementalist.fire-magic", 12],
]);
/** The foes' bar. */
const FIREBALL = 0;
const HEALING_SIGNET = 1;
const GLADIATORS_DEFENSE = 2;
const SPRINT = 3;
const FOE_HEALTH = 1e4;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** The Mesmer, at the origin, with `bar`. */
function mesmer(bar: readonly string[], energy = 1000): ParticipantSpec {
  return {
    id: "m",
    team: 1,
    skillBar: [...bar],
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e6,
    maxEnergy: energy,
    spawn: vec2(0, 0),
    facing: 0,
  };
}

/** A foe with Fireball, Healing Signet, Gladiator's Defense (elite) and Sprint. */
function foe(id: string, spawn: Vec2, energy = 1000): ParticipantSpec {
  return {
    id,
    team: 0,
    skillBar: [
      "elementalist.fireball",
      "warrior.healing-signet",
      "warrior.gladiators-defense",
      "warrior.sprint",
    ],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: FOE_HEALTH,
    maxEnergy: energy,
    spawn,
    facing: Math.PI,
  };
}

/** The Mesmer `m` with `bar`; foe `a` in range, `b` adjacent to it, `c` well away. */
function match(bar: readonly string[], foeEnergy = 1000): MatchSimulation {
  return new MatchSimulation({
    seed: "mesmer-hexes-2",
    participants: [
      mesmer(bar),
      foe("a", vec2(200, 0), foeEnergy),
      foe("b", vec2(230, 0), foeEnergy),
      foe("c", vec2(200, 200), foeEnergy),
    ],
  });
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

/**
 * `m` uses slot `slot` on `targetId`, and the steps until it has landed,
 * an aftercast before it included.
 */
function use(sim: MatchSimulation, slot: number, targetId = "a"): CombatLogEntry[] {
  sim.setTarget("m", targetId);
  expect(sim.requestSkill("m", slot)?.check).toEqual({ ok: true });
  const skillId = get(sim, "m").skillBar[slot] ?? "";
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(5 / DT); i += 1) {
    const entries = sim.step(DT).log;
    log.push(...entries);
    if (entries.some((entry) => entry.skillId === skillId && entry.sourceId === "m")) {
      return log;
    }
  }
  throw new Error(`${skillId} never landed`);
}

/** Foe `id` uses its slot `slot` on `targetId`, and the steps over `seconds`. */
function foeUses(
  sim: MatchSimulation,
  id: string,
  slot: number,
  seconds: number,
  targetId = "m",
): CombatLogEntry[] {
  sim.setTarget(id, targetId);
  expect(sim.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, seconds);
}

function damageTo(log: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === "damage" && event.targetId === id ? [event.amount] : []));
}

function lost(sim: MatchSimulation, id: string): number {
  return FOE_HEALTH - get(sim, id).health;
}

function worn(sim: MatchSimulation, id: string, statusId: StatusId): number | undefined {
  return get(sim, id).statuses.get(statusId)?.durationSeconds;
}

describe("the nine are the corpus's (#1473)", () => {
  it.each([
    ["mesmer.wastrels-worry", 50, "hex", false, "mesmer.domination-magic", 5, 0.25, 4],
    ["mesmer.overload", 898, "hex", false, "mesmer.domination-magic", 5, 0.25, 5],
    ["mesmer.frustration", 1341, "hex", false, "mesmer.illusion-magic", 10, 1, 15],
    ["mesmer.price-of-pride", 1655, "hex", false, "mesmer.domination-magic", 5, 1, 8],
    ["mesmer.migraine", 53, "hex", true, "mesmer.illusion-magic", 10, 2, 12],
    ["mesmer.visions-of-regret", 878, "hex", true, "mesmer.domination-magic", 10, 2, 30],
    ["elementalist.mind-blast", 1662, "spell", true, "elementalist.fire-magic", 5, 1, 2],
  ] as const)(
    "%s (%i): %s, elite %s, %s, %i energy, %i s, %i s",
    (id, gwId, type, elite, attributeId, energy, act, rech) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: { kind: "energy", amount: energy },
        activationSeconds: act,
        rechargeSeconds: rech,
      });
    },
  );

  it.each([
    ["mesmer.signet-of-humility", 62, "mesmer.inspiration-magic", 3, 20],
    ["mesmer.unnatural-signet", 934, "mesmer.domination-magic", 1, 20],
  ] as const)("%s (%i): a signet, %s, free, %i s, %i s", (id, gwId, attributeId, act, rech) => {
    expect(getSkill(id)).toMatchObject({
      gwId,
      type: "signet",
      elite: false,
      attributeId,
      cost: undefined,
      activationSeconds: act,
      rechargeSeconds: rech,
    });
  });

  it.each([
    ["mesmer.unnatural-signet", "mesmer.domination-magic", [10, 50, 60]],
    ["elementalist.mind-blast", "elementalist.fire-magic", [15, 51, 60]],
  ] as const)("%s deals %j at 0, 12 and 15", (id, attributeId, damage) => {
    const effect = skill(id).effects[0];
    if (effect?.kind !== "damage") {
      throw new Error(`${id} leads with no damage`);
    }
    expect(
      [0, 12, 15].map((rank) =>
        resolveMagnitudeAtRanks(effect.amount, new Map([[attributeId, rank]])),
      ),
    ).toEqual(damage);
  });
});

describe("skillActivationMultiplier (#1473)", () => {
  function bearer(...statuses: StatusId[]): Combatant {
    const combatant = makeCombatant({ id: "x" });
    for (const id of statuses) {
      combatant.statuses.apply(id, 10, "m", NO_RANKS);
    }
    return combatant;
  }

  it("doubles a spell's and a signet's activation, not an attack skill's", () => {
    const migraine = bearer("migraine");
    expect(effectiveActivationSeconds(skill("elementalist.fireball"), migraine)).toBe(2);
    expect(effectiveActivationSeconds(skill("warrior.healing-signet"), migraine)).toBe(4);
    expect(effectiveActivationSeconds(skill("warrior.distracting-blow"), migraine)).toBe(0.5);
  });

  it("multiplies with Dazed: a 2 s spell takes 8 s", () => {
    expect(effectiveActivationSeconds(skill("mesmer.migraine"), bearer("migraine", "dazed"))).toBe(
      8,
    );
  });

  it("Frustration's 50% slower casting is spells only", () => {
    const frustrated = bearer("frustration");
    expect(effectiveActivationSeconds(skill("elementalist.fireball"), frustrated)).toBe(1.5);
    expect(effectiveActivationSeconds(skill("warrior.healing-signet"), frustrated)).toBe(2);
  });
});

describe("target-using-skill and target-lacks-other-hex (#1473)", () => {
  const surroundings = new Map();

  it("using a skill is any activation, an attack skill's too", () => {
    const caster = makeCombatant({ id: "m" });
    const target = makeCombatant({ id: "x", team: 1 });
    const using = { kind: "target-using-skill" } as const;
    expect(stateHolds(using, caster, target, surroundings)).toBe(false);
    target.cast.beginCast("warrior.distracting-blow", "m", 0.5, undefined);
    expect(stateHolds(using, caster, target, surroundings)).toBe(true);
  });

  it("leaves out the firing status, and only that one", () => {
    const caster = makeCombatant({ id: "m" });
    const target = makeCombatant({ id: "x", team: 1 });
    const lacks = { kind: "target-lacks-other-hex", profession: "mesmer" } as const;
    target.statuses.apply("visions-of-regret", 10, "m", NO_RANKS);
    expect(stateHolds(lacks, caster, target, surroundings)).toBe(false);
    expect(stateHolds(lacks, caster, target, surroundings, "visions-of-regret")).toBe(true);
    target.statuses.apply("conjure-phantasm", 10, "m", NO_RANKS);
    expect(stateHolds(lacks, caster, target, surroundings, "visions-of-regret")).toBe(false);
  });

  it("a hex of another profession is no Mesmer hex", () => {
    const caster = makeCombatant({ id: "m" });
    const target = makeCombatant({ id: "x", team: 1 });
    target.statuses.apply("mind-freeze", 10, "m", NO_RANKS);
    expect(
      stateHolds(
        { kind: "target-lacks-other-hex", profession: "mesmer" },
        caster,
        target,
        surroundings,
      ),
    ).toBe(true);
  });
});

describe("disable-skill elite and disable-own-skills other-professions (#1473)", () => {
  it("disables the target's elite for its seconds; no elite, nothing", () => {
    const caster = makeCombatant({ id: "m", attributeRanks: RANKS });
    const target = makeCombatant({
      id: "x",
      team: 1,
      skillBar: ["warrior.sprint", "warrior.gladiators-defense", "elementalist.fireball"],
    });
    const events = applyEffects([skill("mesmer.signet-of-humility").effects[0] ?? never()], {
      caster,
      target,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
    expect(events).toEqual([
      { kind: "skill-disabled", targetId: "x", skillId: "warrior.gladiators-defense", seconds: 13 },
    ]);
    const plain = makeCombatant({ id: "y", team: 1, skillBar: ["warrior.sprint"] });
    expect(
      applyEffects([skill("mesmer.signet-of-humility").effects[0] ?? never()], {
        caster,
        target: plain,
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
      }),
    ).toEqual([]);
  });

  it("disables the user's non-Mesmer skills, common ones too, but the excepted types", () => {
    const caster = makeCombatant({
      id: "m",
      attributeRanks: RANKS,
      skillBar: [
        "mesmer.unnatural-signet",
        "mesmer.backfire",
        "elementalist.fireball",
        "warrior.healing-signet",
        "warrior.sprint",
      ],
    });
    const disabled = (except: readonly ("signet" | "stance")[]) => {
      const events = applyEffects(
        [
          {
            kind: "disable-own-skills",
            which: "other-professions",
            profession: "mesmer",
            exceptTypes: except,
            seconds: { flat: 10 },
          },
        ],
        {
          caster,
          target: undefined,
          rng: createRng(1),
          rules: RULES.combat,
          surroundings: new Map(),
        },
      );
      return events.flatMap((event) => (event.kind === "skill-disabled" ? [event.skillId] : []));
    };
    expect(disabled(["signet"])).toEqual(["elementalist.fireball", "warrior.sprint"]);
  });
});

function never(): never {
  throw new Error("missing effect");
}

describe("bearer-interrupted and usedSkill.elite (#1473)", () => {
  it("fires once per interrupt, with the interrupter the offender", () => {
    const sim = match(["mesmer.frustration", "mesmer.power-spike"]);
    use(sim, 0);
    expect(worn(sim, "a", "frustration")).toBe(17);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
    stepFor(sim, 0.1);
    const before = lost(sim, "a");
    const log = use(sim, 1);
    expect(get(sim, "a").cast.activeCast).toBeUndefined();
    expect(damageTo(log, "mesmer.frustration", "a")).toEqual([41]);
    expect(lost(sim, "a") - before).toBeGreaterThan(41);
    const change = get(sim, "a").statuses;
    change.recordInterrupt("m");
    expect(change.drainChanges()).toEqual([
      {
        kind: "interrupted",
        offenderId: "m",
        fired: [{ statusId: "frustration", sourceId: "m", trigger: expect.anything() }],
      },
    ]);
  });

  it("an elite-bound use trigger answers an elite skill, not another", () => {
    const bearer = makeCombatant({
      id: "x",
      team: 1,
      skillBar: ["warrior.sprint", "warrior.gladiators-defense"],
      energy: 30,
    });
    const source = makeCombatant({ id: "m", attributeRanks: RANKS });
    bearer.statuses.apply("price-of-pride", 5, "m", NO_RANKS);
    const context = (skillId: string) => ({
      sourceOf: (id: string) => (id === "m" ? source : id === "x" ? bearer : undefined),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: { skillId, key: skillId },
    });
    expect(fireTriggers(bearer, "bearer-uses-skill", context("warrior.sprint"), new Set())).toEqual(
      [],
    );
    expect(bearer.energy).toBe(30);
    const fired = fireTriggers(
      bearer,
      "bearer-uses-skill",
      context("warrior.gladiators-defense"),
      new Set(),
    );
    expect(fired.map(({ skillId }) => skillId)).toEqual(["mesmer.price-of-pride"]);
    expect(bearer.energy).toBe(30 - 13);
  });
});

describe("Wastrel's Worry (#1473)", () => {
  it("deals 84 to the target and 63 to adjacent foes when it expires", () => {
    const sim = match(["mesmer.wastrels-worry"]);
    use(sim, 0);
    expect(worn(sim, "a", "wastrels-worry")).toBe(3);
    const log = stepFor(sim, 3);
    expect(damageTo(log, "mesmer.wastrels-worry", "a")).toEqual([84]);
    expect(damageTo(log, "mesmer.wastrels-worry", "b")).toEqual([63]);
    expect(damageTo(log, "mesmer.wastrels-worry", "c")).toEqual([]);
  });

  it("does nothing if its bearer uses a skill first", () => {
    const sim = match(["mesmer.wastrels-worry"]);
    use(sim, 0);
    const log = foeUses(sim, "a", SPRINT, 3.2);
    expect(get(sim, "a").statuses.has("wastrels-worry")).toBe(false);
    expect(damageTo(log, "mesmer.wastrels-worry", "a")).toEqual([]);
    expect(lost(sim, "b")).toBe(0);
  });

  it("does nothing if it is stripped", () => {
    const sim = match(["mesmer.wastrels-worry"]);
    use(sim, 0);
    get(sim, "a").statuses.end("wastrels-worry");
    const log = stepFor(sim, 3.2);
    expect(damageTo(log, "mesmer.wastrels-worry", "a")).toEqual([]);
  });
});

describe("Overload (#1473)", () => {
  it("on a foe using a skill: 63 to it and 47 to adjacent foes, and -3 pips", () => {
    const sim = match(["mesmer.overload"]);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", HEALING_SIGNET)?.check).toEqual({ ok: true });
    stepFor(sim, 0.1);
    const log = use(sim, 0);
    expect(damageTo(log, "mesmer.overload", "a")).toEqual([63]);
    expect(damageTo(log, "mesmer.overload", "b")).toEqual([47]);
    expect(worn(sim, "a", "overload")).toBe(5);
    expect(get(sim, "a").statuses.get("overload")).toBeDefined();
  });

  it("on an idle foe: only the hex", () => {
    const sim = match(["mesmer.overload"]);
    const log = use(sim, 0);
    expect(damageTo(log, "mesmer.overload", "a")).toEqual([]);
    expect(damageTo(log, "mesmer.overload", "b")).toEqual([]);
    const before = lost(sim, "a");
    stepFor(sim, 1);
    expect(lost(sim, "a") - before).toBeCloseTo(3 * HEALTH_PER_PIP, 0);
  });
});

describe("Frustration (#1473)", () => {
  it("fires on a Dazed hit-interrupt as on a Mesmer interrupt", () => {
    const sim = new MatchSimulation({
      seed: "mesmer-hexes-2",
      participants: [
        mesmer(["mesmer.frustration"]),
        foe("a", vec2(200, 0)),
        { ...foe("w", vec2(230, 0)), team: 1 },
      ],
    });
    use(sim, 0);
    const a = get(sim, "a");
    a.statuses.apply("dazed", 10, "m", NO_RANKS);
    sim.setTarget("a", "m");
    expect(sim.requestSkill("a", FIREBALL)?.check).toEqual({ ok: true });
    expect(sim.requestAttack("w", "a")).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    const interrupted = log.flatMap((entry) =>
      entry.events.filter((event) => event.kind === "interrupted" && event.targetId === "a"),
    );
    expect(interrupted.length).toBe(1);
    expect(damageTo(log, "mesmer.frustration", "a")).toEqual([41]);
  });
});

describe("Price of Pride (#1473)", () => {
  it("takes 13 energy the next time the foe uses an elite, then ends", () => {
    const sim = match(["mesmer.price-of-pride"]);
    use(sim, 0);
    const a = get(sim, "a");
    foeUses(sim, "a", SPRINT, 0.2);
    expect(a.statuses.has("price-of-pride")).toBe(true);
    const before = a.energy;
    foeUses(sim, "a", GLADIATORS_DEFENSE, 0.2);
    expect(before - a.energy).toBeCloseTo(13 + 5, 0);
    expect(a.statuses.has("price-of-pride")).toBe(false);
  });
});

describe("Signet of Humility (#1473)", () => {
  it("disables the foe's elite for 13 s and the Mesmer's non-Mesmer skills for 4 s", () => {
    const sim = match(["mesmer.signet-of-humility", "mesmer.backfire", "warrior.sprint"]);
    use(sim, 0);
    expect(get(sim, "a").cast.rechargeRemaining.get("warrior.gladiators-defense")).toBeCloseTo(
      13 - 0.2,
      0,
    );
    const own = get(sim, "m").cast.rechargeRemaining;
    expect(own.get("warrior.sprint")).toBeCloseTo(4 - 0.2, 0);
    expect(own.has("mesmer.backfire")).toBe(false);
  });

  it("on a foe with no elite, the Mesmer still pays", () => {
    const sim = new MatchSimulation({
      seed: "mesmer-hexes-2",
      participants: [
        mesmer(["mesmer.signet-of-humility", "warrior.sprint"]),
        { ...foe("a", vec2(200, 0)), skillBar: ["warrior.sprint"] },
      ],
    });
    const log = use(sim, 0);
    expect(log.flatMap((entry) => entry.events).filter((e) => e.kind === "skill-disabled")).toEqual(
      [{ kind: "skill-disabled", targetId: "m", skillId: "warrior.sprint", seconds: 4 }],
    );
  });
});

describe("Migraine (#1473)", () => {
  it("-7 pips and twice as long to activate for 14 s", () => {
    const sim = match(["mesmer.migraine"]);
    use(sim, 0);
    expect(worn(sim, "a", "migraine")).toBe(14);
    const a = get(sim, "a");
    expect(effectiveActivationSeconds(skill("warrior.healing-signet"), a)).toBe(4);
    const before = lost(sim, "a");
    stepFor(sim, 1);
    expect(lost(sim, "a") - before).toBeCloseTo(7 * HEALTH_PER_PIP, 0);
  });
});

describe("Visions of Regret (#1473)", () => {
  it("hexes the target and adjacent foes; alone it hurts 26 + 33 per skill", () => {
    const sim = match(["mesmer.visions-of-regret"]);
    use(sim, 0);
    expect(worn(sim, "a", "visions-of-regret")).toBe(10);
    expect(worn(sim, "b", "visions-of-regret")).toBe(10);
    expect(worn(sim, "c", "visions-of-regret")).toBeUndefined();
    const log = foeUses(sim, "a", SPRINT, 0.2);
    expect(damageTo(log, "mesmer.visions-of-regret", "a")).toEqual([26, 33]);
  });

  it("with another Mesmer hex on, 26 only", () => {
    const sim = match(["mesmer.visions-of-regret", "mesmer.migraine"]);
    use(sim, 0);
    use(sim, 1);
    const log = foeUses(sim, "a", SPRINT, 0.2);
    expect(damageTo(log, "mesmer.visions-of-regret", "a")).toEqual([26]);
  });

  it("a plain swing is no skill", () => {
    const sim = match(["mesmer.visions-of-regret"]);
    use(sim, 0);
    expect(sim.requestAttack("a", "m")).toEqual({ ok: true });
    const log = stepFor(sim, 5);
    expect(log.some((entry) => entry.sourceId === "a" && entry.cause !== "skill")).toBe(true);
    expect(damageTo(log, "mesmer.visions-of-regret", "a")).toEqual([]);
  });
});

describe("Unnatural Signet (#1473)", () => {
  it("50 to the target; 50 to adjacent foes only if it is hexed or enchanted", () => {
    const sim = match(["mesmer.unnatural-signet", "mesmer.wastrels-worry"]);
    let log = use(sim, 0);
    expect(damageTo(log, "mesmer.unnatural-signet", "a")).toEqual([50]);
    expect(damageTo(log, "mesmer.unnatural-signet", "b")).toEqual([]);
    get(sim, "m").cast.endRecharge("mesmer.unnatural-signet");
    get(sim, "a").statuses.apply("conjure-phantasm", 10, "m", NO_RANKS);
    log = use(sim, 0);
    expect(damageTo(log, "mesmer.unnatural-signet", "b")).toEqual([50]);
  });
});

describe("Mind Blast (#1473)", () => {
  it("51 fire damage; 7 energy back if the caster has more energy", () => {
    const sim = match(["elementalist.mind-blast"], 10);
    get(sim, "m").energy = 100;
    const before = get(sim, "m").energy;
    const log = use(sim, 0);
    expect(damageTo(log, "elementalist.mind-blast", "a").length).toBe(1);
    expect(get(sim, "m").energy - before).toBeCloseTo(7 - 5, 0);
  });
});

describe("descriptions (#1473)", () => {
  it("say the new primitives plainly", () => {
    const ranks = RANKS;
    expect(describeStatus("migraine")).toContain("skills but attacks take 2× as long to activate");
    expect(describeStatus("frustration")).toContain("is interrupted");
    expect(describeStatus("price-of-pride")).toContain("uses an elite skill");
    expect(describeStatus("visions-of-regret")).toContain("if it has no other Mesmer hex");
    const humility = describeSkill(skill("mesmer.signet-of-humility"), ranks)
      .effects.map(({ text }) => text)
      .join(" ");
    expect(humility).toContain("The target's elite skill is disabled for 13 seconds");
    expect(humility).toContain("All of your non-Mesmer skills are disabled for 4 seconds");
    const unnatural = describeSkill(skill("mesmer.unnatural-signet"), ranks)
      .effects.map(({ text }) => text)
      .join(" ");
    expect(unnatural).toContain("All of your non-Mesmer skills except signets are disabled");
    const overload = describeSkill(skill("mesmer.overload"), ranks)
      .effects.map(({ text }) => text)
      .join(" ");
    expect(overload).toContain("If target is using a skill");
  });
});
