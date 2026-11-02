import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { resolveSkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";
import { resolveSwing } from "./weapon-attack.js";

/**
 * Paragon staples (#2222): Song of Power, Ballad of Restoration, Leader's
 * Zeal, "Make Your Time!", "They're on Fire!" and "Find Their Weakness!".
 * Numbers at rank 12; the PvP ones where GW1 splits them.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["paragon.command", 12],
  ["paragon.motivation", 12],
  ["paragon.leadership", 12],
]);
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

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the six are the corpus's (#2222)", () => {
  it.each([
    ["song-of-power", 1560, "chant", "motivation", 15, 1, 30],
    // PvP: recharges in 20 s, not 10.
    ["ballad-of-restoration", 2877, "chant", "motivation", 10, 1, 20],
    ["leaders-zeal", 1583, "skill", "motivation", 5, 0, 12],
    ["make-your-time", 1779, "shout", "leadership", 10, 0, 10],
    ["theyre-on-fire", 1597, "shout", "leadership", 10, 0, 10],
    ["find-their-weakness", 3034, "shout", "command", 10, 0, 15],
  ] as const)("%s", (id, gwId, type, attribute, energy, activation, recharge) => {
    expect(skill(`paragon.${id}`)).toMatchObject({
      gwId,
      type,
      elite: false,
      profession: "paragon",
      attributeId: `paragon.${attribute}`,
      cost: { kind: "energy", amount: energy },
      activationSeconds: activation,
      rechargeSeconds: recharge,
      range: RANGE_SPELL,
    });
  });

  it.each([
    ["song-of-power", /4 Energy regeneration/],
    ["ballad-of-restoration", /next time it takes damage .*: heals for 63/],
    ["leaders-zeal", /4 energy for each ally nearby \(maximum 11\)/],
    ["make-your-time", /2 strikes of adrenaline for each ally in earshot \(maximum 7\)/],
    ["theyre-on-fire", /29% less damage from foes suffering from Burning/],
    ["find-their-weakness", /next time you land a critical hit: .*Deep Wound/],
  ])("%s reads as GW1 words it", (id, text) => {
    const texts = describeSkill(skill(`paragon.${id}`), RANKS).effects.map(({ text }) => text);
    expect(texts.join(" / ")).toMatch(text);
  });
});

describe("in a match (#2222)", () => {
  const BAR = [
    "paragon.song-of-power",
    "paragon.ballad-of-restoration",
    "paragon.leaders-zeal",
    "paragon.make-your-time",
    "paragon.theyre-on-fire",
    "paragon.find-their-weakness",
    "paragon.wild-throw",
  ] as const;
  type BarSkill = (typeof BAR)[number];
  const SLOT = Object.fromEntries(BAR.map((id, slot) => [id, slot])) as Record<BarSkill, number>;

  function body(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [...BAR],
      attributeRanks: id === "p" ? RANKS : new Map(),
      equipment: SWORD,
      maxHealth: 1e4,
      maxEnergy: 1000,
      spawn,
      facing: 0,
    };
  }

  /**
   * Paragon `p`; allies `a` and `nearby`... within nearby range of it
   * (`nearby` of them, `a` first), `b` in earshot but not nearby, `out`
   * beyond earshot; foe `f` adjacent to `a`.
   */
  function match(nearby = 1): MatchSimulation {
    const close = [vec2(40, 0), vec2(-40, 0), vec2(0, 40), vec2(0, -40)].slice(0, nearby);
    return new MatchSimulation({
      seed: "paragon-staples",
      participants: [
        body("p", 1, vec2(0, 0)),
        ...close.map((spawn, i) => body(i === 0 ? "a" : `a${String(i)}`, 1, spawn)),
        body("b", 1, vec2(200, 0)),
        body("out", 1, vec2(420, 0)),
        body("f", 0, vec2(40, 30)),
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

  /** `who` uses `skillId` on `targetId`, and the steps until it lands. */
  function use(
    sim: MatchSimulation,
    skillId: BarSkill,
    who = "p",
    targetId = who,
  ): CombatLogEntry[] {
    sim.setTarget(who, targetId);
    expect(sim.requestSkill(who, SLOT[skillId])?.check).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      log.push(...sim.step(DT).log);
      if (log.some((entry) => entry.skillId === skillId)) {
        break;
      }
    }
    return log;
  }

  /** `attacker` swings at `targetId` until a blow lands on it, and the steps till then. */
  function swing(sim: MatchSimulation, attacker: string, targetId: string): CombatLogEntry[] {
    expect(sim.requestAttack(attacker, targetId)).toEqual({ ok: true });
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < 4 / DT; i += 1) {
      const step = sim.step(DT).log;
      log.push(...step);
      if (
        step.some((entry) =>
          entry.events.some((event) => event.kind === "damage" && event.targetId === targetId),
        )
      ) {
        break;
      }
    }
    sim.setTarget(attacker, undefined);
    return log;
  }

  function events(log: readonly CombatLogEntry[]): CombatEvent[] {
    return log.flatMap((entry) => entry.events);
  }

  function secondsOf(sim: MatchSimulation, id: string, statusId: string): number | undefined {
    return [...get(sim, id).statuses.active].find((status) => status.id === statusId)
      ?.remainingSeconds;
  }

  describe("Song of Power", () => {
    it("gives each ally in earshot +4 Energy regeneration for 17 s", () => {
      const sim = match();
      use(sim, "paragon.song-of-power");
      for (const id of ["p", "a", "b"]) {
        expect(secondsOf(sim, id, "song-of-power"), id).toBeCloseTo(17, 0);
      }
      expect(secondsOf(sim, "out", "song-of-power")).toBeUndefined();
      expect(aggregateModifiers(get(sim, "a").statuses.active).energyPips).toBe(4);
    });

    it("ends for an ally when it uses a skill, not when it swings, and only for that ally", () => {
      const sim = match();
      use(sim, "paragon.song-of-power");
      swing(sim, "a", "f");
      expect(secondsOf(sim, "a", "song-of-power")).toBeDefined();
      use(sim, "paragon.leaders-zeal", "a");
      expect(secondsOf(sim, "a", "song-of-power")).toBeUndefined();
      expect(secondsOf(sim, "b", "song-of-power")).toBeDefined();
      expect(secondsOf(sim, "p", "song-of-power")).toBeDefined();
    });
  });

  describe("Ballad of Restoration", () => {
    it("heals each party member in earshot 63 the next time a foe damages it, once", () => {
      const sim = match();
      use(sim, "paragon.ballad-of-restoration");
      expect(secondsOf(sim, "a", "ballad-of-restoration")).toBeCloseTo(10, 0);
      expect(secondsOf(sim, "out", "ballad-of-restoration")).toBeUndefined();
      get(sim, "a").health = 5000;
      const heals = (log: readonly CombatLogEntry[]): CombatEvent[] =>
        events(log.filter((entry) => entry.skillId === "paragon.ballad-of-restoration")).filter(
          (event) => event.kind === "heal" && event.targetId === "a",
        );
      expect(heals(swing(sim, "f", "a"))).toMatchObject([{ kind: "heal", amount: 63 }]);
      expect(secondsOf(sim, "a", "ballad-of-restoration")).toBeUndefined();
      expect(heals(swing(sim, "f", "a"))).toEqual([]);
    });
  });

  describe("Leader's Zeal", () => {
    const gained = (log: readonly CombatLogEntry[]): number =>
      events(log).reduce(
        (sum, event) =>
          event.kind === "energy-gain" && event.targetId === "p" ? sum + event.amount : sum,
        0,
      );

    it("gives 4 Energy for each nearby ally, yourself not one", () => {
      const sim = match(1);
      get(sim, "p").energy = 100;
      expect(gained(use(sim, "paragon.leaders-zeal"))).toBe(4);
    });

    it("gives at most 11", () => {
      const sim = match(3);
      get(sim, "p").energy = 100;
      expect(gained(use(sim, "paragon.leaders-zeal"))).toBe(11);
    });

    it("gives nothing with no ally nearby", () => {
      const paragon = makeCombatant({ id: "p", team: 1, energy: 10, attributeRanks: RANKS });
      const outcome = resolveSkillEffects({
        skill: skill("paragon.leaders-zeal"),
        caster: paragon,
        targets: [paragon],
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map([
          [
            paragon.id,
            {
              combatant: paragon,
              position: vec2(0, 0),
              creature: undefined,
              corpseExploited: false,
            },
          ],
        ]),
      });
      expect(outcome.events.filter((event) => event.kind === "energy-gain")).toEqual([]);
    });
  });

  describe('"Make Your Time!"', () => {
    const strikes = (log: readonly CombatLogEntry[]): number[] =>
      events(log).flatMap((event) =>
        event.kind === "adrenaline-gained" && event.targetId === "p" ? [event.strikes] : [],
      );

    it("gives 2 strikes of adrenaline for each other ally in earshot", () => {
      // `a` and `b`; `out` is beyond earshot.
      expect(strikes(use(match(1), "paragon.make-your-time"))).toEqual([4]);
    });

    it("gives at most 7 strikes", () => {
      // `a`, `a1`, `a2`, `a3` and `b`: 10, capped.
      expect(strikes(use(match(4), "paragon.make-your-time"))).toEqual([7]);
    });
  });

  describe('"They\'re on Fire!" and "Find Their Weakness!" land as shouts', () => {
    it("They're on Fire! on every party member in earshot for 10 s", () => {
      const sim = match();
      use(sim, "paragon.theyre-on-fire");
      expect(secondsOf(sim, "a", "theyre-on-fire")).toBeCloseTo(10, 0);
      expect(secondsOf(sim, "out", "theyre-on-fire")).toBeUndefined();
    });

    it("Find Their Weakness! on the target ally only, for 17 s", () => {
      const sim = match();
      use(sim, "paragon.find-their-weakness", "p", "a");
      expect(secondsOf(sim, "a", "find-their-weakness")).toBeCloseTo(17, 0);
      expect(secondsOf(sim, "p", "find-their-weakness")).toBeUndefined();
    });
  });
});

describe("a blow on a bearer (#2222)", () => {
  /** Every float `value`: 0 crits, 0.9 does not; nothing here blocks. */
  const floats = (value: number): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => value });

  const swordsman = (id: string, team: number): Combatant =>
    makeCombatant({
      id,
      team,
      energy: 10,
      equipment: SWORD,
      attributeRanks: new Map([["warrior.swordsmanship", 12]]),
    });

  const body = (id: string, team: number): Combatant =>
    makeCombatant({ id, team, health: 1e6, maxHealth: 1e6 });

  function blow(attacker: Combatant, target: Combatant, rng = floats(0.9)) {
    return resolveSwing({
      attacker,
      target: { combatant: target, position: vec2(40, 0), creature: undefined },
      surroundings: new Map(),
      rng,
      rules: RULES.combat,
      exposed: () => false,
    });
  }

  const damage = (outcome: { readonly events: readonly CombatEvent[] }): number =>
    outcome.events.reduce((sum, event) => (event.kind === "damage" ? sum + event.amount : sum), 0);

  describe('"They\'re on Fire!"', () => {
    it("cuts damage from a burning foe by 29%, and from one not burning not at all", () => {
      const plain = damage(blow(swordsman("f", 0), body("a", 1)));
      const shielded = body("a", 1);
      shielded.statuses.apply("theyre-on-fire", 10, "p", NO_RANKS);
      expect(damage(blow(swordsman("f", 0), shielded))).toBe(plain);
      const burning = swordsman("f", 0);
      burning.statuses.apply("burning", 5, "x", NO_RANKS);
      expect(damage(blow(burning, shielded))).toBe(Math.round(plain * 0.71));
    });
  });

  describe('"Find Their Weakness!"', () => {
    it("the next critical inflicts a 17 s Deep Wound, and then it ends", () => {
      const ally = swordsman("a", 1);
      ally.statuses.apply("find-their-weakness", 17, "p", NO_RANKS);
      const foe = body("f", 0);
      const fired = blow(ally, foe, floats(0)).fired.flatMap((trigger) => trigger.events);
      expect(fired).toContainEqual(
        expect.objectContaining({ kind: "status-applied", targetId: "f", statusId: "deep-wound" }),
      );
      expect(ally.statuses.has("find-their-weakness")).toBe(false);
      expect(
        [...foe.statuses.active].find((status) => status.id === "deep-wound")?.remainingSeconds,
      ).toBeCloseTo(17, 0);
    });

    it("a hit that is no critical leaves it waiting", () => {
      const ally = swordsman("a", 1);
      ally.statuses.apply("find-their-weakness", 17, "p", NO_RANKS);
      const foe = body("f", 0);
      blow(ally, foe);
      expect(ally.statuses.has("find-their-weakness")).toBe(true);
      expect(foe.statuses.has("deep-wound")).toBe(false);
    });
  });
});
