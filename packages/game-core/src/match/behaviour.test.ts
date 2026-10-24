import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { Behaviour } from "./behaviour.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIREBALL = "elementalist.fireball";

function spec(id: string, team: number, spawn: Vec2, behaviour?: Behaviour): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [FIREBALL],
    attributeRanks: new Map([["elementalist.fire-magic", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    spawn,
    behaviour,
  };
}

function castLoop(extra: Partial<Extract<Behaviour, { kind: "cast-loop" }>> = {}): Behaviour {
  return {
    kind: "cast-loop",
    skillIds: [FIREBALL],
    targeting: { kind: "nearest-enemy" },
    gapSeconds: 0,
    firstLegal: true,
    ...extra,
  };
}

function run(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

describe("idle", () => {
  it("stands still and does nothing", () => {
    const sim = new MatchSimulation({
      seed: "idle",
      participants: [spec("dummy", 1, vec2(0, 0), { kind: "idle" }), spec("p", 0, vec2(200, 0))],
    });
    expect(run(sim, 5)).toEqual([]);
    expect(sim.get("dummy")?.position).toEqual(vec2(0, 0));
  });
});

describe("cast-loop", () => {
  it("casts at the nearest living enemy, through the same rules a player obeys", () => {
    const sim = new MatchSimulation({
      seed: "loop",
      participants: [
        spec("dummy", 1, vec2(0, 0), castLoop()),
        spec("far", 0, vec2(400, 0)),
        spec("near", 0, vec2(150, 0)),
      ],
    });
    const casts = run(sim, 10).filter((entry) => entry.cause === "skill");
    // Fireball recharges in 7 s: one cast at t=0, landing at 1 s, and the
    // next at 7 s, landing at 8 s.
    expect(casts.map((entry) => [entry.sourceId, entry.events[0]])).toEqual([
      ["dummy", { kind: "damage", targetId: "near", amount: 91 }],
      ["dummy", { kind: "damage", targetId: "near", amount: 91 }],
    ]);
  });

  it("obeys canActivate: a dummy with no energy casts nothing", () => {
    const sim = new MatchSimulation({
      seed: "broke",
      ruleset: { ...RULES, resources: { ...RULES.resources, energyRegenPerSecond: 0 } },
      participants: [spec("dummy", 1, vec2(0, 0), castLoop()), spec("p", 0, vec2(150, 0))],
    });
    const dummy = sim.get("dummy");
    if (dummy === undefined) {
      throw new Error("no dummy");
    }
    dummy.combatant.energy = 0;
    expect(run(sim, 10)).toEqual([]);
    expect(dummy.combatant.cast.isCasting).toBe(false);
  });

  // Troll Unguent: 3 s to cast, 10 s recharge. Fireball: 1 s, 7 s. The
  // first cast begins at the end of tick 1, t=0.05; sixty 0.05 s ticks
  // leave a floating-point sliver of it, so it lands one tick later, at 3.1.
  const inOrder = (gapSeconds: number): (string | number | undefined)[][] => {
    const troll = "ranger.troll-unguent";
    const sim = new MatchSimulation({
      seed: "order",
      participants: [
        {
          ...spec(
            "dummy",
            1,
            vec2(0, 0),
            castLoop({ skillIds: [troll, FIREBALL], firstLegal: false, gapSeconds }),
          ),
          skillBar: [troll, FIREBALL],
        },
        spec("p", 0, vec2(150, 0)),
      ],
    });
    return run(sim, 8)
      .filter((entry) => entry.cause === "skill")
      .map((entry) => [entry.skillId, Math.round(entry.atSeconds * 100) / 100]);
  };

  it("takes skills in order without firstLegal, the next one in the tick the last resolves", () => {
    expect(inOrder(0)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 4.1],
    ]);
  });

  it("waits gapSeconds from the start of one cast to the start of the next", () => {
    expect(inOrder(5)).toEqual([
      ["ranger.troll-unguent", 3.1],
      [FIREBALL, 6.1],
    ]);
  });
});
