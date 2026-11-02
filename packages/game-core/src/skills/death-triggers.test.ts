import { describe, expect, it } from "vitest";

import { AREA_NEARBY } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyDamage } from "./effects.js";
import type { StatusId } from "./status.js";
import { makeCombatant } from "./testing.js";
import { fireChangeTriggers } from "./triggers.js";
import type { Skill } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * "If the bearer dies while it has this" (#1762): Reaper's Mark,
 * Assassin's Promise, Putrid Bile, Icy Veins and Dwayna's Sorrow, at
 * their rank-12 values.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["necromancer.death-magic", 12],
  ["necromancer.soul-reaping", 12],
  ["assassin.deadly-arts", 12],
  ["monk.healing-prayers", 12],
  ["monk.smiting-prayers", 12],
]);

function spec(id: string, team: number, spawn: Vec2, skillBar: readonly string[] = []) {
  return {
    id,
    team,
    skillBar,
    attributeRanks: RANKS,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 50,
    startHealthFraction: 1,
    spawn,
    facing: 0,
  } satisfies ParticipantSpec;
}

/**
 * The caster `n` (team 0) at the origin, its ally `a` beside the foe `f`
 * (team 1) at 300, `g` near `f`, `h` past the nearby radius, and `b`, an
 * ally of `n`'s, far from everyone.
 */
function arena(skillBar: readonly string[] = []): MatchSimulation {
  return new MatchSimulation({
    seed: "death-triggers",
    participants: [
      spec("n", 0, vec2(0, 0), skillBar),
      spec("a", 0, vec2(300, AREA_NEARBY / 2)),
      spec("b", 0, vec2(-900, 0)),
      spec("f", 1, vec2(300, 0)),
      spec("g", 1, vec2(300, -AREA_NEARBY / 2)),
      spec("h", 1, vec2(300 + AREA_NEARBY * 2, 0)),
    ],
  });
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function get(match: MatchSimulation, id: string): Participant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `id` dies within a step, to a burn of `by`'s; the log a few steps on. */
function kill(match: MatchSimulation, id: string, by = "n"): CombatLogEntry[] {
  const victim = get(match, id);
  victim.combatant.statuses.apply("burning", 10, by, NO_RANKS);
  victim.combatant.health = 0.2;
  const log = stepFor(match, 4 * DT);
  expect(victim.combatant.dead).toBe(true);
  return log;
}

/** Status `statusId` from `n` on `id`, for `seconds`. */
function put(match: MatchSimulation, id: string, statusId: StatusId, seconds = 30): void {
  get(match, id).combatant.statuses.apply(statusId, seconds, "n", NO_RANKS);
  stepFor(match, DT);
}

/** What `skillId`'s triggers did, event by event, to whom. */
function events(log: readonly CombatLogEntry[], skillId: string) {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

function amounts(log: readonly CombatLogEntry[], skillId: string, kind: string, id: string) {
  return events(log, skillId).flatMap((event) =>
    event.kind === kind && "targetId" in event && event.targetId === id && "amount" in event
      ? [event.amount]
      : [],
  );
}

describe("bearer-dies (#1762)", () => {
  it("fires when the bearer dies while it is on", () => {
    const sim = arena();
    put(sim, "f", "reapers-mark");
    get(sim, "n").combatant.energy = 0;
    expect(amounts(kill(sim, "f"), "necromancer.reapers-mark", "energy-gain", "n")).toEqual([13]);
  });

  it("does not fire when it expires first", () => {
    const sim = arena();
    put(sim, "f", "reapers-mark", 0.5);
    stepFor(sim, 1);
    expect(events(kill(sim, "f"), "necromancer.reapers-mark")).toEqual([]);
  });

  it("does not fire when it was removed before the death, in the same tick or earlier", () => {
    const sim = arena();
    put(sim, "f", "reapers-mark");
    get(sim, "f").combatant.statuses.removeByCategory("hex");
    expect(events(kill(sim, "f"), "necromancer.reapers-mark")).toEqual([]);
  });

  it("is no `ends-early` stand-in: a death still sets off `ends-early` too", () => {
    const bearer = makeCombatant({ id: "d", team: 0 });
    bearer.statuses.apply("bleeding", 10, "x", NO_RANKS);
    bearer.statuses.drainChanges();
    const fired = fireChangeTriggers(
      bearer,
      {
        kind: "ended",
        id: "enchanted-haste",
        sourceId: "d",
        expired: false,
        death: true,
        returnPoint: null,
        stepTargetId: null,
      },
      () => [],
      {
        sourceOf: (id) => (id === "d" ? bearer : undefined),
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
        usedSkill: undefined,
      },
    );
    expect(fired).toHaveLength(1);
    expect(bearer.statuses.has("bleeding")).toBe(false);
  });

  it("splashes round the corpse: the source's foes, not its allies, not the far one", () => {
    const sim = arena();
    put(sim, "f", "putrid-bile");
    const log = kill(sim, "f");
    expect(amounts(log, "necromancer.putrid-bile", "damage", "g")).toHaveLength(1);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "h")).toEqual([]);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "a")).toEqual([]);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "n")).toEqual([]);
  });

  it("a dead source gains no energy, but its burst still lands", () => {
    const sim = arena();
    put(sim, "f", "reapers-mark");
    put(sim, "g", "putrid-bile");
    // h near g, out of f's reach: a foe of n's alive for g's burst to strike.
    get(sim, "h").position = vec2(300, -AREA_NEARBY * 1.2);
    kill(sim, "n", "f");
    expect(get(sim, "f").combatant.statuses.has("reapers-mark")).toBe(true);
    const log = [...kill(sim, "f"), ...kill(sim, "g")];
    expect(amounts(log, "necromancer.reapers-mark", "energy-gain", "n")).toEqual([]);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "h")).toEqual([73]);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "a")).toEqual([]);
  });

  it("never chains: a burst that kills another bearer does not set that one off", () => {
    const sim = arena();
    put(sim, "f", "putrid-bile");
    put(sim, "g", "putrid-bile");
    get(sim, "g").combatant.health = 1;
    // h near g, out of f's reach: only g's bile could strike it.
    get(sim, "h").position = vec2(300, -AREA_NEARBY * 1.2);
    const log = [...kill(sim, "f"), ...stepFor(sim, 1)];
    expect(get(sim, "g").combatant.dead).toBe(true);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "g")).toHaveLength(1);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "h")).toEqual([]);
  });
});

