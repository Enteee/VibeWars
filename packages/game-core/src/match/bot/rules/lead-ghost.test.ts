import { describe, expect, it } from "vitest";

import { KING_OF_THE_HILL_MATCH_RULES } from "../../../match-rules.js";
import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import { ghostId, type GhostField } from "../../ghost.js";
import { MatchSimulation, type ParticipantSpec } from "../../simulation.js";
import { askBot, body, BOT, BOUNDS, fighter, MONK, RULESET, WARRIOR } from "./test-support.js";

const FIELD: GhostField = {
  level: 24,
  altar: vec2(800, 400),
  spawns: [
    { team: 0, position: vec2(100, 400) },
    { team: 1, position: vec2(1500, 400) },
  ],
};
const HILL: BotObjectives = { ...NO_OBJECTIVES, altar: FIELD.altar };
const GHOST = ghostId(0);

function hill(participants: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "hill",
    ruleset: RULESET,
    bounds: BOUNDS,
    matchRules: KING_OF_THE_HILL_MATCH_RULES,
    ghostField: FIELD,
    participants,
  });
}

/** Team 0's ghost at `x`, following `leaderId`. */
function ghostAt(sim: MatchSimulation, x: number, leaderId: string | undefined): void {
  const ghost = sim.get(GHOST);
  if (ghost?.creature === undefined) throw new Error("no ghost");
  ghost.position = vec2(x, 400);
  ghost.creature.leaderId = leaderId;
}

describe("lead-ghost: a bot leads its Ghostly Hero onto the altar (#2582)", () => {
  it("walks to the altar with the ghost at its heel, a foe in spell range or not", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    ghostAt(sim, 260, "bot");
    const intent = askBot(sim, "bot", HILL);
    expect(intent.moveTo).toEqual(FIELD.altar);
    expect(intent.attackTargetId).toBeUndefined();
  });

  it("walks a healer leader to the altar, not behind its ally", () => {
    const sim = hill([
      fighter("bot", 0, MONK, vec2(300, 400)),
      fighter("mate", 0, WARRIOR, vec2(300, 1000)),
      fighter("foe", 1, WARRIOR, vec2(500, 400)),
    ]);
    ghostAt(sim, 260, "bot");
    expect(askBot(sim, "bot", HILL).moveTo).toEqual(FIELD.altar);
  });

  it("tells the ghost to stay once it is on the altar", () => {
    const sim = hill([body("bot", 0, vec2(830, 400), { behaviour: BOT })]);
    ghostAt(sim, 790, "bot");
    const intent = askBot(sim, "bot", HILL);
    expect(intent.attackTargetId).toBe(GHOST);
    expect(intent.moveTo).toBeUndefined();
  });

  it("leaves a ghost another teammate leads alone", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(200, 400)),
    ]);
    ghostAt(sim, 790, "human");
    const intent = askBot(sim, "bot", HILL, (id) => id !== "human");
    expect(intent.attackTargetId).toBeUndefined();
  });
});
