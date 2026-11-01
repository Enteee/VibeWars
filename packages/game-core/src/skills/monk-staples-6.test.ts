import { describe, expect, it } from "vitest";

import { AREA_ADJACENT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
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
import { NO_RANKS, getStatusDefinition } from "./status.js";
import { makeCombatant } from "./testing.js";
import { isEasilyInterrupted, type Combatant, type Skill } from "./types.js";

/**
 * Monk staples 6 (#1748): Ethereal Light, Gift of Health, Live
 * Vicariously, Purifying Veil, Pacifism, Watchful Spirit, Kirin's Wrath
 * and Signet of Removal. Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
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

/** `user` pays for `skillId` and it lands on `target`. */
function use(user: Combatant, skillId: string, target: Combatant): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: new Map(),
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES.combat,
  });
}

/** What `events` healed `id` for. */
function healed(events: readonly CombatEvent[], id = "ally"): number {
  return events.reduce(
    (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
    0,
  );
}

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
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
});

describe("Ethereal Light (#1748)", () => {
  it("heals 85 at rank 12, and is easily interrupted", () => {
    expect(healed(use(monk(), "monk.ethereal-light", ally()))).toBe(85);
    expect(isEasilyInterrupted(skill("monk.ethereal-light"))).toBe(true);
    expect(described("monk.ethereal-light")).toEqual(["Heals for 85", "Easily interrupted"]);
  });
});

describe("Gift of Health (#1748)", () => {
  it("heals 123 and says it disables the other Healing Prayers", () => {
    expect(healed(use(monk(), "monk.gift-of-health", ally()))).toBe(123);
    expect(described("monk.gift-of-health")).toEqual([
      "Heals for 123",
      "All of your other Healing Prayers are disabled for 6 seconds",
    ]);
  });
});

describe("Purifying Veil (#1748)", () => {
  it("conditions on its bearer run 41% faster; hexes do not", () => {
    const target = ally();
    target.statuses.maintain("purifying-veil", "monk", 0, NO_RANKS);
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("empathy", 10, "foe", NO_RANKS);
    target.statuses.advance(1, false);
    expect(target.statuses.get("bleeding")?.remainingSeconds).toBeCloseTo(10 - 1.41);
    expect(target.statuses.get("empathy")?.remainingSeconds).toBeCloseTo(9);
  });
});

describe("Pacifism (#1748)", () => {
  it("is a 7 s hex that stops attacks and says what ends it", () => {
    const definition = getStatusDefinition("pacifism");
    expect([definition.category, definition.preventsAttacks]).toEqual(["hex", true]);
    expect(described("monk.pacifism")).toEqual([
      "Applies Pacifism for 7s (cannot attack, ends if it takes damage or life steal from a foe)",
    ]);
  });
});

describe("Watchful Spirit (#1748)", () => {
  it("+2 Health regeneration while maintained", () => {
    expect(getStatusDefinition("watchful-spirit").healthPips).toBe(2);
  });
});

describe("Signet of Removal (#1748)", () => {
  it("on an unenchanted ally does nothing", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("empathy", 10, "foe", NO_RANKS);
    expect(use(monk(), "monk.signet-of-removal", target)).toEqual([]);
    expect([target.statuses.has("bleeding"), target.statuses.has("empathy")]).toEqual([true, true]);
  });

  it("on an enchanted ally takes one hex and one condition", () => {
    const target = ally();
    target.statuses.apply("healing-breeze", 15, "monk", NO_RANKS);
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("poison", 10, "foe", NO_RANKS);
    target.statuses.apply("empathy", 10, "foe", NO_RANKS);
    target.statuses.apply("faintheartedness", 10, "foe", NO_RANKS);
    use(monk(), "monk.signet-of-removal", target);
    expect(target.statuses.countByCategory("condition")).toBe(1);
    expect(target.statuses.countByCategory("hex")).toBe(1);
    expect(target.statuses.has("healing-breeze")).toBe(true);
  });
});

