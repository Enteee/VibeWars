import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Pet attacks (#1046 child 2, #1107): the owner pays, and the wolf's
 * next blow within 10 s is the skill, through the one attack-skill path.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CHARM = "ranger.charm-animal";
const COMFORT = "ranger.comfort-animal";
const BRUTAL = "ranger.brutal-strike";
const MAIMING = "ranger.maiming-strike";
const LUNGE = "ranger.disrupting-lunge";
const ROTTING_FLESH = "necromancer.rotting-flesh";
const BAR = [CHARM, COMFORT, BRUTAL, MAIMING, LUNGE];

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

/** Ranger `r` at the origin at Beast Mastery 12 with `bar`, foe `a` 60 off. */
function match(bar: readonly (string | null)[] = BAR, seed = "pet-attacks"): MatchSimulation {
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

/** The wolf's blows in `log`, skill or plain, in order. */
function blows(log: readonly CombatLogEntry[], pet: Participant): CombatLogEntry[] {
  return log.filter(
    (entry) =>
      entry.sourceId === pet.id &&
      entry.events.some(
        (event) =>
          event.kind === "damage" ||
          event.kind === "attack-missed" ||
          event.kind === "attack-blocked",
      ),
  );
}

/** What `entry` dealt `targetId`. */
function dealt(entry: CombatLogEntry | undefined, targetId: string): number {
  return (entry?.events ?? []).reduce(
    (sum, event) =>
      event.kind === "damage" && event.targetId === targetId ? sum + event.amount : sum,
    0,
  );
}

describe("a pet attack arms the wolf's next blow (#1046)", () => {
  /**
   * The wolf's first blow on `a`, with `a` at `fraction` of its Health:
   * armed with `skillId` by its owner, who has `a` selected, or plain,
   * sent at `a` directly. The same seed rolls the same weapon damage.
   */
  function firstBlow(fraction: number, skillId: string | undefined): CombatLogEntry | undefined {
    const sim = match();
    const pet = wolf(sim);
    const foe = get(sim, "a");
    foe.combatant.health = foe.combatant.maxHealth * fraction;
    if (skillId === undefined) {
      expect(sim.requestAttack(pet.id, "a")).toEqual({ ok: true });
    } else {
      sim.setTarget("r", "a");
      expect(press(sim, skillId)?.check).toEqual({ ok: true });
    }
    return blows(stepFor(sim, 4), pet)[0];
  }

  it("Brutal Strike at Beast Mastery 12 adds +29 on a foe at 60%, +58 below 50%", () => {
    for (const [fraction, bonus] of [
      [0.6, 29],
      [0.4, 58],
    ] as const) {
      const armed = firstBlow(fraction, BRUTAL);
      expect(armed).toMatchObject({ cause: "skill", skillId: BRUTAL });
      expect(dealt(armed, "a") - dealt(firstBlow(fraction, undefined), "a")).toBeCloseTo(bonus, 5);
    }
  });

  it("is paid by the owner: energy and recharge, with no cast and no walk", () => {
    const sim = match();
    const owner = get(sim, "r");
    const before = owner.combatant.energy;
    expect(press(sim, BRUTAL)).toEqual({ skillId: BRUTAL, check: { ok: true } });
    expect(owner.combatant.energy).toBe(before - 10);
    expect(owner.combatant.cast.rechargeRemaining.get(BRUTAL)).toBe(5);
    expect(owner.combatant.cast.isCasting).toBe(false);
    expect(owner.combatant.cast.inAftercast).toBe(false);
  });

  it("recharges 33% faster under its owner's Serpent's Quickness (#1539)", () => {
    const sim = match();
    const owner = get(sim, "r");
    owner.combatant.statuses.apply("serpents-quickness", 1000, "r", NO_RANKS);
    expect(press(sim, BRUTAL)?.check).toEqual({ ok: true });
    expect(owner.combatant.cast.rechargeTotal.get(BRUTAL)).toBeCloseTo(5 * 0.67, 9);
  });

  it("Maiming Strike cripples for 13 s", () => {
    const sim = match();
    sim.setTarget("r", "a");
    press(sim, MAIMING);
    const [blow] = blows(stepFor(sim, 4), wolf(sim));
    expect(blow).toMatchObject({ cause: "skill", skillId: MAIMING });
    const crippled = get(sim, "a").combatant.statuses.get("crippled");
    expect(crippled?.remainingSeconds).toBeGreaterThan(13 - 4);
    expect(blow?.events).toContainEqual(
      expect.objectContaining({ kind: "status-applied", targetId: "a", statusId: "crippled" }),
    );
  });

  it("Disrupting Lunge interrupts a foe's skill and disables it 20 s longer", () => {
    const sim = match();
    const foe = get(sim, "a");
    foe.combatant.cast.beginCast(ROTTING_FLESH, "r", 60, undefined);
    sim.setTarget("r", "a");
    press(sim, LUNGE);
    const [blow] = blows(stepFor(sim, 4), wolf(sim));
    expect(blow).toMatchObject({ cause: "skill", skillId: LUNGE });
    expect(foe.combatant.cast.isCasting).toBe(false);
    expect(blow?.events).toContainEqual({
      kind: "skill-disabled",
      targetId: "a",
      skillId: ROTTING_FLESH,
      seconds: 20,
    });
  });

  it("is used mid-cast and mid-swing: the owner's cast and swing timer go on", () => {
    const sim = match();
    const owner = get(sim, "r");
    expect(sim.requestAttack("r", "a")).toEqual({ ok: true });
    stepFor(sim, 1);
    const swingElapsed = owner.combatant.attack?.swingElapsed;
    expect(swingElapsed).toBeGreaterThan(0);
    expect(press(sim, BRUTAL)?.check).toEqual({ ok: true });
    expect(owner.combatant.attack?.swingElapsed).toBe(swingElapsed);

    expect(press(sim, COMFORT)?.check).toEqual({ ok: true });
    expect(owner.combatant.cast.isCasting).toBe(true);
    expect(press(sim, MAIMING)?.check).toEqual({ ok: true });
    expect(owner.combatant.cast.activeCast?.skillId).toBe(COMFORT);
  });

  it("a second press replaces the first, and both are paid", () => {
    const sim = match();
    const owner = get(sim, "r");
    const before = owner.combatant.energy;
    sim.setTarget("r", "a");
    press(sim, BRUTAL);
    press(sim, MAIMING);
    expect(owner.combatant.energy).toBe(before - 20);
    const [first, second] = blows(stepFor(sim, 5), wolf(sim));
    expect(first).toMatchObject({ cause: "skill", skillId: MAIMING });
    expect(second?.cause).toBe("weapon");
  });

  it("lapses after 10 s with no blow: the next one is plain", () => {
    const sim = match();
    const pet = wolf(sim);
    press(sim, BRUTAL);
    stepFor(sim, 10);
    expect(pet.combatant.attack).toBeUndefined();
    sim.requestAttack("r", "a");
    const [blow] = blows(stepFor(sim, 4), pet);
    expect(blow?.cause).toBe("weapon");
  });

  it("is used up by a blind miss", () => {
    const sim = match();
    const pet = wolf(sim);
    pet.combatant.statuses.apply("blind", 30, "a", NO_RANKS);
    sim.setTarget("r", "a");
    press(sim, BRUTAL);
    const [first, second] = blows(stepFor(sim, 5), pet);
    expect(first).toMatchObject({ cause: "skill", skillId: BRUTAL });
    expect(first?.events).toContainEqual({ kind: "attack-missed", targetId: "a" });
    expect(second?.cause).toBe("weapon");
  });

  it("sends the wolf at the owner's selected foe; with none it stays", () => {
    const sent = match();
    sent.setTarget("r", "a");
    press(sent, BRUTAL);
    expect(wolf(sent).combatant.attack?.targetId).toBe("a");

    const idle = match();
    press(idle, BRUTAL);
    stepFor(idle, 3);
    expect(wolf(idle).combatant.attack).toBeUndefined();
  });

  it("is the same in two runs with one seed", () => {
    const run = (): CombatLogEntry[] => {
      const sim = match();
      sim.setTarget("r", "a");
      press(sim, BRUTAL);
      return stepFor(sim, 6);
    };
    expect(run()).toEqual(run());
  });
});

describe("a pet attack refused costs nothing (#1046)", () => {
  function refused(sim: MatchSimulation, reason: string): void {
    const owner = get(sim, "r");
    const before = owner.combatant.energy;
    expect(press(sim, BRUTAL)?.check).toEqual({ ok: false, reason });
    expect(owner.combatant.energy).toBe(before);
    expect(owner.combatant.cast.rechargeRemaining.get(BRUTAL) ?? 0).toBe(0);
  }

  it("with no pet", () => {
    refused(match([BRUTAL]), "no-companion");
  });

  it("with a dead pet, once its death's disable is over", () => {
    const sim = match();
    const pet = wolf(sim);
    pet.combatant.statuses.apply("burning", 10, "a", NO_RANKS);
    pet.combatant.health = 0.2;
    stepFor(sim, 5);
    expect(pet.combatant.dead).toBe(true);
    refused(sim, "companion-dead");
  });

  it("with the pet 351 from its owner, who is not walked in", () => {
    const sim = match();
    wolf(sim).position = vec2(-351, 0);
    refused(sim, "companion-too-far");
    expect(get(sim, "r").walkGoal).toBeUndefined();
  });
});