describe("bearer-dies from a triggered effect (#1825)", () => {
  /** `f`, Reaper's Mark on it, swings a killing blow at `a` under Judge's Intervention. */
  function judged(fHealth: number): { sim: MatchSimulation; log: CombatLogEntry[] } {
    const sim = arena();
    put(sim, "f", "reapers-mark");
    put(sim, "a", "judges-intervention");
    const f = get(sim, "f").combatant;
    f.health = fHealth;
    get(sim, "n").combatant.energy = 0;
    applyDamage(get(sim, "a").combatant, 1000, "slashing", false, [], f);
    return { sim, log: stepFor(sim, 4 * DT) };
  }

  it("fires for a foe a triggered smite kills: Reaper's Mark pays for Judge's Intervention", () => {
    const { sim, log } = judged(100);
    expect(get(sim, "f").combatant.dead).toBe(true);
    expect(amounts(log, "necromancer.reapers-mark", "energy-gain", "n")).toEqual([13]);
  });

  it("fires nothing for a smite that leaves its foe alive", () => {
    const { sim, log } = judged(500);
    expect(get(sim, "f").combatant.dead).toBe(false);
    expect(events(log, "necromancer.reapers-mark")).toEqual([]);
  });

  // f joined before g: one order chained, the other did not, before the
  // settle pass drained everyone first.
  it.each<[string, "f" | "g", "f" | "g", Vec2]>([
    ["a later joiner", "f", "g", vec2(300, -AREA_NEARBY * 1.2)],
    ["an earlier joiner", "g", "f", vec2(300, AREA_NEARBY * 0.7)],
  ])(
    "never chains from a triggered kill: a burst that kills %s sets nothing off",
    (_, smitten, second, past) => {
      const sim = arena();
      put(sim, "f", "putrid-bile");
      put(sim, "g", "putrid-bile");
      put(sim, "a", "judges-intervention");
      get(sim, smitten).combatant.health = 100;
      get(sim, second).combatant.health = 1;
      // h in reach of the second bearer's burst only.
      get(sim, "h").position = past;
      applyDamage(
        get(sim, "a").combatant,
        1000,
        "slashing",
        false,
        [],
        get(sim, smitten).combatant,
      );
      const log = stepFor(sim, 1);
      expect(get(sim, smitten).combatant.dead).toBe(true);
      expect(get(sim, second).combatant.dead).toBe(true);
      expect(amounts(log, "necromancer.putrid-bile", "damage", second)).toHaveLength(1);
      expect(amounts(log, "necromancer.putrid-bile", "damage", "h")).toEqual([]);
    },
  );

  it("fires once for a plain death, not again as it settles", () => {
    const sim = arena();
    put(sim, "f", "reapers-mark");
    put(sim, "f", "putrid-bile");
    get(sim, "n").combatant.energy = 0;
    const log = [...kill(sim, "f"), ...stepFor(sim, 1)];
    expect(amounts(log, "necromancer.reapers-mark", "energy-gain", "n")).toEqual([13]);
    expect(amounts(log, "necromancer.putrid-bile", "damage", "g")).toHaveLength(1);
  });
});

