import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import type { CombatEvent } from "../skills/effects.js";
import { getSkill } from "../skills/index.js";
import { rankOf } from "../skills/tick.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Minions 3 (#1915): Order of Undeath makes minions hit harder at their
 * owner's Health, Aura of the Lich takes every corpse in earshot, Infuse
 * Condition hands conditions to a minion, and Taste of Death drinks one.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const ORDER = "necromancer.order-of-undeath";
const AURA = "necromancer.aura-of-the-lich";
const INFUSE = "necromancer.infuse-condition";
const TASTE = "necromancer.taste-of-death";
const HORROR = "necromancer.animate-bone-horror";
const HAWK = "elementalist.ebon-hawk";
const PLAGUE_SIGNET = "necromancer.plague-signet";
const EPIDEMIC = "mesmer.epidemic";
const DEATH_MAGIC = "necromancer.death-magic";
const BAR = [ORDER, AURA, INFUSE, TASTE, HORROR];

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: BAR,
    attributeRanks: new Map([[DEATH_MAGIC, 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/**
 * `n` the necromancer (480 Health), `a` its ally; `x`, `z` and `w` foes to
 * kill for corpses, `y` a foe beside them, `e` a foe with Ebon Hawk;
 * `extra` beside them.
 */
function match(...extra: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "minions-3",
    participants: [
      spec("n", 0, vec2(0, 0), { maxHealth: 480 }),
      spec("a", 0, vec2(-40, 0)),
      spec("x", 1, vec2(200, 0)),
      spec("z", 1, vec2(200, 40)),
      spec("w", 1, vec2(200, -40)),
      spec("y", 1, vec2(230, 0), { skillBar: [] }),
      spec("e", 1, vec2(0, 600), {
        skillBar: [HAWK],
        attributeRanks: new Map([["elementalist.earth-magic", 12]]),
      }),
      ...extra,
    ],
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `caster` uses `skillId` on `targetId` through to its log entry; its events. */
function cast(
  sim: MatchSimulation,
  skillId: string,
  targetId?: string,
  caster = "n",
): CombatEvent[] {
  const record = get(sim, caster);
  while ((record.combatant.cast.rechargeRemaining.get(skillId) ?? 0) > 0) {
    sim.step(DT);
  }
  record.combatant.energy = 100;
  sim.setTarget(caster, targetId);
  const slot = BAR.indexOf(skillId);
  expect(sim.requestSkill(caster, slot)?.check).toEqual({ ok: true });
  const log: CombatLogEntry[] = [];
  for (
    let i = 0;
    !log.some((entry) => entry.sourceId === caster && entry.skillId === skillId);
    i++
  ) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  stepFor(sim, 2 * DT);
  return log.flatMap((entry) => (entry.skillId === skillId ? entry.events : []));
}

/**
 * `e` throws Ebon Hawk at `n` and it lands; the Weakness it gave. `each`,
 * if any, runs before every tick of it.
 */
function hawk(sim: MatchSimulation, each?: () => void): CombatEvent[] {
  const events: CombatEvent[] = [];
  get(sim, "e").combatant.energy = 100;
  sim.setTarget("e", "n");
  expect(sim.requestSkill("e", 0)?.check).toEqual({ ok: true });
  for (let i = 0; i < 5 * RULES.tickRateHz && events.length === 0; i++) {
    each?.();
    events.push(
      ...sim
        .step(DT)
        .log.flatMap((entry) =>
          entry.events.filter(
            (event) => event.kind === "status-applied" && event.statusId === "weakness",
          ),
        ),
    );
  }
  return events;
}

/** `caster` uses `skillId`, first on its bar, on `targetId`, through to its log entry. */
function useFirst(sim: MatchSimulation, caster: string, skillId: string, targetId: string): void {
  get(sim, caster).combatant.energy = 100;
  sim.setTarget(caster, targetId);
  expect(sim.requestSkill(caster, 0)?.check).toEqual({ ok: true });
  for (
    let i = 0;
    !sim.step(DT).log.some((entry) => entry.sourceId === caster && entry.skillId === skillId);
    i++
  ) {
    expect(i).toBeLessThan(5 * RULES.tickRateHz);
  }
}

function conditionsOf(record: Participant): string[] {
  return record.combatant.statuses.active.map(({ id }) => id);
}

function horrorsOf(sim: MatchSimulation, owner = "n"): Participant[] {
  return [...sim.participants()].filter(
    (participant) =>
      participant.creature?.ownerId === owner &&
      participant.creature.name === "Bone Horror" &&
      !participant.combatant.dead,
  );
}

function onlyHorror(sim: MatchSimulation): Participant {
  const [horror, ...rest] = horrorsOf(sim);
  expect(rest).toHaveLength(0);
  if (horror === undefined) {
    throw new Error("no Bone Horror");
  }
  return horror;
}

/** The damage each of `sourceId`'s landed weapon blows dealt `y`, and `n`'s loss with it. */
function blowsOn(
  log: readonly CombatLogEntry[],
  sourceId: string,
): { dealt: number; lost: number }[] {
  return log
    .filter((entry) => entry.cause === "weapon" && entry.sourceId === sourceId)
    .flatMap((entry) => {
      const dealt = entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === "y" ? [event.amount] : [],
      );
      const lost = entry.events.flatMap((event) =>
        event.kind === "health-loss" && event.targetId === "n" ? [event.amount] : [],
      );
      return dealt.map((amount) => ({ dealt: amount, lost: lost.reduce((a, b) => a + b, 0) }));
    });
}

describe("the catalog (#1915)", () => {
  it.each([
    [ORDER, 10, 1, 5, true],
    [AURA, 15, 2, 45, true],
    [INFUSE, 5, 1, 20, false],
    [TASTE, 5, 0.25, 0, false],
  ])(
    "%s costs %i energy, casts in %f s, recharges in %i s",
    (id, energy, cast, recharge, elite) => {
      const skill = getSkill(id);
      expect(skill?.cost).toEqual({ kind: "energy", amount: energy });
      expect(skill?.activationSeconds).toBe(cast);
      expect(skill?.rechargeSeconds).toBe(recharge);
      expect(skill?.elite).toBe(elite);
    },
  );
});

describe("Order of Undeath (#1915)", () => {
  /** A Bone Horror of `n`'s on `y`, for 4 s; Order of Undeath on `bearer` first, if any. */
  function fight(bearer: string | undefined): { dealt: number; lost: number }[] {
    const sim = match();
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    if (bearer !== undefined) {
      get(sim, bearer).combatant.statuses.apply("order-of-undeath", 60, "n", NO_RANKS);
    }
    return blowsOn(stepFor(sim, 8), horror.id);
  }

  it("adds 13 to each landed hit of its bearer's minions, and takes 10 of 480 Health a hit", () => {
    const plain = fight(undefined);
    const ordered = fight("n");
    expect(ordered.length).toBeGreaterThanOrEqual(2);
    expect(ordered.length).toBe(plain.length);
    ordered.forEach((blow, i) => {
      expect(blow.dealt - (plain[i]?.dealt ?? 0)).toBe(13);
      expect(blow.lost).toBe(10);
    });
    expect(plain.every(({ lost }) => lost === 0)).toBe(true);
  });

  it("takes nothing for a blow that misses", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    horror.combatant.statuses.apply("blind", 60, "y", NO_RANKS);
    get(sim, "n").combatant.statuses.apply("order-of-undeath", 60, "n", NO_RANKS);
    const missed = stepFor(sim, 20).filter(
      (entry) =>
        entry.sourceId === horror.id &&
        entry.events.some((event) => event.kind === "attack-missed"),
    );
    expect(missed.length).toBeGreaterThanOrEqual(1);
    for (const entry of missed) {
      expect(entry.events.some((event) => event.kind === "health-loss")).toBe(false);
    }
  });

  it("is its bearer's alone: on an ally, the necromancer's minion gains nothing", () => {
    const plain = fight(undefined);
    const ally = fight("a");
    expect(ally).toEqual(plain);
  });
});

describe("Aura of the Lich (#1915)", () => {
  it("takes all three corpses in earshot for four Bone Horrors, made at Death Magic 12", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "z");
    kill(sim, "w");
    cast(sim, AURA);
    const horrors = horrorsOf(sim);
    expect(horrors).toHaveLength(4);
    // Level 14, 360 Health: the +1 Death Magic comes after them.
    expect(horrors.map(({ combatant }) => combatant.maxHealth)).toEqual([360, 360, 360, 360]);
    for (const id of ["x", "z", "w"]) {
      expect(get(sim, id).corpseExploited).toBe(true);
    }
  });

  it("with no corpse, makes one Bone Horror, then gives +1 Death Magic", () => {
    const sim = match();
    const n = get(sim, "n");
    expect(rankOf(n.combatant, DEATH_MAGIC)).toBe(12);
    cast(sim, AURA);
    expect(onlyHorror(sim).combatant.maxHealth).toBe(360);
    expect(rankOf(n.combatant, DEATH_MAGIC)).toBe(13);
  });

  it("refreshes when cast again: the +1 does not stack", () => {
    const sim = match();
    cast(sim, AURA);
    cast(sim, AURA);
    expect(rankOf(get(sim, "n").combatant, DEATH_MAGIC)).toBe(13);
  });
});

