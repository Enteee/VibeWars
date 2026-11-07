import { describe, expect, it, vi } from "vitest";

import { ANNIHILATION_MATCH_RULES, KING_OF_THE_HILL_MATCH_RULES } from "../../match-rules.js";
import { vec2, type Vec2 } from "../../vec2.js";
import {
  BOT_REACTION,
  createCursor,
  decide,
  INSTANT_REACTION,
  NO_OBJECTIVES,
  type Behaviour,
  type BehaviourContext,
  type BehaviourIntent,
  type Reaction,
} from "../behaviour.js";
import type { CombatLogEntry } from "../combat-log.js";
import { ghostId, type HillField } from "../ghost.js";
import { MatchSimulation } from "../simulation.js";
import { NO_RANKS } from "../../skills/status.js";
import {
  BOT,
  BOUNDS,
  DT,
  ELEMENTALIST,
  MONK,
  RANGER,
  RULESET,
  WARRIOR,
  askBot,
  contextFor,
  fighter,
  match,
  starter,
} from "./rules/test-support.js";
import { reactionSeconds } from "./rules/shared.js";

describe("play-build's target in King of the Hill (#2600)", () => {
  const ALTAR = vec2(800, 400);
  const FOE_GHOST = ghostId(1);

  /** Team 1's ghost rising at `foeGhostAt`, a bot of team 0 and a badly hurt foe player in its range. */
  function hill(foeGhostAt: Vec2) {
    const field: HillField = {
      altar: ALTAR,
      spawns: [
        { team: 0, position: vec2(100, 400) },
        { team: 1, position: foeGhostAt },
      ],
    };
    return new MatchSimulation({
      seed: "hill",
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      hillField: field,
      participants: [
        fighter("bot", 0, ELEMENTALIST, vec2(600, 400)),
        fighter("foe", 1, WARRIOR, vec2(650, 500), {
          behaviour: undefined,
          startHealthFraction: 0.3,
        }),
      ],
    });
  }

  const targetOf = (sim: MatchSimulation, extra: Partial<BehaviourContext> = {}) =>
    decide(
      BOT,
      createCursor(),
      contextFor(sim, "bot", { objectives: { ...NO_OBJECTIVES, altar: ALTAR }, ...extra }),
    ).targetId;

  it("kills the foe's ghost on an altar nobody holds before a foe player about to fall", () => {
    expect(targetOf(hill(vec2(820, 400)))).toBe(FOE_GHOST);
  });

  it("kills the foe's ghost holding the altar", () => {
    expect(
      targetOf(hill(vec2(820, 400)), {
        objectives: { ...NO_OBJECTIVES, altar: ALTAR, altarHolder: 1 },
      }),
    ).toBe(FOE_GHOST);
  });

  it("fights as ever while its team holds the altar", () => {
    expect(
      targetOf(hill(vec2(820, 400)), {
        objectives: { ...NO_OBJECTIVES, altar: ALTAR, altarHolder: 0 },
      }),
    ).toBe("foe");
  });

  it("fights as ever while the foe's ghost is off the altar, though in range", () => {
    expect(targetOf(hill(vec2(700, 300)))).toBe("foe");
  });

  it("leaves a ghost on the altar beyond spell range alone", () => {
    const sim = new MatchSimulation({
      seed: "hill",
      ruleset: RULESET,
      bounds: BOUNDS,
      matchRules: KING_OF_THE_HILL_MATCH_RULES,
      hillField: {
        altar: vec2(1300, 400),
        spawns: [
          { team: 0, position: vec2(100, 400) },
          { team: 1, position: vec2(1300, 400) },
        ],
      },
      participants: [
        fighter("bot", 0, ELEMENTALIST, vec2(600, 400)),
        fighter("foe", 1, WARRIOR, vec2(650, 500), {
          behaviour: undefined,
          startHealthFraction: 0.3,
        }),
      ],
    });
    expect(
      decide(
        BOT,
        createCursor(),
        contextFor(sim, "bot", { objectives: { ...NO_OBJECTIVES, altar: vec2(1300, 400) } }),
      ).targetId,
    ).toBe("foe");
  });

  it("keeps a target its team called", () => {
    expect(targetOf(hill(vec2(820, 400)), { calledTargetId: "foe" })).toBe("foe");
  });
});

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

describe("play-build's reaction time (#2606)", () => {
  /** The ticks at which a lone ranger, asked every tick, makes a new decision; and its moves. */
  function decisions(reaction: Reaction, ticks: number) {
    const sim = match([
      fighter("ranger", 0, RANGER, vec2(400, 400)),
      fighter("foe", 1, WARRIOR, vec2(1200, 400), { behaviour: undefined }),
    ]);
    const behaviour: Behaviour = { kind: "play-build", reaction };
    const cursor = createCursor();
    const at: number[] = [];
    const moves: Pick<BehaviourIntent, "moveDirection" | "moveTo">[] = [];
    for (let tick = 0; tick < ticks; tick += 1) {
      const thinks = cursor.thinks;
      const { moveDirection, moveTo } = decide(behaviour, cursor, contextFor(sim, "ranger"));
      moves.push({ moveDirection, moveTo });
      if (cursor.thinks > thinks) at.push(tick);
    }
    return { at, moves };
  }

  it("decides at once, then holds each decision 0.15-0.4 s, its move with it", () => {
    const { at, moves } = decisions(BOT_REACTION, 200);
    expect(at[0]).toBe(0);
    expect(moves.some((move) => move.moveTo !== undefined || move.moveDirection.x !== 0)).toBe(
      true,
    );
    expect(at.length).toBeGreaterThan(20);
    for (let index = 1; index < at.length; index += 1) {
      const [from, to] = [at[index - 1] ?? 0, at[index] ?? 0];
      expect((to - from) * DT).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect((to - from) * DT).toBeLessThanOrEqual(0.4 + 1e-9);
      for (let tick = from + 1; tick < to; tick += 1) expect(moves[tick]).toEqual(moves[from]);
    }
  });

  it("decides every tick with no reaction time", () => {
    const { at } = decisions(INSTANT_REACTION, 20);
    expect(at).toEqual([...Array(20).keys()]);
  });

  it("draws the same time from the same bot and decision, 0.15-0.4 s and about 0.275 on average", () => {
    expect(reactionSeconds(BOT_REACTION, 1, "bot-a", 3)).toBe(
      reactionSeconds(BOT_REACTION, 1, "bot-a", 3),
    );
    expect(reactionSeconds(BOT_REACTION, 1, "bot-a", 3)).not.toBe(
      reactionSeconds(BOT_REACTION, 1, "bot-b", 3),
    );
    // Another match, another draw (#2624): no id is the quicker in every match.
    expect(reactionSeconds(BOT_REACTION, 1, "bot-a", 3)).not.toBe(
      reactionSeconds(BOT_REACTION, 2, "bot-a", 3),
    );
    let sum = 0;
    for (let thinks = 0; thinks < 1000; thinks += 1) {
      const seconds = reactionSeconds(BOT_REACTION, 1, "bot-a", thinks);
      expect(seconds).toBeGreaterThanOrEqual(0.15);
      expect(seconds).toBeLessThan(0.4);
      sum += seconds;
    }
    expect(sum / 1000).toBeGreaterThan(0.25);
    expect(sum / 1000).toBeLessThan(0.3);
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