describe("Reaper's Mark (#1762)", () => {
  it("is a 30 s hex of -4 that gives its caster 13 energy on the death", () => {
    expect(getSkill("necromancer.reapers-mark")).toMatchObject({
      gwId: 808,
      elite: true,
      attributeId: "necromancer.soul-reaping",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 1,
      rechargeSeconds: 10,
      effects: [{ kind: "apply-status", statusId: "reapers-mark", durationSeconds: { flat: 30 } }],
    });
    expect(describeStatus("reapers-mark", RANKS)).toBe(
      "−4 Health degeneration. If target foe dies while hexed with this, you gain 13 Energy",
    );
  });

  it("cast on a foe that then dies, refills its caster", () => {
    const sim = arena(["necromancer.reapers-mark"]);
    sim.setTarget("n", "f");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1 + RULES.combat.aftercastSeconds);
    expect(get(sim, "f").combatant.statuses.get("reapers-mark")?.sourceId).toBe("n");
    get(sim, "n").combatant.energy = 0;
    expect(amounts(kill(sim, "f"), "necromancer.reapers-mark", "energy-gain", "n")).toEqual([13]);
  });
});

describe("Assassin's Promise (#1762)", () => {
  const PROMISE = "assassin.assassins-promise";

  it("is a 13 s hex", () => {
    expect(getSkill(PROMISE)).toMatchObject({
      gwId: 1035,
      elite: true,
      attributeId: "assassin.deadly-arts",
      cost: { kind: "energy", amount: 5 },
      activationSeconds: 0.75,
      rechargeSeconds: 45,
      effects: [
        {
          kind: "apply-status",
          statusId: "assassins-promise",
          durationSeconds: {
            scaling: { attributeId: "assassin.deadly-arts", atZero: 5, atTwelve: 13 },
          },
        },
      ],
    });
    expect(describeStatus("assassins-promise", RANKS)).toBe(
      "if target foe dies while hexed with this, you gain 17 Energy and all your skills are recharged",
    );
  });

  it("on the death, its caster gains 17 energy and every skill recharges, this one too", () => {
    const sim = arena([PROMISE, "necromancer.reapers-mark"]);
    sim.setTarget("n", "f");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.75 + RULES.combat.aftercastSeconds);
    const n = get(sim, "n").combatant;
    n.cast.startRecharge("necromancer.reapers-mark", 10);
    expect(n.cast.rechargeRemaining.get(PROMISE)).toBeGreaterThan(40);
    n.energy = 0;
    const log = kill(sim, "f");
    expect(amounts(log, PROMISE, "energy-gain", "n")).toEqual([17]);
    expect(n.cast.rechargeRemaining.has(PROMISE)).toBe(false);
    expect(n.cast.rechargeRemaining.has("necromancer.reapers-mark")).toBe(false);
  });

  it("a dead caster's skills stay recharging", () => {
    const sim = arena([PROMISE]);
    put(sim, "f", "assassins-promise");
    const n = get(sim, "n").combatant;
    kill(sim, "n", "f");
    n.cast.startRecharge(PROMISE, 45);
    kill(sim, "f");
    expect(n.cast.rechargeRemaining.has(PROMISE)).toBe(true);
  });
});

