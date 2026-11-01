import { describe, expect, it } from "vitest";

import { AREA_EARSHOT } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { applyEffect, type CombatEvent } from "../skills/effects.js";
import { distance, vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The resurrection skills (#474): Resurrection Signet, spent until a
 * morale boost; Rebirth, which brings the ally to you; Signet of Return,
 * which grows with the party in earshot; and Flesh of My Flesh, which
 * trades half your health.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
/** The dead stay down long enough for every test here. */
const MATCH: MatchRules = {
  victory: "kill-count",
  scoreToWin: 15,
  timeLimitSeconds: 600,
  deathRule: "respawn",
  respawnSeconds: 60,
  deathPenalty: false,
};
const RES_SIGNET = "common.resurrection-signet";
const REBIRTH = "monk.rebirth";
const SIGNET_OF_RETURN = "paragon.signet-of-return";
const FLESH = "ritualist.flesh-of-my-flesh";
/** A cast of `seconds`, and a tick to spare. */
const cast = (seconds: number): number => seconds + DT;

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return {
    id,
    team,
    skillBar: [RES_SIGNET, REBIRTH, SIGNET_OF_RETURN, FLESH],
    attributeRanks: new Map([
      ["monk.protection-prayers", 12],
      ["paragon.leadership", 12],
      ["ritualist.restoration-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: 480,
    maxEnergy: 30,
    ...extra,
  } satisfies ParticipantSpec;
}

/** Caster `m`, the corpses-to-be `w` and `v` 200 off, and a foe far away. */
function match(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "rez",
    matchRules: MATCH,
    participants: [
      spec("m", 0, vec2(0, 0)),
      spec("w", 0, vec2(200, 0)),
      spec("v", 0, vec2(200, 60)),
      spec("foe", 1, vec2(3000, 0)),
      ...more,
    ],
  });
}

function get(sim: MatchSimulation, id: string) {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatEvent[] {
  const events: CombatEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    for (const entry of sim.step(DT).log) {
      events.push(...entry.events);
    }
  }
  return events;
}

/** Kill `id` as burning would, so its respawn timer starts. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "foe", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `casterId` uses its bar's `slot` on `targetId`, which must be allowed. */
function use(sim: MatchSimulation, casterId: string, slot: number, targetId: string): void {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
}

const resurrections = (events: readonly CombatEvent[]) =>
  events.filter((event) => event.kind === "resurrected");

describe("Resurrection Signet (#474)", () => {
  it("returns the ally with 100% health and 25% energy, then stays spent past any time", () => {
    const sim = match();
    kill(sim, "w");
    kill(sim, "v");
    use(sim, "m", 0, "w");
    const events = stepFor(sim, cast(3));

    expect(resurrections(events)).toEqual([
      { kind: "resurrected", targetId: "w", healthFraction: 1, energyFraction: 0.25 },
    ]);
    expect(get(sim, "w").combatant.health).toBe(480);
    const caster = get(sim, "m").combatant;
    expect([...caster.cast.spent]).toEqual([RES_SIGNET]);
    expect(caster.cast.rechargeRemaining.get(RES_SIGNET)).toBeUndefined();

    stepFor(sim, 30);
    sim.setTarget("m", "v");
    expect(sim.requestSkill("m", 0)?.check).toEqual({
      ok: false,
      reason: "spent-until-morale-boost",
    });
  });

  it("is spent when interrupted, and not when cancelled", () => {
    const sim = match();
    kill(sim, "w");
    const caster = get(sim, "m").combatant;

    use(sim, "m", 0, "w");
    stepFor(sim, 1);
    sim.cancelAction("m");
    expect(caster.cast.spent.size).toBe(0);

    use(sim, "m", 0, "w");
    stepFor(sim, 1);
    const foe = get(sim, "foe").combatant;
    const context = {
      caster: foe,
      target: caster,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    };
    expect(applyEffect({ kind: "interrupt" }, context).map((event) => event.kind)).toEqual([
      "interrupted",
    ]);
    expect([...caster.cast.spent]).toEqual([RES_SIGNET]);
  });

  it("is readied by a morale boost to its team, at +10% and while dead too", () => {
    const sim = match();
    kill(sim, "w");
    kill(sim, "v");
    const caster = get(sim, "m").combatant;
    use(sim, "m", 0, "w");
    stepFor(sim, cast(3));

    sim.moraleBoost(1, 2);
    expect(caster.cast.spent.size).toBe(1);
    sim.moraleBoost(0, 10);
    sim.moraleBoost(0, 10);
    expect(caster.morale).toBe(10);
    expect(caster.cast.spent.size).toBe(0);

    // Past the first one's aftercast, so this one is not queued behind it.
    stepFor(sim, 1);
    use(sim, "m", 0, "v");
    stepFor(sim, cast(3));
    expect(caster.cast.spent.size).toBe(1);
    kill(sim, "m");
    sim.moraleBoost(0, 2);
    expect(caster.cast.spent.size).toBe(0);
  });

  it("is readied by a reset, and not by a respawn", () => {
    const sim = match();
    kill(sim, "w");
    const caster = get(sim, "m").combatant;
    use(sim, "m", 0, "w");
    stepFor(sim, cast(3));

    kill(sim, "m");
    stepFor(sim, MATCH.respawnSeconds + 1);
    expect(caster.dead).toBe(false);
    expect(caster.cast.spent.size).toBe(1);

    sim.resetParticipant("m");
    expect(caster.cast.spent.size).toBe(0);
  });
});

describe("Rebirth (#474)", () => {
  it("returns the ally at 25% and no energy beside the caster, its bar disabled, the caster empty", () => {
    const sim = match();
    kill(sim, "w");
    const ally = get(sim, "w");
    use(sim, "m", 1, "w");
    const events = stepFor(sim, cast(5));
    const caster = get(sim, "m");

    expect(resurrections(events)).toEqual([
      { kind: "resurrected", targetId: "w", healthFraction: 0.25, energyFraction: 0 },
    ]);
    expect(ally.combatant.health).toBe(120);
    expect(ally.combatant.energy).toBeLessThan(1);
    expect(events).toContainEqual({ kind: "teleported", targetId: "w", toId: "m" });
    expect(distance(ally.position, caster.position)).toBeCloseTo(
      2 * RULES.collision.playerRadius,
      5,
    );
    expect(
      events.filter((event) => event.kind === "skill-disabled" && event.targetId === "w"),
    ).toEqual(
      [RES_SIGNET, REBIRTH, SIGNET_OF_RETURN, FLESH].map((skillId) => ({
        kind: "skill-disabled",
        targetId: "w",
        skillId,
        seconds: 4,
      })),
    );
    expect(caster.combatant.energy).toBeLessThan(1);
    expect(events).toContainEqual({ kind: "energy-loss", targetId: "m", amount: 20 });
  });

  it("drains the caster but neither disables nor moves an ally another res reached first", () => {
    const sim = match(spec("n", 0, vec2(0, 60)));
    kill(sim, "w");
    const ally = get(sim, "w");
    const fell = ally.position;
    use(sim, "m", 1, "w");
    use(sim, "n", 0, "w");
    const events = stepFor(sim, cast(5));

    expect(resurrections(events).map((event) => event.targetId)).toEqual(["w"]);
    expect(events.some((event) => event.kind === "skill-disabled")).toBe(false);
    expect(events.some((event) => event.kind === "teleported")).toBe(false);
    expect(ally.position).toEqual(fell);
    expect(events).toContainEqual({ kind: "energy-loss", targetId: "m", amount: 20 });
  });
});

describe("Signet of Return (#474)", () => {
  it("gives 13% health and 3% energy alone, the caster being a party member", () => {
    const sim = match();
    kill(sim, "w");
    kill(sim, "v");
    use(sim, "m", 2, "w");
    const [resurrected] = resurrections(stepFor(sim, cast(5)));
    expect(resurrected?.healthFraction).toBeCloseTo(0.13, 10);
    expect(resurrected?.energyFraction).toBeCloseTo(0.03, 10);
  });

  it("counts each living ally in earshot, and no creature, corpse or ally beyond it", () => {
    const sim = match(
      spec("a", 0, vec2(0, 100)),
      spec("b", 0, vec2(0, -AREA_EARSHOT + 1)),
      spec("far", 0, vec2(-AREA_EARSHOT - 50, 0)),
      spec("minion", 0, vec2(0, 30), {
        creature: {
          ownerId: "m",
          kind: "minion",
          look: "bone-minion",
          name: "Bone Minion",
          expiresInSeconds: Infinity,
          ageSeconds: 0,
          summonedAtTick: 0,
          skillId: "test.bone-minion",
          aura: undefined,
          onDeath: "vanish",
          ownerDisableSeconds: 0,
          deathBurst: undefined,
          onDeathInRange: undefined,
          replacedBy: undefined,
          corpsesLeft: 0,
          companionSkillId: undefined,
          leaderId: undefined,
          mode: "guard",
        },
      }),
    );
    kill(sim, "w");
    kill(sim, "v");
    use(sim, "m", 2, "w");
    const [resurrected] = resurrections(stepFor(sim, cast(5)));
    expect(resurrected?.healthFraction).toBeCloseTo(0.39, 10);
    expect(resurrected?.energyFraction).toBeCloseTo(0.09, 10);
  });

  it("caps each share at 100%", () => {
    const allies = Array.from({ length: 9 }, (_, i) => spec(`a${String(i)}`, 0, vec2(-20 * i, 40)));
    const sim = match(...allies);
    kill(sim, "w");
    use(sim, "m", 2, "w");
    const [resurrected] = resurrections(stepFor(sim, cast(5)));
    // The caster, `v` and nine allies: 11 shares of 13%.
    expect(resurrected?.healthFraction).toBe(1);
    expect(resurrected?.energyFraction).toBeCloseTo(0.33, 10);
  });
});

describe("Flesh of My Flesh (#474)", () => {
  it("costs the caster half its health and returns the ally with what is left", () => {
    const sim = match(spec("r", 0, vec2(0, 40), { maxHealth: 400 }));
    kill(sim, "w");
    use(sim, "r", 3, "w");
    const events = stepFor(sim, cast(4));

    expect(events).toContainEqual({ kind: "sacrifice", targetId: "r", amount: 200 });
    expect(get(sim, "w").combatant.health).toBeCloseTo(200, 0);
    expect(resurrections(events)[0]?.energyFraction).toBeCloseTo(0.17, 10);
  });

  it("gives at most the ally's own maximum", () => {
    const sim = match(spec("big", 0, vec2(0, 40), { maxHealth: 1200 }));
    kill(sim, "w");
    use(sim, "big", 3, "w");
    const events = stepFor(sim, cast(4));
    expect(get(sim, "big").combatant.health).toBeCloseTo(600, 0);
    expect(get(sim, "w").combatant.health).toBe(480);
    expect(resurrections(events)[0]?.healthFraction).toBe(1);
  });

  it("takes nothing when the ally is already up", () => {
    const sim = match(spec("n", 0, vec2(0, 60)));
    kill(sim, "w");
    use(sim, "m", 3, "w");
    use(sim, "n", 0, "w");
    const events = stepFor(sim, cast(4));
    expect(resurrections(events).map((event) => event.targetId)).toEqual(["w"]);
    expect(events.some((event) => event.kind === "sacrifice")).toBe(false);
  });
});
