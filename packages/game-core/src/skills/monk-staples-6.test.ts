import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type TriggerContext } from "./triggers.js";
import { isEasilyInterrupted, type Combatant, type Skill } from "./types.js";

/**
 * Monk staples 6 (#1748): Ethereal Light, Gift of Health, Live
 * Vicariously, Purifying Veil, Pacifism, Watchful Spirit, Kirin's Wrath
 * and Signet of Removal. Numbers are the corpus's at rank 12. No Divine
 * Favor ranks but where its own skill scales with it, so no heal carries
 * its bonus.
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

/** The triggers `bearer`'s pending changes fire, `source` the status's caster. */
function fireChanges(bearer: Combatant, source: Combatant): CombatEvent[] {
  const context: TriggerContext = {
    sourceOf: (id) => (id === source.id ? source : id === bearer.id ? bearer : undefined),
    rng: createRng(1),
    rules: RULES,
    surroundings: new Map(),
    usedSkill: undefined,
  };
  return bearer.statuses
    .drainChanges()
    .flatMap((change) => fireChangeTriggers(bearer, change, () => [], context))
    .flatMap(({ events }) => events);
}

describe("the eight are the corpus's (#1748)", () => {
  it.each([
    ["ethereal-light", 959, "spell", false, "healing-prayers", 5, 1, 5, "single-ally"],
    ["gift-of-health", 1121, "spell", false, "healing-prayers", 5, 0.75, 5, "single-other-ally"],
    ["live-vicariously", 291, "enchantment", false, "healing-prayers", 5, 2, 0, "single-ally"],
    ["purifying-veil", 2007, "enchantment", false, "protection-prayers", 5, 1, 6, "single-ally"],
    ["pacifism", 264, "hex", false, "protection-prayers", 10, 2, 15, "single-enemy"],
    ["watchful-spirit", 255, "enchantment", false, "divine-favor", 15, 1, 5, "single-ally"],
    ["kirins-wrath", 1113, "spell", false, "smiting-prayers", 5, 1, 10, "self"],
    ["signet-of-removal", 1690, "signet", true, undefined, 0, 0.25, 5, "single-ally"],
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

  it.each([
    ["ethereal-light", ["Heals for 85", "Easily interrupted"]],
    [
      "gift-of-health",
      ["Heals for 123", "All of your other Healing Prayers are disabled for 6 seconds"],
    ],
    [
      "live-vicariously",
      [
        "Maintained: −1 Energy regeneration while it lasts. Heals its caster for 14 whenever it hits with an attack.",
      ],
    ],
    [
      "purifying-veil",
      [
        "Maintained: −1 Energy regeneration while it lasts. Conditions on the bearer expire 41% faster. When it ends: removes 1 condition.",
      ],
    ],
    [
      "pacifism",
      ["Applies Pacifism for 7s (cannot attack, ends if it takes damage or life steal from a foe)"],
    ],
    [
      "watchful-spirit",
      [
        "Maintained: −1 Energy regeneration while it lasts. +2 Health regeneration. When it ends: heals for 150.",
      ],
    ],
    [
      "signet-of-removal",
      [
        "If target has an enchantment: removes 1 hex",
        "If target has an enchantment: removes 1 condition",
      ],
    ],
  ] as const)("%s reads as GW1's", (slug, lines) => {
    const ranks = new Map([...RANKS, ["monk.divine-favor", 12]]);
    expect(describeSkill(skill(`monk.${slug}`), ranks).effects.map(({ text }) => text)).toEqual(
      lines,
    );
  });
});

describe("Ethereal Light (#1748)", () => {
  it("heals 85 at rank 12, and is easily interrupted", () => {
    expect(healed(use(monk(), "monk.ethereal-light", ally()))).toBe(85);
    expect(isEasilyInterrupted(skill("monk.ethereal-light"))).toBe(true);
    expect(isEasilyInterrupted(skill("monk.gift-of-health"))).toBe(false);
  });
});

describe("Purifying Veil (#1748)", () => {
  it("makes a condition run out 41% faster while maintained", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe");
    target.statuses.maintain("purifying-veil", "monk", 0);
    target.statuses.advance(1, false);
    expect(target.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(10 - 1.41);
  });

  it("removes one condition as it is dropped, a hex left alone", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe");
    target.statuses.apply("poison", 10, "foe");
    target.statuses.apply("empathy", 10, "foe");
    target.statuses.maintain("purifying-veil", "monk", 0);
    target.statuses.drainChanges();
    target.statuses.remove("purifying-veil");
    fireChanges(target, monk());
    expect(target.statuses.countByCategory("condition")).toBe(1);
    expect(target.statuses.has("empathy")).toBe(true);
  });
});

describe("Watchful Spirit (#1748)", () => {
  it("+2 Health regeneration, and heals 150 by Divine Favor as it is dropped", () => {
    expect(getStatusDefinition("watchful-spirit").healthPips).toBe(2);
    const target = ally();
    const source = monk({ attributeRanks: new Map([["monk.divine-favor", 12]]) });
    target.statuses.maintain("watchful-spirit", "monk", 0);
    target.statuses.drainChanges();
    target.statuses.remove("watchful-spirit");
    expect(healed(fireChanges(target, source))).toBe(150);
  });
});

describe("Signet of Removal (#1748)", () => {
  function hexedAndBleeding(enchanted: boolean): Combatant {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe");
    target.statuses.apply("empathy", 10, "foe");
    if (enchanted) {
      target.statuses.apply("healing-breeze", 15, "monk");
    }
    return target;
  }

  it("takes a hex and a condition off an enchanted ally", () => {
    const target = hexedAndBleeding(true);
    use(monk(), "monk.signet-of-removal", target);
    expect([target.statuses.has("bleeding"), target.statuses.has("empathy")]).toEqual([
      false,
      false,
    ]);
  });

  it("does nothing to one not enchanted", () => {
    const target = hexedAndBleeding(false);
    expect(use(monk(), "monk.signet-of-removal", target)).toEqual([]);
    expect([target.statuses.has("bleeding"), target.statuses.has("empathy")]).toEqual([true, true]);
  });
});

describe("in a match (#1748)", () => {
  const BAR = [
    "monk.ethereal-light",
    "monk.gift-of-health",
    "monk.live-vicariously",
    "monk.pacifism",
    "monk.kirins-wrath",
    "monk.purifying-veil",
  ] as const;

  function wielding(): ResolvedEquipment {
    return {
      ...unarmedResolvedEquipment(RULES.armorReferenceLevel),
      mainHand: {
        weapon: WEAPONS.sword,
        attributeId: "warrior.swordsmanship",
        damageType: WEAPONS.sword.damageType,
        requirementMet: true,
        creatureDamageScale: undefined,
      },
    };
  }

  function body(id: string, team: number, spawn: Vec2, sword: boolean): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: new Map([...RANKS, ["warrior.swordsmanship", 12]]),
      equipment: sword ? wielding() : unarmedResolvedEquipment(RULES.armorReferenceLevel),
      maxHealth: 1000,
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  /** Monk `m`; its ally `a` and foe `f`, swordsmen, in melee of each other; `far`, a foe beyond. */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "monk-staples-6",
      participants: [
        body("m", 0, vec2(0, 0), false),
        body("a", 0, vec2(200, 0), true),
        body("f", 1, vec2(230, 0), true),
        body("far", 1, vec2(0, AREA_ADJACENT + 100), false),
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

  /** `m` uses `skillId` on `targetId`, accepted. */
  function cast(sim: MatchSimulation, skillId: (typeof BAR)[number], targetId: string): void {
    sim.setTarget("m", targetId);
    expect(sim.requestSkill("m", BAR.indexOf(skillId))?.check).toEqual({ ok: true });
  }

  function events(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
    return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
  }

  it("Ethereal Light is interrupted by a blow landing as it is cast", () => {
    const sim = new MatchSimulation({
      seed: "ethereal-light",
      participants: [
        body("m", 0, vec2(0, 0), false),
        body("a", 0, vec2(200, 0), false),
        body("w", 1, vec2(AREA_ADJACENT - 10, 0), true),
      ],
    });
    // The sword's first blow lands 1.35 s in, inside the 1 s cast.
    expect(sim.requestAttack("w", "m")).toEqual({ ok: true });
    stepFor(sim, 1);
    cast(sim, "monk.ethereal-light", "a");
    const log = stepFor(sim, 2);
    expect(log.flatMap((entry) => entry.events)).toContainEqual({
      kind: "interrupted",
      targetId: "m",
      skillId: "monk.ethereal-light",
    });
  });

  it("Gift of Health disables the other Healing Prayers for 6 s, not itself nor Protection", () => {
    const sim = match();
    get(sim, "a").health = 500;
    cast(sim, "monk.gift-of-health", "a");
    const log = stepFor(sim, 1.5);
    expect(healed(events(log, "monk.gift-of-health"), "a")).toBe(123);
    const waits = get(sim, "m").cast.rechargeRemaining;
    expect(waits.get("monk.ethereal-light")).toBeGreaterThan(5);
    expect(waits.get("monk.live-vicariously")).toBeGreaterThan(5);
    expect(waits.get("monk.gift-of-health")).toBeLessThanOrEqual(5);
    expect(waits.has("monk.purifying-veil")).toBe(false);
  });

  it("Live Vicariously heals the Monk 14 each time its ally hits a foe", () => {
    const sim = match();
    get(sim, "m").health = 500;
    cast(sim, "monk.live-vicariously", "a");
    stepFor(sim, 3);
    expect(get(sim, "a").statuses.has("live-vicariously")).toBe(true);
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    const log = stepFor(sim, 4);
    const hits = log
      .filter((entry) => entry.sourceId === "a" && entry.cause === "weapon")
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "damage" && event.targetId === "f").length;
    expect(hits).toBeGreaterThan(0);
    expect(healed(events(log, "monk.live-vicariously"), "m")).toBe(14 * hits);
  });

  it("Pacifism stops the foe's attacks until a foe of theirs damages it", () => {
    const sim = match();
    cast(sim, "monk.pacifism", "f");
    stepFor(sim, 2.5);
    expect(get(sim, "f").statuses.has("pacifism")).toBe(true);
    expect(sim.requestAttack("f", "a")).toEqual({ ok: false, reason: "cannot-attack" });
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    stepFor(sim, 3);
    expect(get(sim, "f").statuses.has("pacifism")).toBe(false);
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
  });

  it("Kirin's Wrath strikes an adjacent foe 5 times, and misses one farther off", () => {
    const sim = new MatchSimulation({
      seed: "kirins-wrath",
      participants: [
        body("m", 0, vec2(0, 0), false),
        body("near", 1, vec2(AREA_ADJACENT - 10, 0), false),
        body("far", 1, vec2(AREA_ADJACENT + 100, 0), false),
      ],
    });
    cast(sim, "monk.kirins-wrath", "m");
    const struck = events(stepFor(sim, 8), "monk.kirins-wrath").flatMap((event) =>
      event.kind === "damage" ? [event.targetId] : [],
    );
    expect(struck).toEqual(["near", "near", "near", "near", "near"]);
  });
});