describe("Putrid Bile (#1762)", () => {
  it("is a 21 s hex of -3 with a 73 damage burst", () => {
    expect(getSkill("necromancer.putrid-bile")).toMatchObject({
      gwId: 2058,
      elite: false,
      attributeId: "necromancer.death-magic",
      cost: { kind: "energy", amount: 10 },
      rechargeSeconds: 12,
      effects: [
        {
          kind: "apply-status",
          statusId: "putrid-bile",
          durationSeconds: {
            scaling: { attributeId: "necromancer.death-magic", atZero: 5, atTwelve: 21 },
          },
        },
      ],
    });
    expect(describeStatus("putrid-bile", RANKS)).toBe(
      "−3 Health degeneration. If target foe dies while hexed with this, nearby foes take 73 damage",
    );
  });
});

describe("Icy Veins (#1762)", () => {
  it("strikes for 74 cold, then hexes for 30 s with a 92 cold burst", () => {
    expect(getSkill("necromancer.icy-veins")).toMatchObject({
      gwId: 821,
      elite: true,
      attributeId: "necromancer.soul-reaping",
      cost: { kind: "energy", amount: 10 },
      rechargeSeconds: 5,
    });
    expect(JSON.stringify(describeSkill(skill("necromancer.icy-veins"), RANKS))).toContain("74");
    expect(describeStatus("icy-veins", RANKS)).toBe(
      "if target foe dies while hexed with this, nearby foes take 92 cold damage",
    );
  });

  it("bursts cold round the corpse", () => {
    const sim = arena();
    put(sim, "f", "icy-veins");
    const log = kill(sim, "f");
    expect(amounts(log, "necromancer.icy-veins", "damage", "g")).toHaveLength(1);
    expect(amounts(log, "necromancer.icy-veins", "damage", "h")).toEqual([]);
  });
});

describe("Dwayna's Sorrow (#1762)", () => {
  const SORROW = "monk.dwaynas-sorrow";

  it("enchants the target ally and the allies near it for 30 s", () => {
    expect(getSkill(SORROW)).toMatchObject({
      gwId: 838,
      elite: false,
      attributeId: "monk.healing-prayers",
      cost: { kind: "energy", amount: 5 },
      rechargeSeconds: 5,
      target: "single-ally",
    });
    expect(describeStatus("dwaynas-sorrow", RANKS)).toBe(
      "if an ally dies while enchanted with this, your party is healed for 41",
    );
    const sim = arena([SORROW]);
    sim.setTarget("n", "a");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 1 + RULES.combat.aftercastSeconds + 2);
    expect(get(sim, "a").combatant.statuses.has("dwaynas-sorrow")).toBe(true);
    expect(get(sim, "b").combatant.statuses.has("dwaynas-sorrow")).toBe(false);
  });

  it("an ally who dies with it heals the caster's party at any distance", () => {
    const sim = arena();
    put(sim, "a", "dwaynas-sorrow");
    for (const id of ["n", "b"]) {
      get(sim, id).combatant.health = 100;
    }
    get(sim, "g").combatant.health = 100;
    const log = kill(sim, "a", "f");
    expect(amounts(log, SORROW, "heal", "n")).toEqual([41]);
    expect(amounts(log, SORROW, "heal", "b")).toEqual([41]);
    expect(amounts(log, SORROW, "heal", "g")).toEqual([]);
  });

  it("two allies who die together heal twice", () => {
    const sim = arena();
    put(sim, "a", "dwaynas-sorrow");
    put(sim, "b", "dwaynas-sorrow");
    get(sim, "n").combatant.health = 100;
    for (const id of ["a", "b"]) {
      get(sim, id).combatant.statuses.apply("burning", 10, "f", NO_RANKS);
      get(sim, id).combatant.health = 0.2;
    }
    const log = stepFor(sim, 4 * DT);
    expect(amounts(log, SORROW, "heal", "n")).toEqual([41, 41]);
  });
});
