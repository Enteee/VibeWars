import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applyDamage, applyEffects, applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, STATUS_DEFINITIONS, getStatusDefinition, type StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers, type SpreadGainedCondition } from "./triggers.js";
import type { Combatant, Skill } from "./types.js";

/**
 * "The next time damage drops Health below N%" and "the next fatal damage
 * is negated" (#1789), and the four skills they let in: Judge's, Watchful
 * and Faithful Intervention, and Illusion of Weakness. Numbers are the
 * corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const JUDGES = "monk.judges-intervention";
const WATCHFUL = "dervish.watchful-intervention";
const FAITHFUL = "dervish.faithful-intervention";
const ILLUSION = "mesmer.illusion-of-weakness";
const RANKS = new Map([
  ["monk.smiting-prayers", 12],
  ["dervish.mysticism", 12],
  ["mesmer.illusion-magic", 12],
]);
const noSpread: SpreadGainedCondition = () => [];

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

/** `m`, a team-0 caster; `a`, its ally at full 500; `w`, a team-1 foe at 400 of 500. */
function party(): Map<string, Combatant> {
  return new Map([
    ["m", makeCombatant({ id: "m", team: 0, attributeRanks: RANKS })],
    ["a", makeCombatant({ id: "a", team: 0, health: 500, maxHealth: 500 })],
    ["w", makeCombatant({ id: "w", team: 1, health: 400, maxHealth: 500 })],
  ]);
}

function member(combatants: Map<string, Combatant>, id: string): Combatant {
  const found = combatants.get(id);
  if (found === undefined) {
    throw new Error(`no combatant ${id}`);
  }
  return found;
}

/** Whatever `bearer`'s statuses recorded, fired as the simulation's drain does. */
function drain(bearer: Combatant, combatants: Map<string, Combatant>) {
  return bearer.statuses.drainChanges().flatMap((change) =>
    fireChangeTriggers(bearer, change, noSpread, {
      sourceOf: (id) => combatants.get(id),
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
      usedSkill: undefined,
    }),
  );
}

/** `thief` steals `amount` from `target`. */
function steal(thief: Combatant, target: Combatant, amount: number): CombatEvent[] {
  return applyEffects([{ kind: "life-steal", amount: { flat: amount } }], {
    caster: thief,
    target,
    rng: createRng(1),
    rules: RULES.combat,
    surroundings: new Map(),
    usedSkill: undefined,
  });
}

function healed(fired: readonly { events: readonly CombatEvent[] }[], id: string): number {
  return fired
    .flatMap(({ events }) => events)
    .reduce(
      (sum, event) => (event.kind === "heal" && event.targetId === id ? sum + event.amount : sum),
      0,
    );
}

describe("the four are the corpus's (#1789)", () => {
  it.each([
    [JUDGES, 1390, "monk.smiting-prayers", 5, 0.25, 8, "single-ally"],
    [WATCHFUL, 1504, "dervish.mysticism", 10, 1, 15, "single-ally"],
    [FAITHFUL, 1509, "dervish.mysticism", 5, 2, 20, "self"],
    [ILLUSION, 32, "mesmer.illusion-magic", 10, 2, 30, "self"],
  ] as const)("%s", (id, gwId, attribute, energy, activation, recharge, target) => {
    const found = skill(id);
    expect(found.gwId).toBe(gwId);
    expect(found.type).toBe("enchantment");
    expect(found.attributeId).toBe(attribute);
    expect(found.cost).toEqual({ kind: "energy", amount: energy });
    expect(found.activationSeconds).toBe(activation);
    expect(found.rechargeSeconds).toBe(recharge);
    expect(found.range).toBe(RANGE_SPELL);
    expect(found.target).toBe(target);
  });

  it("only the threshold trigger names a line, and it lies inside (0, 1)", () => {
    for (const definition of Object.values(STATUS_DEFINITIONS)) {
      for (const trigger of definition.triggers) {
        const below = trigger.healthBelow;
        if (trigger.on === "bearer-health-drops-below") {
          expect(below, definition.id).toBeGreaterThan(0);
          expect(below, definition.id).toBeLessThan(1);
        } else {
          expect(below, `${definition.id} on ${trigger.on}`).toBeUndefined();
        }
      }
    }
  });

  it("says what each does", () => {
    const text = (id: string) =>
      describeSkill(skill(id), RANKS)
        .effects.map((effect) => effect.text)
        .join(" ");
    expect(text(JUDGES)).toContain("would kill it is negated");
    expect(text(JUDGES)).toContain("the foe who dealt it takes 150 holy damage");
    expect(text(WATCHFUL)).toContain("below 25% by damage: heals for 170");
    expect(text(FAITHFUL)).toContain("until it ends");
    expect(text(FAITHFUL)).toContain("below 50%");
    expect(text(ILLUSION)).toContain("You lose 202 health");
  });
});

