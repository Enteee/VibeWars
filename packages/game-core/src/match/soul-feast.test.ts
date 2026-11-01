import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { MatchRules } from "../match-rules.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Corpses and Soul Feast (#466): every dead player or dummy is a corpse,
 * fresh until a skill exploits it, once.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SOUL_FEAST = "necromancer.soul-feast";
const RESTORE_LIFE = "monk.restore-life";
/** Soul Feast's activation and aftercast, and a tick to spare. */
const CAST_SECONDS = 1 + RULES.combat.aftercastSeconds + 2 * DT;
const MAX_HEALTH = 480;

function spec(id: string, team: number, spawn: Vec2, extra?: Partial<ParticipantSpec>) {
  const result: ParticipantSpec = {
    id,
    team,
    skillBar: [SOUL_FEAST, RESTORE_LIFE],
    attributeRanks: new Map([
      ["necromancer.death-magic", 12],
      ["monk.healing-prayers", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    facing: 0,
    maxHealth: MAX_HEALTH,
    maxEnergy: 60,
    ...extra,
  };
  return result;
}

/**
 * Necromancers `n` and `o`, their ally `a` 100 away, foes `x` at 300 and
 * `y` at 500: past Soul Feast's reach.
 */
function match(rules?: MatchRules): MatchSimulation {
  return new MatchSimulation({
    seed: "corpses",
    matchRules: rules,
    participants: [
      spec("n", 0, vec2(0, 0)),
      spec("o", 0, vec2(0, -10)),
      spec("a", 0, vec2(100, 0)),
      spec("x", 1, vec2(300, 0)),
      spec("y", 1, vec2(500, 0)),
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

function stepFor(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

/** Kill `id` as burning would. */
function kill(sim: MatchSimulation, id: string): void {
  const victim = get(sim, id);
  victim.combatant.statuses.apply("burning", 10, "y", NO_RANKS);
  victim.combatant.health = 0.2;
  stepFor(sim, DT);
  expect(victim.combatant.dead).toBe(true);
}

/** `n` casts Soul Feast through to the end. */
function feast(sim: MatchSimulation, caster = "n"): void {
  expect(sim.requestSkill(caster, 0)?.check).toEqual({ ok: true });
  stepFor(sim, CAST_SECONDS);
}

describe("Soul Feast (#466)", () => {
  it("exploits a foe's corpse and steals 234 Health at Death Magic 12", () => {
    const sim = match();
    kill(sim, "x");
    const n = get(sim, "n");
    n.combatant.health = 100;
    feast(sim);
    expect(n.combatant.health).toBe(334);
    expect(get(sim, "x").corpseExploited).toBe(true);
  });

  it("is not a heal: Deep Wound does not cut it, but the maximum caps it", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "a");
    const n = get(sim, "n");
    n.combatant.statuses.apply("deep-wound", 30, "y", NO_RANKS);
    n.combatant.health = 100;
    feast(sim);
    expect(n.combatant.health).toBe(334);
    n.combatant.statuses.clear();
    n.combatant.health = MAX_HEALTH - 10;
    feast(sim);
    expect(n.combatant.health).toBe(MAX_HEALTH);
  });

  it("refuses a second cast with no corpse left, and takes nothing for it", () => {
    const sim = match();
    kill(sim, "x");
    feast(sim);
    const n = get(sim, "n");
    const energy = n.combatant.energy;
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
    stepFor(sim, DT);
    expect(n.combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(n.combatant.cast.activeCast).toBeUndefined();
  });

  it("exploits an ally's corpse too", () => {
    const sim = match();
    kill(sim, "a");
    feast(sim);
    expect(get(sim, "a").corpseExploited).toBe(true);
  });

  it("refuses a corpse past its reach", () => {
    const sim = match();
    kill(sim, "y");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
  });

  it("takes the nearer corpse first, then the other", () => {
    const sim = match();
    kill(sim, "x");
    kill(sim, "a");
    feast(sim);
    expect(get(sim, "a").corpseExploited).toBe(true);
    expect(get(sim, "x").corpseExploited).toBe(false);
    feast(sim);
    expect(get(sim, "x").corpseExploited).toBe(true);
  });

  it("lands with no effect, paid for, when the corpse was used up during the cast", () => {
    const sim = match();
    kill(sim, "x");
    const n = get(sim, "n");
    const o = get(sim, "o");
    n.combatant.health = 100;
    o.combatant.health = 100;
    const energy = o.combatant.energy;
    // Both cast at once; `n` resolves first, in participant order.
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    expect(sim.requestSkill("o", 0)?.check).toEqual({ ok: true });
    stepFor(sim, CAST_SECONDS);
    expect(n.combatant.health).toBe(334);
    expect(o.combatant.health).toBeLessThan(110);
    expect(o.combatant.energy).toBeLessThan(energy);
  });

  it("leaves an exploited ally resurrectable, and fresh again once alive", () => {
    const sim = match();
    kill(sim, "a");
    feast(sim);
    const a = get(sim, "a");
    expect(a.corpseExploited).toBe(true);
    sim.setTarget("o", "a");
    expect(sim.requestSkill("o", 1)?.check).toEqual({ ok: true });
    // Restore Life's 4 s, and the steps it walks in.
    stepFor(sim, 5);
    expect(a.combatant.dead).toBe(false);
    expect(a.corpseExploited).toBe(false);
  });

  it("is gone with a respawn", () => {
    const sim = match({
      victory: "kill-count",
      scoreToWin: 15,
      timeLimitSeconds: 600,
      deathRule: "respawn",
      respawnSeconds: 3,
      deathPenalty: false,
    });
    kill(sim, "a");
    feast(sim);
    const a = get(sim, "a");
    expect(a.corpseExploited).toBe(true);
    stepFor(sim, 3);
    expect(a.combatant.dead).toBe(false);
    expect(a.corpseExploited).toBe(false);
  });

  it("never finds a dead creature", () => {
    const sim = new MatchSimulation({
      seed: "corpses",
      participants: [
        spec("n", 0, vec2(0, 0)),
        spec("m", 1, vec2(100, 0), {
          creature: {
            ownerId: "n",
            kind: "minion",
            look: "bone-minion",
            name: "Bone Minion",
            expiresInSeconds: Number.POSITIVE_INFINITY,
            ageSeconds: 0,
            summonedAtTick: 0,
            skillId: "necromancer.animate-bone-minions",
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
      ],
    });
    get(sim, "m").combatant.health = 0.2;
    get(sim, "m").combatant.statuses.apply("burning", 10, "n", NO_RANKS);
    stepFor(sim, DT);
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
  });

  it("exploits the same corpses on every run with the same seed", () => {
    const run = (): boolean[] => {
      const sim = match();
      kill(sim, "x");
      kill(sim, "a");
      expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
      expect(sim.requestSkill("o", 0)?.check).toEqual({ ok: true });
      stepFor(sim, CAST_SECONDS);
      return ["a", "x"].map((id) => get(sim, id).corpseExploited);
    };
    expect(run()).toEqual([true, true]);
    expect(run()).toEqual(run());
  });
});
