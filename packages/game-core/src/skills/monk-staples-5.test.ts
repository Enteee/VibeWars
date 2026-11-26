import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { canActivate, payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, clampPips, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { netPips } from "./tick.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Monk staples 5 (#1650): Healing Whisper, Jamei's Gaze, Glimmer of Light,
 * Healing Light, Signet of Devotion, Divine Healing, Heaven's Delight,
 * Purge Conditions, Mend Ailment, Stonesoul Strike and Shield of
 * Regeneration. Numbers are the corpus's at rank 12; Divine Favor counts
 * only where its own skills scale with it, so no heal carries its bonus.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const DT = 1 / MINIMAL_GW_INSPIRED_PVP_V1.tickRateHz;
const RANKS = new Map([
  ["monk.healing-prayers", 12],
  ["monk.protection-prayers", 12],
  ["monk.smiting-prayers", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function monk(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "monk", attributeRanks: RANKS, ...overrides });
}

function ally(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "ally", health: 100, maxHealth: 500, ...overrides });
}

/** `user` pays for `skillId` and it lands on `targets`. */
function use(user: Combatant, skillId: string, ...targets: Combatant[]): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES,
  });
}

/** What `events` healed `id` for. */
function healed(events: readonly CombatEvent[], id = "ally"): number {
  return events.reduce(
    (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

/** What `events` dealt `id`, packet by packet. */
function packets(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

describe("the eleven are the corpus's (#1650)", () => {
  it.each([
    ["healing-whisper", 958, "spell", false, "healing-prayers", 5, 1, 1, "single-other-ally"],
    ["jameis-gaze", 1120, "spell", false, "healing-prayers", 10, 0.75, 3, "single-other-ally"],
    ["glimmer-of-light", 1686, "spell", true, "healing-prayers", 5, 0.25, 1, "single-ally"],
    ["healing-light", 867, "spell", true, "healing-prayers", 5, 0.75, 4, "single-ally"],
    ["signet-of-devotion", 293, "signet", false, "divine-favor", 0, 2, 5, "single-ally"],
    ["divine-healing", 279, "spell", false, "divine-favor", 5, 1, 12, "self"],
    ["heavens-delight", 1117, "spell", false, "divine-favor", 5, 1, 12, "self"],
    ["purge-conditions", 278, "spell", false, undefined, 5, 0.25, 20, "single-ally"],
    ["mend-ailment", 277, "spell", false, "protection-prayers", 5, 0.75, 5, "single-ally"],
    ["stonesoul-strike", 1131, "skill", false, "smiting-prayers", 5, 0.75, 8, "single-enemy"],
    [
      "shield-of-regeneration",
      261,
      "enchantment",
      true,
      "protection-prayers",
      10,
      0.25,
      8,
      "single-ally",
    ],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge, on %s",
    (slug, gwId, type, elite, attribute, energy, activation, recharge, target) => {
      expect(skill(`monk.${slug}`)).toMatchObject({
        gwId,
        type,
        elite,
        profession: "monk",
        attributeId: attribute === undefined ? undefined : `monk.${attribute}`,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        target,
      });
    },
  );
});

describe("the single heals (#1650)", () => {
  it.each([
    ["healing-whisper", 88],
    ["jameis-gaze", 151],
    ["glimmer-of-light", 94],
    ["signet-of-devotion", 100],
  ] as const)("%s heals %i at rank 12", (slug, amount) => {
    const user = monk({ attributeRanks: new Map([...RANKS, ["monk.divine-favor", 12]]) });
    // Divine Favor's bonus rides on spells, so the signet's 100 is its own.
    const expected = slug === "signet-of-devotion" ? amount : amount + 38;
    expect(healed(use(user, `monk.${slug}`, ally()))).toBe(expected);
  });

  it("Healing Whisper has half the normal range", () => {
    expect(skill("monk.healing-whisper").range).toBe(RANGE_SPELL / 2);
    expect(skill("monk.jameis-gaze").range).toBe(RANGE_SPELL);
  });

  it.each(["healing-whisper", "jameis-gaze"])("%s cannot be cast on yourself", (slug) => {
    const caster = monk();
    const check = canActivate({
      skill: skill(`monk.${slug}`),
      caster,
      casterPosition: vec2(0, 0),
      target: caster,
      targetPosition: vec2(0, 0),
      targetCreatureKind: undefined,
      targetCreatureOwnerId: undefined,
      rechargeRemaining: new Map(),
      spent: new Set(),
      isCasting: false,
      skillBar: [`monk.${slug}`],
      losBlockers: [],
    });
    expect(check).toEqual({ ok: false, reason: "invalid-target-self" });
    expect(caster.energy).toBe(50);
  });
});

describe("Healing Light (#1650)", () => {
  it("heals 104, and an enchanted ally gives the Monk 3 energy", () => {
    const user = monk();
    const target = ally();
    target.statuses.apply("healing-breeze", 15, "monk", NO_RANKS);
    expect(healed(use(user, "monk.healing-light", target))).toBe(104);
    expect(user.energy).toBe(48);
  });

  it("an unenchanted ally is healed, and no energy comes back", () => {
    const user = monk();
    expect(healed(use(user, "monk.healing-light", ally()))).toBe(104);
    expect(user.energy).toBe(45);
  });
});

describe("Divine Healing and Heaven's Delight (#1650)", () => {
  it.each(["divine-healing", "heavens-delight"])(
    "%s heals the Monk and everyone in earshot for 51",
    (slug) => {
      expect(skill(`monk.${slug}`).area).toMatchObject({
        radius: AREA_EARSHOT,
        origin: "caster",
        affects: "allies",
        includesCaster: true,
      });
      const user = monk({ health: 100, attributeRanks: new Map([["monk.divine-favor", 12]]) });
      const other = ally();
      const events = use(user, `monk.${slug}`, user, other);
      // Divine Favor's own 38 lands on the primary target, the Monk.
      expect([healed(events, "monk"), healed(events, "ally")]).toEqual([51 + 38, 51]);
    },
  );
});

describe("Purge Conditions (#1650)", () => {
  it("takes every condition and leaves hexes", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("crippled", 10, "foe", NO_RANKS);
    target.statuses.apply("empathy", 10, "foe", NO_RANKS);
    use(monk(), "monk.purge-conditions", target);
    expect(target.statuses.countByCategory("condition")).toBe(0);
    expect(target.statuses.has("empathy")).toBe(true);
  });
});

describe("Mend Ailment (#1650)", () => {
  it.each([
    [3, 2, 2 * 57],
    [1, 0, 0],
    [0, 0, 0],
  ] as const)("on %i conditions: %i left, healed %i", (conditions, left, amount) => {
    const target = ally();
    for (const id of (["bleeding", "poison", "crippled"] as const).slice(0, conditions)) {
      target.statuses.apply(id, 10, "foe", NO_RANKS);
    }
    const events = use(monk(), "monk.mend-ailment", target);
    expect(target.statuses.countByCategory("condition")).toBe(left);
    expect(healed(events)).toBe(amount);
  });
});

describe("Stonesoul Strike (#1650)", () => {
  it("is a touch skill, not a spell, so Spell Breaker does not stop it", () => {
    expect(skill("monk.stonesoul-strike").range).toBe(RANGE_MELEE);
    const foe = makeCombatant({ id: "foe", team: 1 });
    foe.statuses.apply("spell-breaker", 15, "foe", NO_RANKS);
    expect(
      canActivate({
        skill: skill("monk.stonesoul-strike"),
        caster: monk(),
        casterPosition: vec2(0, 0),
        target: foe,
        targetPosition: vec2(RANGE_MELEE / 2, 0),
        targetCreatureKind: undefined,
        targetCreatureOwnerId: undefined,
        rechargeRemaining: new Map(),
        spent: new Set(),
        isCasting: false,
        skillBar: ["monk.stonesoul-strike"],
        losBlockers: [],
      }),
    ).toEqual({ ok: true });
  });

  it("deals 46 holy, and one packet of 92 to a knocked-down foe", () => {
    const standing = makeCombatant({ id: "foe", team: 1 });
    expect(packets(use(monk(), "monk.stonesoul-strike", standing), "foe")).toEqual([46]);
    const down = makeCombatant({ id: "foe", team: 1, knockdownRemaining: 2 });
    expect(packets(use(monk(), "monk.stonesoul-strike", down), "foe")).toEqual([92]);
  });
});

describe("Shield of Regeneration (#1650)", () => {
  it("+9 regeneration and +40 armor for 11 s", () => {
    const target = ally();
    use(monk(), "monk.shield-of-regeneration", target);
    expect(target.statuses.get("shield-of-regeneration")?.durationSeconds).toBe(11);
    const definition = getStatusDefinition("shield-of-regeneration");
    expect([definition.category, definition.healthPips, definition.armorModifier]).toEqual([
      "enchantment",
      9,
      40,
    ]);
  });

  it("its regeneration is capped as every regeneration is", () => {
    const target = ally();
    target.statuses.apply("shield-of-regeneration", 11, "monk", NO_RANKS);
    target.statuses.apply("healing-breeze", 15, "monk", NO_RANKS);
    expect(netPips(target, 0, 0).health).toBe(clampPips(9 + 8));
    expect(netPips(target, 0, 0).health).toBe(10);
  });
});

describe("in a match (#1650)", () => {
  const BAR = ["monk.divine-healing", "monk.healing-whisper"];

  function body(id: string, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team: 1,
      skillBar: BAR,
      attributeRanks: new Map([...RANKS, ["monk.divine-favor", 12]]),
      equipment: unarmedResolvedEquipment(RULES.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 50,
      spawn,
      facing: 0,
    };
  }

  /** Monk `m`; `near` in earshot, `far` out of it; all at 100 Health. */
  function match(): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "monk-staples-5",
      participants: [
        body("m", vec2(0, 0)),
        body("near", vec2(AREA_EARSHOT - 100, 0)),
        body("far", vec2(AREA_EARSHOT + 300, 0)),
      ],
    });
    for (const id of ["m", "near", "far"]) {
      get(sim, id).health = 100;
    }
    return sim;
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

  function healedBy(log: readonly CombatLogEntry[], id: string): number {
    return healed(
      log
        .filter((entry) => entry.skillId === "monk.divine-healing")
        .flatMap((entry) => entry.events),
      id,
    );
  }

  it("Divine Healing heals the Monk and the ally in earshot, not the one beyond", () => {
    const sim = match();
    expect(sim.requestSkill("m", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 1.5);
    // Divine Favor at 12: 51 each, and its own 38 on the primary target, the Monk.
    expect(["m", "near", "far"].map((id) => healedBy(log, id))).toEqual([51 + 38, 51, 0]);
  });

  it("Healing Whisper on the Monk itself is refused, nothing spent", () => {
    const sim = match();
    sim.setTarget("m", "m");
    expect(sim.requestSkill("m", 1)?.check).toEqual({ ok: false, reason: "invalid-target-self" });
    expect(get(sim, "m").energy).toBe(50);
  });
});
