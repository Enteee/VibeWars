import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { NO_RANKS } from "./status.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Mechanics (#2479): Death Pact Signet, whose raised ally takes its caster
 * along when it dies; "We Shall Return!", more Health and Energy for every
 * resurrection; Lyssa's Haste, which interrupts adjacent foes as it starts
 * and as it ends; Shadow Shroud, whose foe cannot be the target of
 * enchantments. Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DP: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: true,
};

const PACT = "ritualist.death-pact-signet";
const WSR = "paragon.we-shall-return";
const HASTE = "dervish.lyssas-haste";
const SHROUD = "assassin.shadow-shroud";
const RESTORE_LIFE = "monk.restore-life";
const KINETIC_ARMOR = "elementalist.kinetic-armor";
const FLEETING_STABILITY = "dervish.fleeting-stability";
const GUARDIAN = "monk.guardian";
const ORISON = "monk.orison-of-healing";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the four are the corpus's (#2479)", () => {
  it.each([
    [PACT, 1481, "signet", false, "ritualist.restoration-magic", 0, 4, 12, "single-dead-ally"],
    [WSR, 1592, "shout", false, "paragon.command", 5, 0, 15, "self"],
    [HASTE, 1512, "enchantment", false, "dervish.wind-prayers", 5, 0, 25, "self"],
    [SHROUD, 928, "hex", true, "assassin.shadow-arts", 5, 0.25, 20, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("Lyssa's Haste is a flash enchantment that fails half the time below Wind Prayers 5", () => {
    expect(skill(HASTE)).toMatchObject({
      flash: true,
      failChanceUnless: { attributeId: "dervish.wind-prayers", rank: 5, chance: 0.5 },
    });
  });
});

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
  ranks: ReadonlyMap<string, number> = new Map(),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function match(...participants: ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({ seed: "mech-2479", matchRules: DP, participants });
  for (const participant of sim.participants()) {
    participant.combatant.energy = participant.combatant.maxEnergy;
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

/** `id` burns to death this tick. */
function kill(sim: MatchSimulation, id: string): void {
  const combatant = get(sim, id);
  combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  combatant.health = 0.2;
  sim.step(DT);
  expect(combatant.dead).toBe(true);
}

/** `casterId` uses the skill in `slot` on `targetId`, then steps `seconds`. */
function use(
  sim: MatchSimulation,
  casterId: string,
  slot: number,
  targetId: string,
  seconds: number,
): CombatLogEntry[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, seconds);
}

const ritualist = (rank: number) => new Map([["ritualist.restoration-magic", rank]]);

describe("Death Pact Signet (#2479)", () => {
  /** `r` raises the dead `a` with the signet at `rank`, standing at `health`. */
  function pact(rank = 12, health = 300) {
    const sim = match(
      spec("a", 0, vec2(0, 0)),
      spec("r", 0, vec2(200, 0), [PACT], ritualist(rank)),
      spec("x", 1, vec2(900, 0)),
    );
    kill(sim, "a");
    get(sim, "r").health = health;
    use(sim, "r", 0, "a", skill(PACT).activationSeconds + 0.1);
    return sim;
  }

  it("raises the ally with the caster's Health and 83% Energy at rank 12, 15% at rank 0", () => {
    const at12 = get(pact(12), "a");
    expect(at12).toMatchObject({ dead: false, health: 300 });
    expect(at12.energy).toBe(Math.floor(at12.maxEnergy * 0.83));
    const at0 = get(pact(0), "a");
    expect(at0).toMatchObject({ dead: false, health: 300 });
    expect(at0.energy).toBe(Math.floor(at0.maxEnergy * 0.15));
  });

  it("caps the caster's Health at the ally's maximum", () => {
    const raised = match(
      spec("a", 0, vec2(0, 0)),
      { ...spec("r", 0, vec2(200, 0), [PACT], ritualist(12)), maxHealth: 1000 },
      spec("x", 1, vec2(900, 0)),
    );
    kill(raised, "a");
    get(raised, "r").health = 800;
    use(raised, "r", 0, "a", skill(PACT).activationSeconds + 0.1);
    // Its maximum after the death penalty.
    expect(get(raised, "a").health).toBe(get(raised, "a").maxHealth);
    expect(get(raised, "a").health).toBeLessThan(800);
  });

  it("kills the caster, sparing its death penalty, when the ally dies within 120 seconds", () => {
    const sim = pact();
    expect(get(sim, "a").statuses.get("death-pact-signet")?.remainingSeconds).toBeGreaterThan(119);
    stepFor(sim, 60);
    kill(sim, "a");
    expect(get(sim, "r").dead).toBe(true);
    expect(get(sim, "r").morale).toBe(0);
  });

  it("does nothing once 120 seconds have passed", () => {
    const sim = pact();
    stepFor(sim, 121);
    expect(get(sim, "a").statuses.get("death-pact-signet")).toBeUndefined();
    kill(sim, "a");
    expect(get(sim, "r").dead).toBe(false);
  });

  it("is harmless once the caster has died first", () => {
    const sim = pact();
    kill(sim, "r");
    kill(sim, "a");
    expect(get(sim, "r").dead).toBe(true);
    expect(get(sim, "a").dead).toBe(true);
  });

  it("passes a death down a chain of pacts, and stops at a loop", () => {
    // r2 raised r1, then r1 raised a: a's death takes r1, and r1's r2.
    const chain = match(
      spec("a", 0, vec2(0, 0)),
      spec("r1", 0, vec2(100, 0), [PACT], ritualist(12)),
      spec("r2", 0, vec2(200, 0), [PACT], ritualist(12)),
      spec("x", 1, vec2(900, 0)),
    );
    kill(chain, "r1");
    use(chain, "r2", 0, "r1", skill(PACT).activationSeconds + 0.1);
    kill(chain, "a");
    use(chain, "r1", 0, "a", skill(PACT).activationSeconds + 0.1);
    kill(chain, "a");
    expect([get(chain, "r1").dead, get(chain, "r2").dead]).toEqual([true, true]);

    // a and b raised each other: a's death takes b, and b's pact stops at a.
    const loop = match(
      spec("a", 0, vec2(0, 0), [PACT], ritualist(12)),
      spec("b", 0, vec2(100, 0), [PACT], ritualist(12)),
      spec("x", 1, vec2(900, 0)),
    );
    kill(loop, "b");
    use(loop, "a", 0, "b", skill(PACT).activationSeconds + 0.1);
    kill(loop, "a");
    use(loop, "b", 0, "a", skill(PACT).activationSeconds + 0.1);
    kill(loop, "a");
    expect([get(loop, "a").dead, get(loop, "b").dead]).toEqual([true, true]);
  });
});

describe('"We Shall Return!" (#2479)', () => {
  /**
   * `p` shouts at Command `command` (unless `undefined`) at `paragonAt`, then `m`
   * raises `a` with Restore Life at Healing Prayers `healing`.
   */
  function raise(command: number | undefined, healing: number, paragonAt = vec2(150, 0)) {
    const sim = match(
      spec("a", 0, vec2(0, 0)),
      spec("p", 0, paragonAt, [WSR], new Map([["paragon.command", command ?? 0]])),
      spec("m", 0, vec2(100, 0), [RESTORE_LIFE], new Map([["monk.healing-prayers", healing]])),
      spec("x", 1, vec2(900, 0)),
    );
    kill(sim, "a");
    if (command !== undefined) {
      use(sim, "p", 0, "p", 0.1);
    }
    const log = use(sim, "m", 0, "a", skill(RESTORE_LIFE).activationSeconds + 0.5);
    const a = get(sim, "a");
    expect(a.dead).toBe(false);
    // Shares of its maxima after the death penalty, as the event has them.
    const { healthFraction, energyFraction } = resurrected(log);
    expect(a.health).toBe(Math.floor(a.maxHealth * healthFraction));
    expect(a.energy).toBe(Math.floor(a.maxEnergy * energyFraction));
    return [healthFraction, energyFraction];
  }

  function resurrected(log: readonly CombatLogEntry[]) {
    const event = log
      .flatMap((entry) => entry.events)
      .find((candidate) => candidate.kind === "resurrected");
    if (event?.kind !== "resurrected") {
      throw new Error("nobody was raised");
    }
    return event;
  }

  it("Restore Life alone: 20% Health, 42% Energy at rank 0", () => {
    expect(raise(undefined, 0)).toEqual([0.2, 0.42]);
  });

  it("adds 62 points of Health and 41 of Energy at rank 12, 10 and 5 at rank 0", () => {
    expect(raise(12, 0)).toEqual([0.82, 0.83]);
    expect(raise(0, 0)).toEqual([0.3, 0.47]);
  });

  it("caps each at 100%", () => {
    expect(raise(12, 12)).toEqual([1, 1]);
  });

  it("only for a resurrecter who was within earshot", () => {
    expect(raise(12, 0, vec2(-1500, 0))).toEqual([0.2, 0.42]);
  });

  it("lasts 10 seconds, and two shouts do not stack", () => {
    const sim = match(
      spec("p", 0, vec2(0, 0), [WSR], new Map([["paragon.command", 12]])),
      spec("q", 0, vec2(50, 0), [WSR], new Map([["paragon.command", 12]])),
      spec("x", 1, vec2(900, 0)),
    );
    use(sim, "p", 0, "p", 0.1);
    use(sim, "q", 0, "q", 0.1);
    const held = get(sim, "p").statuses.active.filter(({ id }) => id === "we-shall-return");
    expect(held).toHaveLength(1);
    expect(held[0]?.remainingSeconds).toBeGreaterThan(9.5);
    expect(held[0]?.remainingSeconds).toBeLessThanOrEqual(10);
  });
});

describe("Lyssa's Haste (#2479)", () => {
  const dervish = (rank: number) => new Map([["dervish.wind-prayers", rank]]);

  /**
   * `d` at the origin with Lyssa's Haste and Fleeting Stability; `f` and
   * `g`, foes with Kinetic Armor, adjacent.
   */
  function haste(rank = 12) {
    const earth = new Map([["elementalist.earth-magic", 12]]);
    return match(
      spec("d", 0, vec2(0, 0), [HASTE, FLEETING_STABILITY], dervish(rank)),
      spec("f", 1, vec2(40, 0), [KINETIC_ARMOR], earth),
      spec("g", 1, vec2(-40, 0), [KINETIC_ARMOR], earth),
    );
  }

  const interrupted = (log: readonly CombatLogEntry[], id = "f"): number =>
    log.filter((entry) =>
      entry.events.some((event) => event.kind === "interrupted" && event.targetId === id),
    ).length;

  it("interrupts an adjacent foe as it starts and as it expires: twice", () => {
    const sim = haste();
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    let log = use(sim, "d", 0, "d", DT);
    expect(interrupted(log)).toBe(1);
    expect(get(sim, "f").cast.isCasting).toBe(false);
    const remaining = get(sim, "d").statuses.get("lyssas-haste")?.remainingSeconds ?? 0;
    expect(remaining).toBeGreaterThan(12);
    expect(remaining).toBeLessThanOrEqual(13);

    // `f`'s Kinetic Armor is recharging: `g` casts its own as the haste ends.
    stepFor(sim, remaining - 1);
    expect(sim.requestSkill("g", 0)?.check).toEqual({ ok: true });
    log = stepFor(sim, 1.5);
    expect(get(sim, "d").statuses.get("lyssas-haste")).toBeUndefined();
    expect(interrupted(log, "g")).toBe(1);
  });

  it("interrupts again when it is removed, and lasts 3 seconds at rank 0", () => {
    const sim = haste();
    use(sim, "d", 0, "d", DT);
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    get(sim, "d").statuses.end("lyssas-haste");
    expect(interrupted(stepFor(sim, 2 * DT))).toBe(1);
    expect(skill(HASTE).effects[1]).toMatchObject({
      durationSeconds: { scaling: { atZero: 3, atTwelve: 12.6 } },
    });
  });

  it("recharges the bearer's Dervish enchantments 33% faster", () => {
    const sim = haste();
    // A flash enchantment keeps the next one back a second.
    use(sim, "d", 0, "d", 1);
    use(sim, "d", 1, "d", DT);
    const left = get(sim, "d").cast.rechargeRemaining.get(FLEETING_STABILITY) ?? 0;
    expect(left).toBeGreaterThan(9.5);
    expect(left).toBeLessThan(10.2);
  });
});

describe("Shadow Shroud (#2479)", () => {
  /** `s` hexes `f`, which already holds Guardian; `g`, `f`'s ally, holds Guardian and Orison. */
  function shroud(rank = 12) {
    const sim = match(
      spec("s", 0, vec2(0, 0), [SHROUD], new Map([["assassin.shadow-arts", rank]])),
      spec("f", 1, vec2(100, 0), [GUARDIAN]),
      spec("g", 1, vec2(150, 0), [GUARDIAN, ORISON]),
    );
    get(sim, "f").statuses.apply("guardian", 10, "g", NO_RANKS);
    use(sim, "s", 0, "f", skill(SHROUD).activationSeconds + 0.1);
    return sim;
  }

  it("lasts 6 seconds at rank 12, 2 at rank 0", () => {
    const at12 = get(shroud(12), "f").statuses.get("shadow-shroud")?.remainingSeconds ?? 0;
    expect(at12).toBeGreaterThan(5.5);
    expect(at12).toBeLessThanOrEqual(6);
    const at0 = get(shroud(0), "f").statuses.get("shadow-shroud")?.remainingSeconds ?? 0;
    expect(at0).toBeGreaterThan(1.5);
    expect(at0).toBeLessThanOrEqual(2);
  });

  it("keeps the enchantments already on the foe", () => {
    expect(get(shroud(), "f").statuses.get("guardian")).toBeDefined();
  });

  it("refuses its allies' enchantments and its own, but not their other spells", () => {
    const sim = shroud();
    sim.setTarget("g", "f");
    expect(sim.requestSkill("g", 0)?.check).toEqual({
      ok: false,
      reason: "invalid-target-unenchantable",
    });
    sim.setTarget("f", "f");
    expect(sim.requestSkill("f", 0)?.check).toEqual({
      ok: false,
      reason: "invalid-target-unenchantable",
    });
    expect(sim.requestSkill("g", 1)?.check).toEqual({ ok: true });
  });
});