describe("Health left under a line (#1789, #1818)", () => {
  it("fires once as one packet crosses it, and not again below it", () => {
    const combatants = party();
    const a = member(combatants, "a");
    const w = member(combatants, "w");
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 300, "slashing", false, [], w);
    expect(drain(a, combatants)).toEqual([]);
    applyDamage(a, 100, "slashing", false, [], w);
    expect(a.health).toBe(100);
    const fired = drain(a, combatants);
    expect(healed(fired, "a")).toBe(170);
    expect(a.statuses.has("watchful-intervention")).toBe(false);
  });

  it("fires for a bearer already below the line at its next hit, no crossing asked", () => {
    const combatants = party();
    const a = member(combatants, "a");
    a.health = 100;
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 10, "slashing", false, [], member(combatants, "w"));
    expect(a.health).toBe(90);
    expect(healed(drain(a, combatants), "a")).toBe(170);
    expect(a.statuses.has("watchful-intervention")).toBe(false);
  });

  it("does not fire for a packet that takes nothing, below the line", () => {
    const combatants = party();
    const a = member(combatants, "a");
    a.health = 100;
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 0, "slashing", false, [], member(combatants, "w"));
    expect(a.health).toBe(100);
    expect(drain(a, combatants)).toEqual([]);
    expect(a.statuses.has("watchful-intervention")).toBe(true);
  });

  it("fires for a packet with no dealer, and for a life steal", () => {
    const combatants = party();
    const a = member(combatants, "a");
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 400, "typeless", false, [], undefined);
    expect(healed(drain(a, combatants), "a")).toBe(170);

    const b = makeCombatant({ id: "b", team: 0, health: 130, maxHealth: 500 });
    combatants.set("b", b);
    b.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    steal(member(combatants, "w"), b, 20);
    expect(b.health).toBe(110);
    expect(healed(drain(b, combatants), "b")).toBe(170);
  });

  it("is not crossed by health loss", () => {
    const combatants = party();
    const m = member(combatants, "m");
    m.health = 260;
    m.maxHealth = 500;
    applySkillEffects({
      surroundings: new Map(),
      skill: skill(ILLUSION),
      caster: m,
      targets: [m],
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(m.health).toBe(58);
    expect(m.statuses.has("illusion-of-weakness")).toBe(true);
    expect(drain(m, combatants)).toEqual([]);
    expect(m.statuses.has("illusion-of-weakness")).toBe(true);
  });

  it("one packet from 60% to 10% crosses both 50% and 25%", () => {
    const combatants = party();
    const a = member(combatants, "a");
    a.health = 300;
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    a.statuses.apply("faithful-intervention", Number.POSITIVE_INFINITY, "a", NO_RANKS);
    applyDamage(a, 250, "slashing", false, [], member(combatants, "w"));
    const ended = drain(a, combatants).flatMap(({ events }) =>
      events.flatMap((event) => (event.kind === "status-expired" ? [event.statusId] : [])),
    );
    expect(ended).toEqual(
      expect.arrayContaining(["watchful-intervention", "faithful-intervention"]),
    );
  });

  it("a killing blow does not fire it, crossing or not: the dead are not healed", () => {
    const combatants = party();
    const a = member(combatants, "a");
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 600, "slashing", false, [], member(combatants, "w"));
    expect(a.dead).toBe(true);
    expect(drain(a, combatants)).toEqual([]);
    expect(a.health).toBe(0);

    const b = makeCombatant({ id: "b", team: 0, health: 30, maxHealth: 500 });
    combatants.set("b", b);
    b.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(b, 100, "slashing", false, [], member(combatants, "w"));
    expect(b.dead).toBe(true);
    expect(drain(b, combatants)).toEqual([]);
  });
});