describe("in a match (#1748)", () => {
  const BAR = [
    "monk.ethereal-light",
    "monk.gift-of-health",
    "monk.live-vicariously",
    "monk.purifying-veil",
    "monk.pacifism",
    "monk.watchful-spirit",
    "monk.kirins-wrath",
    "monk.signet-of-removal",
  ] as const;
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<
    (typeof BAR)[number],
    number
  >;

  function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: new Map([...RANKS, ["monk.divine-favor", 12], ["warrior.axe-mastery", 12]]),
      equipment: {
        ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
        mainHand: {
          weapon: WEAPONS.axe,
          attributeId: "warrior.axe-mastery",
          damageType: WEAPONS.axe.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /**
   * Monk `m` and its ally `a`; foe `f` in touch of both, foe `g` beyond
   * adjacent of the Monk. All wield axes.
   */
  function match(): MatchSimulation {
    const sim = new MatchSimulation({
      seed: "monk-staples-6",
      participants: [
        body("m", 0, vec2(0, 0)),
        body("a", 0, vec2(30, 0)),
        body("f", 1, vec2(30, 20)),
        body("g", 1, vec2(AREA_ADJACENT + 60, -60)),
      ],
    });
    for (const participant of sim.participants()) {
      participant.combatant.health = 5000;
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

  /** `m` uses `skillId` on `targetId`, and the steps until it has landed. */
  function cast(sim: MatchSimulation, skillId: (typeof BAR)[number], targetId = "a") {
    sim.setTarget("m", targetId);
    expect(sim.requestSkill("m", SLOT[skillId])?.check).toEqual({ ok: true });
    return stepFor(sim, skill(skillId).activationSeconds + 0.5);
  }

  function eventsOf(log: readonly CombatLogEntry[], skillId: string): CombatEvent[] {
    return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
  }

  it("Ethereal Light is cut by a blow landing in its activation", () => {
    const sim = match();
    expect(sim.requestAttack("f", "m")).toEqual({ ok: true });
    stepFor(sim, 1);
    sim.setTarget("m", "a");
    expect(sim.requestSkill("m", SLOT["monk.ethereal-light"])?.check).toEqual({ ok: true });
    const events = stepFor(sim, 1.5).flatMap((entry) => entry.events);
    expect(events).toContainEqual({
      kind: "interrupted",
      targetId: "m",
      skillId: "monk.ethereal-light",
    });
  });

  it("Gift of Health disables the other Healing Prayers for 6 s, not itself nor a Protection", () => {
    const sim = match();
    cast(sim, "monk.gift-of-health");
    const waits = get(sim, "m").cast.rechargeRemaining;
    expect(waits.get("monk.ethereal-light")).toBeGreaterThan(5);
    expect(waits.get("monk.live-vicariously")).toBeGreaterThan(5);
    // Its own 5 s recharge, less the half second stepped since.
    expect(waits.get("monk.gift-of-health")).toBeLessThanOrEqual(5);
    expect(waits.has("monk.purifying-veil")).toBe(false);
  });

  it("Live Vicariously heals the Monk 14 each time the ally hits a foe", () => {
    const sim = match();
    cast(sim, "monk.live-vicariously");
    expect(get(sim, "a").statuses.get("live-vicariously")?.maintained).not.toBeNull();
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    const log = stepFor(sim, 4);
    // A plain swing is logged with no skill.
    const hits = log
      .filter((entry) => entry.skillId === undefined && entry.sourceId === "a")
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "damage" && event.targetId === "f").length;
    const heals = eventsOf(log, "monk.live-vicariously").filter(
      (event) => event.kind === "heal" && event.targetId === "m",
    );
    expect(hits).toBeGreaterThan(0);
    expect(heals.map((event) => (event.kind === "heal" ? event.amount : 0))).toEqual(
      Array.from({ length: hits }, () => 14),
    );
  });

  it("Purifying Veil, dropped, takes one condition with it", () => {
    const sim = match();
    cast(sim, "monk.purifying-veil");
    const target = get(sim, "a");
    target.statuses.apply("bleeding", 20, "f", NO_RANKS);
    target.statuses.apply("poison", 20, "f", NO_RANKS);
    expect(sim.endUpkeep("m", "a", "purifying-veil")).toBe(true);
    stepFor(sim, DT);
    expect(target.statuses.countByCategory("condition")).toBe(1);
  });

  it("Pacifism stops the foe's attack, Bleeding leaves it, a blow from a foe ends it", () => {
    const sim = match();
    cast(sim, "monk.pacifism", "f");
    const foe = get(sim, "f");
    expect(foe.statuses.get("pacifism")?.durationSeconds).toBe(7);
    expect(sim.requestAttack("f", "a")?.ok).toBe(false);
    foe.statuses.apply("bleeding", 10, "m", NO_RANKS);
    stepFor(sim, 1);
    expect(foe.statuses.has("pacifism")).toBe(true);
    expect(sim.requestAttack("a", "f")).toEqual({ ok: true });
    stepFor(sim, 2);
    expect(foe.statuses.has("pacifism")).toBe(false);
    expect(sim.requestAttack("f", "a")).toEqual({ ok: true });
  });

  it("Watchful Spirit, dropped, heals its ally 150", () => {
    const sim = match();
    cast(sim, "monk.watchful-spirit");
    const target = get(sim, "a");
    target.health = 1000;
    expect(sim.endUpkeep("m", "a", "watchful-spirit")).toBe(true);
    const heals = eventsOf(stepFor(sim, DT), "monk.watchful-spirit").filter(
      (event) => event.kind === "heal" && event.targetId === "a",
    );
    expect(heals.map((event) => (event.kind === "heal" ? event.amount : 0))).toEqual([150]);
  });

  it("Watchful Spirit heals its ally when its Monk dies", () => {
    const sim = match();
    cast(sim, "monk.watchful-spirit");
    const target = get(sim, "a");
    target.health = 1000;
    const caster = get(sim, "m");
    caster.health = 0.01;
    caster.statuses.apply("burning", 5, "f", NO_RANKS);
    const log = stepFor(sim, DT);
    expect(caster.dead).toBe(true);
    expect(target.statuses.has("watchful-spirit")).toBe(false);
    expect(healed(eventsOf(log, "monk.watchful-spirit"), "a")).toBe(150);
  });

  it("Kirin's Wrath strikes the adjacent foe five times, not the one beyond", () => {
    const sim = match();
    const log = [...cast(sim, "monk.kirins-wrath", "m"), ...stepFor(sim, 5)];
    const struck = (id: string): number =>
      eventsOf(log, "monk.kirins-wrath").filter(
        (event) => event.kind === "damage" && event.targetId === id,
      ).length;
    expect([struck("f"), struck("g"), struck("a")]).toEqual([5, 0, 0]);
  });
});
