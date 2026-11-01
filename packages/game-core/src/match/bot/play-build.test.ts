import { describe, expect, it, vi } from "vitest";

import { ANNIHILATION_MATCH_RULES } from "../../match-rules.js";
import { vec2 } from "../../vec2.js";
import type { CombatLogEntry } from "../combat-log.js";
import { MatchSimulation } from "../simulation.js";
import { NO_RANKS } from "../../skills/status.js";
import {
  BOUNDS,
  DT,
  ELEMENTALIST,
  MONK,
  RANGER,
  RULESET,
  WARRIOR,
  askBot,
  fighter,
  match,
  starter,
} from "./rules/test-support.js";

describe("play-build (#1189)", () => {
  it("asks for at most one skill per think", () => {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400)),
      fighter("foe", 1, ELEMENTALIST, vec2(700, 400)),
    ]);
    const requestSkill = vi.spyOn(sim, "requestSkill");
    const seconds = 10;
    for (let t = 0; t < seconds; t += DT) sim.step(DT);
    const thinks = Math.ceil(seconds / 0.25) + 1;
    const asked = requestSkill.mock.calls.filter(([id]) => id === "ranger").length;
    expect(asked).toBeGreaterThan(0);
    expect(asked).toBeLessThanOrEqual(thinks);
  });

  it("asks for nothing while dead", () => {
    const sim = new MatchSimulation({
      seed: "respawn",
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: { ...ANNIHILATION_MATCH_RULES, deathRule: "respawn", respawnSeconds: 1 },
      participants: [
        fighter("monk", 0, MONK, vec2(400, 400), { maxHealth: 1 }),
        fighter("foe", 1, WARRIOR, vec2(430, 400), { behaviour: undefined }),
        fighter("spare", 0, WARRIOR, vec2(1550, 750), { behaviour: undefined }),
      ],
    });
    sim.requestAttack("foe", "monk");
    let died = false;
    for (let t = 0; t < 10 && !died; t += DT) {
      died = sim
        .step(DT)
        .log.some((entry) =>
          entry.events.some((event) => event.kind === "death" && event.targetId === "monk"),
        );
    }
    expect(died).toBe(true);
    const requestSkill = vi.spyOn(sim, "requestSkill");
    sim.step(DT);
    expect(sim.get("monk")?.combatant.dead).toBe(true);
    expect(requestSkill).not.toHaveBeenCalled();
  });
});

describe("play-build and a well's sacrifice (#1730)", () => {
  const WELL_OF_BLOOD = "necromancer.well-of-blood";

  /** A bot whose only skill is Well of Blood, at `fraction` of its Health, a foe far off. */
  function wellBot(fraction: number, corpse: boolean): MatchSimulation {
    const sim = match([
      fighter("n", 0, MONK, vec2(400, 400), {
        skillBar: [WELL_OF_BLOOD],
        startHealthFraction: fraction,
      }),
      fighter("foe", 1, WARRIOR, vec2(1400, 400), { behaviour: undefined }),
      fighter("fallen", 1, WARRIOR, vec2(450, 400), { behaviour: undefined }),
    ]);
    if (corpse) {
      const fallen = sim.get("fallen")?.combatant;
      if (fallen === undefined) throw new Error("no fallen");
      fallen.statuses.apply("burning", 10, "foe", NO_RANKS);
      fallen.health = 0.2;
      sim.step(DT);
      expect(fallen.dead).toBe(true);
    } else {
      sim.remove("fallen");
    }
    return sim;
  }

  it.each([
    [0.55, false, true],
    [0.4, false, false],
    [0.4, true, true],
  ])("at %d of its Health, a corpse near: %s, uses the well: %s", (fraction, corpse, used) => {
    const sim = wellBot(fraction, corpse);
    expect(askBot(sim, "n").useSkillId === WELL_OF_BLOOD).toBe(used);
  });
});

describe("play-build in a whole match (#1189)", () => {
  /** Every log entry of a 1v1 of two bots, to its end or `seconds`. */
  function duel(seed: string, seconds: number): { log: CombatLogEntry[]; sim: MatchSimulation } {
    const sim = new MatchSimulation({
      seed,
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: ANNIHILATION_MATCH_RULES,
      participants: [
        fighter("warrior", 0, WARRIOR, vec2(400, 400)),
        fighter("necro", 1, starter("Necromancer/Elementalist"), vec2(1000, 400)),
      ],
    });
    const log: CombatLogEntry[] = [];
    for (let t = 0; t < seconds && sim.phase === "active"; t += DT) {
      log.push(...sim.step(DT).log);
    }
    return { log, sim };
  }

  it("plays a 1v1 of two starter builds to its end within 5 minutes", () => {
    const { sim } = duel("duel", 300);
    expect(sim.phase).toBe("finished");
  });

  it("plays the same match from the same seed", () => {
    expect(duel("same", 60).log).toEqual(duel("same", 60).log);
  });

  it("keeps a warrior alive longer with a bot monk beside it", () => {
    function survival(withMonk: boolean): number {
      const participants = [
        // A warrior that does not fight back or heal itself, against a ranger
        // that will not fall: only the monk can keep it up.
        fighter("warrior", 0, WARRIOR, vec2(400, 400), { behaviour: undefined, maxHealth: 150 }),
        fighter("foe", 1, RANGER, vec2(800, 400), { maxHealth: 1e5 }),
      ];
      if (withMonk) participants.push(fighter("monk", 0, MONK, vec2(250, 400)));
      const sim = new MatchSimulation({
        seed: "outlive",
        ruleset: RULESET,
        bounds: BOUNDS,
        matchRules: ANNIHILATION_MATCH_RULES,
        participants,
      });
      let t = 0;
      while (t < 300 && sim.get("warrior")?.combatant.dead === false) {
        sim.step(DT);
        t += DT;
      }
      return t;
    }
    expect(survival(true)).toBeGreaterThan(survival(false));
  });
});