describe("Infuse Condition (#1915)", () => {
  it("hands a condition aimed at its bearer to its closest minion, for as long", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    cast(sim, INFUSE);
    const events = hawk(sim);
    expect(events).toContainEqual({
      kind: "status-applied",
      targetId: horror.id,
      statusId: "weakness",
      durationSeconds: 13,
    });
    const on = (record: Participant): string[] =>
      record.combatant.statuses.active.map(({ id }) => id);
    expect(on(horror)).toContain("weakness");
    expect(on(get(sim, "n"))).not.toContain("weakness");
    // Not used up.
    expect(on(get(sim, "n"))).toContain("infuse-condition");
  });

  it("hands it to the closer of two minions", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "z");
    cast(sim, HORROR);
    cast(sim, HORROR);
    cast(sim, INFUSE);
    const [first, second] = horrorsOf(sim);
    if (first === undefined || second === undefined) {
      throw new Error("not two Bone Horrors");
    }
    // One held far off for the whole cast.
    const events = hawk(sim, () => {
      first.position = vec2(-300, 0);
    });
    expect(events).toEqual([expect.objectContaining({ targetId: second.id })]);
  });

  it("hands a transferred condition to a minion: Plague Signet on its bearer", () => {
    const sim = match(spec("c", 1, vec2(0, 200), { skillBar: [PLAGUE_SIGNET] }));
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    cast(sim, INFUSE);
    get(sim, "c").combatant.statuses.apply("bleeding", 10, "n", NO_RANKS);
    useFirst(sim, "c", PLAGUE_SIGNET, "n");
    expect(conditionsOf(horror)).toContain("bleeding");
    expect(conditionsOf(get(sim, "n"))).not.toContain("bleeding");
  });

  it("hands a spread condition to a minion: Epidemic beside its bearer", () => {
    const sim = match(spec("c", 1, vec2(0, 200), { skillBar: [EPIDEMIC] }));
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    cast(sim, INFUSE);
    get(sim, "a").combatant.statuses.apply("bleeding", 10, "c", NO_RANKS);
    useFirst(sim, "c", EPIDEMIC, "a");
    expect(conditionsOf(horror)).toContain("bleeding");
    expect(conditionsOf(get(sim, "n"))).not.toContain("bleeding");
  });

  it("lands on its bearer with no minion alive", () => {
    const sim = match();
    cast(sim, INFUSE);
    hawk(sim);
    expect(get(sim, "n").combatant.statuses.active.map(({ id }) => id)).toContain("weakness");
  });
});

describe("Taste of Death (#1915)", () => {
  it("steals 340 Health from the caster's minion", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, HORROR);
    const horror = onlyHorror(sim);
    horror.combatant.maxHealth = 1000;
    horror.combatant.health = 1000;
    const n = get(sim, "n");
    n.combatant.health = 100;
    cast(sim, TASTE, horror.id);
    expect(horror.combatant.health).toBeLessThanOrEqual(1000 - 340);
    expect(horror.combatant.health).toBeGreaterThan(1000 - 340 - 10);
    expect(n.combatant.health).toBeGreaterThanOrEqual(100 + 340);
  });

  it("refuses a foe's minion", () => {
    const sim = match();
    kill(sim, "x");
    cast(sim, HORROR, undefined, "w");
    const [horror] = horrorsOf(sim, "w");
    if (horror === undefined) {
      throw new Error("no Bone Horror of w's");
    }
    get(sim, "n").combatant.energy = 100;
    sim.setTarget("n", horror.id);
    expect(sim.requestSkill("n", BAR.indexOf(TASTE))?.check.ok).toBe(false);
  });
});
