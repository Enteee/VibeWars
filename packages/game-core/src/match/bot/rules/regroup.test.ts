import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../../../distances.js";
import { distance, vec2 } from "../../../vec2.js";
import { createCursor, decide } from "../../behaviour.js";
import regroup from "./regroup.js";
import { NOTHING, REGROUP_SPREAD } from "./shared.js";
import {
  BOT,
  DT,
  MONK,
  RANGER,
  WARRIOR,
  contextFor,
  fighter,
  match,
  ruleFor,
} from "./test-support.js";

describe("regroup (#2621)", () => {
  /**
   * `w` at `x`, its two mates at `mates`, a foe at `foe`, all on one line:
   * the team's centre is at (x + 2 mates) / 3.
   */
  function rule(x: number, mates: number, foe = 1550, regrouping = false, dead = false) {
    const sim = match([
      fighter("w", 0, WARRIOR, vec2(x, 400)),
      fighter("a", 0, RANGER, vec2(mates, 400)),
      fighter("b", 0, RANGER, vec2(mates, 400)),
      fighter("foe", 1, WARRIOR, vec2(foe, 400)),
    ]);
    if (dead) {
      for (const id of ["a", "b"]) {
        const mate = sim.get(id);
        if (mate === undefined) throw new Error(`no ${id}`);
        mate.combatant.health = 0;
        mate.combatant.dead = true;
      }
    }
    const cursor = { ...createCursor(), regrouping };
    return ruleFor(sim, "w", { cursor });
  }

  it("holds a bot 400 ahead of its team's centre with no foe in reach", () => {
    const view = rule(700, 100);
    expect(regroup.decide(view)).toEqual({ ...NOTHING, targetId: view.self.targetId });
    expect(view.cursor.regrouping).toBe(true);
  });

  it("walks on with a foe in reach", () => {
    const view = rule(700, 100, 1000, true);
    expect(regroup.decide(view)).toBeUndefined();
    expect(view.cursor.regrouping).toBe(false);
  });

  it("never holds a straggler 400 behind its team", () => {
    expect(regroup.decide(rule(300, 900))).toBeUndefined();
  });

  it("does not start to hold 200 from the centre, but keeps holding there once it does", () => {
    expect(regroup.decide(rule(400, 100))).toBeUndefined();
    expect(regroup.decide(rule(400, 100, 1550, true))).not.toBeUndefined();
  });

  it("walks on once within 150 of the centre, and forgets it held", () => {
    const view = rule(310, 100, 1550, true);
    expect(regroup.decide(view)).toBeUndefined();
    expect(view.cursor.regrouping).toBe(false);
  });

  it("never holds the last of its team alive", () => {
    expect(regroup.decide(rule(700, 100, 1550, false, true))).toBeUndefined();
  });

  it("forgets it held once another rule answers, a fight with a foe come into reach", () => {
    const cursor = createCursor();
    /** What `w` at `x`, its mates at 100, does with a foe at `foe`, thinking afresh. */
    const think = (x: number, foe: number) => {
      const sim = match([
        fighter("w", 0, WARRIOR, vec2(x, 400)),
        fighter("a", 0, RANGER, vec2(100, 400)),
        fighter("b", 0, RANGER, vec2(100, 400)),
        fighter("foe", 1, WARRIOR, vec2(foe, 400)),
      ]);
      cursor.waitSeconds = 0;
      return decide(BOT, cursor, contextFor(sim, "w"));
    };
    expect(think(700, 1550).moveTo).toBeUndefined();
    expect(cursor.regrouping).toBe(true);
    expect(think(700, 800).targetId).toBe("foe");
    expect(cursor.regrouping).toBe(false);
    // The foe gone again, 200 ahead of the centre: not far enough to start a wait.
    expect(think(400, 1550).moveTo).toBeDefined();
    expect(cursor.regrouping).toBe(false);
  });

  it("leaves a guard to its post", () => {
    expect(regroup.decide({ ...rule(700, 100), role: undefined })).toBeUndefined();
  });
});

describe("a team of bots with one far ahead (#2621)", () => {
  /**
   * Four bots, one spawned 600 ahead of the rest, walk at three foes who
   * stand still. How far the first of them to come into reach of a foe
   * is from its team's centre, and the tick it does.
   */
  function firstContact(seed: string): { spread: number; tick: number } {
    const sim = match(
      [
        fighter("lead", 0, WARRIOR, vec2(700, 400)),
        fighter("w", 0, WARRIOR, vec2(100, 360)),
        fighter("r", 0, RANGER, vec2(100, 400)),
        fighter("m", 0, MONK, vec2(100, 440)),
        ...[360, 400, 440].map((y, at) =>
          fighter(`foe${String(at)}`, 1, WARRIOR, vec2(1550, y), { behaviour: undefined }),
        ),
      ],
      seed,
    );
    const team = ["lead", "w", "r", "m"].map((id) => {
      const member = sim.get(id);
      if (member === undefined) throw new Error(`no ${id}`);
      return member;
    });
    const foes = [...sim.participants()].filter((each) => each.combatant.team === 1);
    for (let tick = 0; tick < 60 / DT; tick += 1) {
      sim.step(DT);
      const near = team.find((member) =>
        foes.some((foe) => distance(foe.position, member.position) <= RANGE_SPELL),
      );
      if (near !== undefined) {
        const x = team.reduce((sum, member) => sum + member.position.x, 0) / team.length;
        const y = team.reduce((sum, member) => sum + member.position.y, 0) / team.length;
        return { spread: distance(near.position, vec2(x, y)), tick };
      }
    }
    throw new Error("never came into reach");
  }

  it("waits for the rest, so it reaches the foes with its team, the same way for the same seed", () => {
    const first = firstContact("regroup");
    expect(first.spread).toBeLessThanOrEqual(REGROUP_SPREAD);
    expect(firstContact("regroup")).toEqual(first);
  });
});