describe("fatal damage negated (#1789)", () => {
  function judged(): Map<string, Combatant> {
    const combatants = party();
    const a = member(combatants, "a");
    a.health = 100;
    a.statuses.apply("judges-intervention", 10, "m", NO_RANKS);
    return combatants;
  }

  it("drops a killing packet whole, spends the status and smites the dealer from the Monk", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    const w = member(combatants, "w");
    const events: CombatEvent[] = [];
    applyDamage(a, 150, "slashing", false, events, w);
    expect(a.health).toBe(100);
    expect(a.dead).toBe(false);
    expect(events).toEqual([
      { kind: "status-expired", targetId: "a", statusId: "judges-intervention" },
    ]);
    expect(a.statuses.has("judges-intervention")).toBe(false);
    drain(a, combatants);
    // The Monk's Smiting Prayers 12, not the bearer's ranks; holy, so
    // armor has no say here.
    expect(w.health).toBe(250);
  });

  it("lets damage that leaves the bearer alive through, and stays", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    applyDamage(a, 99, "slashing", false, [], member(combatants, "w"));
    expect(a.health).toBe(1);
    expect(a.statuses.has("judges-intervention")).toBe(true);
  });

  it("drops a killing steal, and the thief gains nothing", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    const w = member(combatants, "w");
    steal(w, a, 150);
    expect(a.health).toBe(100);
    expect(a.statuses.has("judges-intervention")).toBe(false);
    drain(a, combatants);
    expect(w.health).toBe(250);
  });

  it("smites nobody for a packet nobody dealt", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    applyDamage(a, 150, "typeless", false, [], undefined);
    expect(a.health).toBe(100);
    expect(drain(a, combatants)).toEqual([]);
  });

  it("comes after Reversal of Fortune and invulnerability, which leave it up", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    const w = member(combatants, "w");
    a.statuses.apply("reversal-of-fortune", 8, "m", NO_RANKS);
    applyDamage(a, 150, "slashing", false, [], w);
    expect(a.statuses.has("reversal-of-fortune")).toBe(false);
    expect(a.statuses.has("judges-intervention")).toBe(true);
    a.invulnerableRemaining = 1;
    applyDamage(a, 500, "slashing", false, [], w);
    expect(a.statuses.has("judges-intervention")).toBe(true);
  });

  it("wins over Watchful Intervention, which never sees a drop", () => {
    const combatants = judged();
    const a = member(combatants, "a");
    a.health = 200;
    a.statuses.apply("watchful-intervention", 60, "m", NO_RANKS);
    applyDamage(a, 300, "slashing", false, [], member(combatants, "w"));
    expect(a.health).toBe(200);
    drain(a, combatants);
    expect(a.statuses.has("watchful-intervention")).toBe(true);
  });
});

describe("in a match (#1789)", () => {
  function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxEnergy: 100,
      spawn,
      facing: 0,
    };
  }

  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "ally-threshold",
      participants: [spec("d", 0, vec2(0, 0)), spec("w", 1, vec2(300, 0))],
    });
  }

  function get(sim: MatchSimulation, id: string): Participant {
    const found = sim.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  function step(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < seconds / DT; i += 1) {
      log.push(...sim.step(DT).log);
    }
    return log;
  }

  function heals(log: readonly CombatLogEntry[], id: string, skillId: string): number[] {
    return log
      .filter((entry) => entry.skillId === skillId)
      .flatMap(({ events }) =>
        events.flatMap((event) =>
          event.kind === "heal" && event.targetId === id ? [event.amount] : [],
        ),
      );
  }

  it.each([
    ["faithful-intervention", FAITHFUL, 0.5, 126],
    ["illusion-of-weakness", ILLUSION, 0.25, 202],
  ] as const)(
    "%s ends when damage drops its bearer below the line, and heals",
    (id, skillId, line, heal) => {
      const sim = match();
      const d = get(sim, "d").combatant;
      d.statuses.apply(id, Number.POSITIVE_INFINITY, "d", NO_RANKS);
      step(sim, DT);
      const cut = Math.round(d.maxHealth * (1 - line)) + 10;
      applyDamage(d, cut, "typeless", false, [], get(sim, "w").combatant);
      const before = d.health;
      const log = step(sim, DT);
      expect(d.statuses.has(id)).toBe(false);
      expect(heals(log, "d", skillId)).toEqual([heal]);
      expect(d.health).toBeGreaterThan(before);
    },
  );

  it("Faithful Intervention lasts with no end, and a strip heals too", () => {
    const sim = match();
    const d = get(sim, "d").combatant;
    d.health = 300;
    d.statuses.apply("faithful-intervention", Number.POSITIVE_INFINITY, "d", NO_RANKS);
    step(sim, 120);
    expect(d.statuses.has("faithful-intervention")).toBe(true);
    d.health = 300;
    d.statuses.removeByCategory("enchantment");
    const log = step(sim, DT);
    expect(heals(log, "d", FAITHFUL)).toEqual([126]);
  });

  it("degeneration below the line is no drop", () => {
    const sim = match();
    const d = get(sim, "d").combatant;
    d.health = Math.round(d.maxHealth * 0.25) + 3;
    d.statuses.apply("watchful-intervention", 60, "d", NO_RANKS);
    d.statuses.apply("bleeding", 10, "w", NO_RANKS);
    step(sim, 5);
    expect(d.health).toBeLessThan(d.maxHealth * 0.25);
    expect(d.statuses.has("watchful-intervention")).toBe(true);
  });
});

/** Every status this card adds is an enchantment of its skill's profession. */
it.each([
  ["judges-intervention", "monk"],
  ["watchful-intervention", "dervish"],
  ["faithful-intervention", "dervish"],
  ["illusion-of-weakness", "mesmer"],
] as const)("%s is a %s enchantment", (id: StatusId, profession) => {
  const definition = getStatusDefinition(id);
  expect(definition.category).toBe("enchantment");
  expect(definition.profession).toBe(profession);
});
