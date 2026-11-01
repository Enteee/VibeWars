import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { NO_RANKS, aggregateModifiers } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";

/**
 * Pets 2 (#1865): effects that reach a Ranger's pet from a skill aimed
 * elsewhere, a pet's status that reaches its owner, and two pet attacks.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const OTYUGH = "ranger.otyughs-cry";
const BOND = "ranger.predatory-bond";
const COMPANIONSHIP = "ranger.companionship";
const RAMPAGE = "ranger.rampage-as-one";
const RUN = "ranger.run-as-one";
const POUNCE = "ranger.savage-pounce";
const MAULING = "ranger.bestial-mauling";
const ROTTING_FLESH = "necromancer.rotting-flesh";
const BAR = [CHARM, OTYUGH, BOND, COMPANIONSHIP, RAMPAGE, RUN, POUNCE, MAULING];
/** Companionship's 2 s activation, the aftercast, and a tick to spare. */
const COMPANIONSHIP_SECONDS = 2 + RULES.combat.aftercastSeconds + 2 * DT;

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxEnergy: 100,
    ...extra,
  };
  return result;
}

/** Ranger `r` with `bar` at Beast Mastery 12, at the origin; foe `a` 60 off. */
function match(bar: readonly string[] = BAR, seed = "pets-2"): MatchSimulation {
  return new MatchSimulation({
    seed,
    participants: [
      spec("r", 0, vec2(0, 0), {
        skillBar: bar,
        attributeRanks: new Map([["ranger.beast-mastery", 12]]),
      }),
      spec("a", 1, vec2(60, 0), { skillBar: [ROTTING_FLESH] }),
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

function wolf(sim: MatchSimulation): Participant {
  const pet = [...sim.participants()].find((other) => other.creature?.ownerId === "r");
  if (pet === undefined) {
    throw new Error("r has no pet");
  }
  return pet;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `r` presses `skillId` from its bar. */
function press(sim: MatchSimulation, skillId: string) {
  return sim.requestSkill("r", get(sim, "r").skillBar.indexOf(skillId));
}

/** Kill `victim` as burning would. */
function kill(sim: MatchSimulation, victim: Participant): void {
  victim.combatant.statuses.apply("burning", 10, "x", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** How many of `kind` the wolf's entries in `log` hold. */
function count(log: readonly CombatLogEntry[], pet: Participant, kind: string): number {
  return log
    .filter((entry) => entry.sourceId === pet.id)
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === kind).length;
}

describe("Otyugh's Cry (#1865)", () => {
  /** The wolf's blocked and landed bites on a Guardian'd foe in 20 s. */
  function bites(cry: boolean): { blocked: number; landed: number; armor: number } {
    const sim = match();
    const pet = wolf(sim);
    get(sim, "a").combatant.statuses.apply("guardian", 60, "x", NO_RANKS);
    if (cry) {
      expect(press(sim, OTYUGH)?.check).toEqual({ ok: true });
    }
    stepFor(sim, DT);
    const armor = aggregateModifiers(pet.combatant.statuses.active).armorModifier;
    expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
    const log = stepFor(sim, 12);
    return {
      blocked: count(log, pet, "attack-blocked"),
      landed: count(log, pet, "damage"),
      armor,
    };
  }

  it("gives the pet +24 armor, and no foe blocks its attacks", () => {
    const plain = bites(false);
    expect(plain.blocked).toBeGreaterThan(0);
    const cried = bites(true);
    expect(cried.armor).toBe(24);
    expect(cried.blocked).toBe(0);
    expect(cried.landed).toBeGreaterThan(3);
  });

  it("covers the pet's attack skills' blows too", () => {
    const sim = match();
    const pet = wolf(sim);
    get(sim, "a").combatant.statuses.apply("guardian", 60, "x", NO_RANKS);
    expect(press(sim, OTYUGH)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    sim.setTarget("r", "a");
    let landed = 0;
    for (const skillId of [POUNCE, MAULING]) {
      expect(press(sim, skillId)?.check).toEqual({ ok: true });
      const log = stepFor(sim, 3);
      expect(count(log, pet, "attack-blocked")).toBe(0);
      landed += count(
        log.filter((entry) => entry.skillId === skillId),
        pet,
        "damage",
      );
    }
    expect(landed).toBe(2);
  });
});

describe("Predatory Bond (#1865)", () => {
  it("heals the Ranger 25 for each of the pet's hits, and nothing for a block", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    get(sim, "a").combatant.statuses.apply("guardian", 60, "x", NO_RANKS);
    expect(press(sim, BOND)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(pet.combatant.statuses.has("predatory-bond")).toBe(true);
    owner.combatant.health = 100;
    expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
    const log = stepFor(sim, 12);
    const landed = log
      .filter((entry) => entry.sourceId === pet.id)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "damage" && event.targetId === "a").length;
    const heals = log
      .filter((entry) => entry.skillId === BOND)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "heal" && event.targetId === "r")
      .map((event) => (event.kind === "heal" ? event.amount : 0));
    expect(count(log, pet, "attack-blocked")).toBeGreaterThan(0);
    expect(landed).toBeGreaterThan(0);
    expect(heals).toEqual(Array.from({ length: landed }, () => 25));
  });

  it("heals nobody once its owner is dead", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    expect(press(sim, BOND)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    kill(sim, owner);
    expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
    const log = stepFor(sim, 6);
    expect(log.flatMap((entry) => entry.events)).not.toContainEqual(
      expect.objectContaining({ kind: "heal", targetId: "r" }),
    );
  });
});

describe("Companionship (#1865)", () => {
  /** What Companionship heals `r` and its wolf, from these Health. */
  function healed(ownerHealth: number, petHealth: number): { owner: number; pet: number } {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    owner.combatant.health = ownerHealth;
    pet.combatant.health = petHealth;
    expect(press(sim, COMPANIONSHIP)?.check).toEqual({ ok: true });
    const heals = stepFor(sim, COMPANIONSHIP_SECONDS)
      .filter((entry) => entry.skillId === COMPANIONSHIP)
      .flatMap((entry) => entry.events)
      .flatMap((event) => (event.kind === "heal" ? [event] : []));
    const to = (id: string) =>
      heals.filter((event) => event.targetId === id).reduce((sum, e) => sum + e.amount, 0);
    return { owner: to("r"), pet: to(pet.id) };
  }

  it("heals whichever of you has less Health by 102, and nobody when equal", () => {
    expect(healed(100, 150)).toEqual({ owner: 102, pet: 0 });
    expect(healed(150, 100)).toEqual({ owner: 0, pet: 102 });
    expect(healed(120, 120)).toEqual({ owner: 0, pet: 0 });
  });

  it("heals nobody with no living pet", () => {
    const sim = match();
    const owner = get(sim, "r");
    kill(sim, wolf(sim));
    stepFor(sim, 5);
    owner.combatant.health = 50;
    expect(press(sim, COMPANIONSHIP)?.check).toEqual({ ok: true });
    stepFor(sim, COMPANIONSHIP_SECONDS);
    expect(owner.combatant.health).toBeLessThan(60);
  });
});

describe("Rampage as One (#1865)", () => {
  it("is refused with a dead pet, and nothing is paid", () => {
    const sim = match();
    const owner = get(sim, "r");
    kill(sim, wolf(sim));
    // Past its 4 s bar disable, so only the corpse refuses it.
    stepFor(sim, 5);
    const before = owner.combatant.energy;
    expect(press(sim, RAMPAGE)?.check).toEqual({ ok: false, reason: "invalid-target-dead" });
    expect(owner.combatant.energy).toBe(before);
  });

  it("makes you and your pet attack 33% faster and run 25% faster, for 13 s", () => {
    const sim = match();
    const owner = get(sim, "r");
    const pet = wolf(sim);
    expect(press(sim, RAMPAGE)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    for (const body of [owner, pet]) {
      const modifiers = aggregateModifiers(body.combatant.statuses.active);
      expect(modifiers.moveSpeedMultiplier).toBe(1.25);
      expect(modifiers.attackDurationMultiplier).toBe(0.67);
    }
    stepFor(sim, 13);
    expect(owner.combatant.statuses.has("rampage-as-one")).toBe(false);
    expect(pet.combatant.statuses.has("rampage-as-one")).toBe(false);
  });
});

describe("Run as One (#1865)", () => {
  it("speeds the Ranger and its pet 25%", () => {
    const sim = match();
    const pet = wolf(sim);
    expect(press(sim, RUN)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    for (const body of [get(sim, "r"), pet]) {
      expect(aggregateModifiers(body.combatant.statuses.active).moveSpeedMultiplier).toBe(1.25);
    }
  });

  it("with no pet, speeds the Ranger alone", () => {
    const sim = match([RUN]);
    expect([...sim.participants()].some((other) => other.creature?.ownerId === "r")).toBe(false);
    expect(press(sim, RUN)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    expect(get(sim, "r").combatant.statuses.get("run-as-one")?.remainingSeconds).toBeGreaterThan(
      12,
    );
  });

  it("the pet's ends with its death; the Ranger keeps theirs", () => {
    const sim = match();
    const pet = wolf(sim);
    expect(press(sim, RUN)?.check).toEqual({ ok: true });
    stepFor(sim, DT);
    kill(sim, pet);
    expect(pet.combatant.statuses.has("run-as-one")).toBe(false);
    expect(get(sim, "r").combatant.statuses.has("run-as-one")).toBe(true);
  });
});

describe("Savage Pounce and Bestial Mauling (#1865)", () => {
  /** The wolf's first blow armed with `skillId` on `a`, `prepare`d first. */
  function blow(skillId: string, prepare: (foe: Participant) => void) {
    const sim = match();
    const foe = get(sim, "a");
    prepare(foe);
    sim.setTarget("r", "a");
    expect(press(sim, skillId)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 3);
    const entry = log.find((each) => each.sourceId === wolf(sim).id && each.skillId === skillId);
    expect(entry).toBeDefined();
    return { events: entry?.events ?? [], foe };
  }

  it("Savage Pounce knocks down a foe casting a spell, and only then", () => {
    const casting = blow(POUNCE, (foe) => {
      foe.combatant.cast.beginCast(ROTTING_FLESH, "r", 60, undefined);
    });
    expect(casting.events).toContainEqual(
      expect.objectContaining({ kind: "knocked-down", targetId: "a" }),
    );
    const idle = blow(POUNCE, () => undefined);
    expect(idle.events).not.toContainEqual(expect.objectContaining({ kind: "knocked-down" }));
  });

  it("Bestial Mauling dazes a knocked-down foe for 9 s, and only then", () => {
    const down = blow(MAULING, (foe) => {
      foe.combatant.knockdownRemaining = 10;
    });
    expect(down.events).toContainEqual(
      expect.objectContaining({ kind: "status-applied", targetId: "a", statusId: "dazed" }),
    );
    expect(down.foe.combatant.statuses.get("dazed")?.remainingSeconds).toBeGreaterThan(9 - 3);
    const standing = blow(MAULING, () => undefined);
    expect(standing.events).not.toContainEqual(
      expect.objectContaining({ kind: "status-applied", statusId: "dazed" }),
    );
  });
});
