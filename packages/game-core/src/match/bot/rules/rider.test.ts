import { describe, expect, it } from "vitest";

import { NO_RANKS } from "../../../skills/status.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import type { MatchSimulation, ParticipantSpec } from "../../simulation.js";
import { BOT, askBot, body, match } from "./test-support.js";

describe("play-build's Paragon riders (#1955)", () => {
  const BOND = "paragon.angelic-bond";
  const GODSPEED = "paragon.godspeed";
  const LEAD = "paragon.lead-the-way";
  const BRACE = "paragon.brace-yourself";
  const paragon = (id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) =>
    body(id, team, spawn, {
      attributeRanks: new Map([
        ["paragon.leadership", 12],
        ["paragon.command", 12],
      ]),
      maxHealth: 500,
      ...extra,
    });
  /** Bot `p` with `bar`, allies `a` and `b` in earshot, and a foe `foeAt` from `a`. */
  const party = (bar: readonly string[], foeAt = 2000) =>
    match([
      paragon("p", 0, vec2(0, 0), { skillBar: [...bar], behaviour: BOT }),
      paragon("a", 0, vec2(100, 0)),
      paragon("b", 0, vec2(0, 100)),
      paragon("foe", 1, vec2(100 + foeAt, 0)),
    ]);
  const bar = [BOND, GODSPEED, LEAD, BRACE];
  const combatant = (sim: MatchSimulation, id: string) => {
    const found = sim.get(id);
    if (found === undefined) throw new Error(`no ${id}`);
    return found.combatant;
  };

  it("holds them all while nothing calls for one", () => {
    expect(askBot(party(bar), "p").useSkillId).toBeUndefined();
  });

  it("bonds the party when an ally in earshot is under a quarter of its Health", () => {
    const sim = party(bar);
    combatant(sim, "a").health = 100;
    expect(askBot(sim, "p")).toMatchObject({ targetId: "p", useSkillId: BOND });
  });

  it("shouts Godspeed for two enchanted allies, and not again while it holds", () => {
    const sim = party(bar);
    combatant(sim, "a").statuses.apply("guardian", 10, "a", NO_RANKS);
    combatant(sim, "b").statuses.apply("guardian", 10, "b", NO_RANKS);
    expect(askBot(sim, "p")).toMatchObject({ targetId: "p", useSkillId: GODSPEED });
    combatant(sim, "p").statuses.apply("godspeed", 17, "p", NO_RANKS);
    expect(askBot(sim, "p").useSkillId).toBeUndefined();
  });

  it("leads the way for an ally on the move, three in earshot", () => {
    const sim = party(bar);
    combatant(sim, "a").moving = true;
    expect(askBot(sim, "p")).toMatchObject({ targetId: "a", useSkillId: LEAD });
  });

  it("leads its own way when it is the one on the move", () => {
    const sim = party(bar);
    combatant(sim, "p").moving = true;
    expect(askBot(sim, "p")).toMatchObject({ targetId: "p", useSkillId: LEAD });
  });

  it("braces an ally with a foe at its elbow", () => {
    expect(askBot(party(bar, 30), "p")).toMatchObject({ targetId: "a", useSkillId: BRACE });
  });
});
