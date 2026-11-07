import { describe, expect, it } from "vitest";

import { KING_OF_THE_HILL_MATCH_RULES } from "../../../match-rules.js";
import { vec2 } from "../../../vec2.js";
import { NO_OBJECTIVES, type BotObjectives } from "../../behaviour.js";
import { ghostId, type HillField } from "../../ghost.js";
import { MatchSimulation, type ParticipantSpec } from "../../simulation.js";
import { askBot, body, BOT, BOUNDS, RULESET } from "./test-support.js";

const FIELD: HillField = {
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
    hillField: FIELD,
    participants,
  });
}

/** Team 0's ghost following `leaderId`. */
function led(sim: MatchSimulation, leaderId: string): void {
  const ghost = sim.get(GHOST);
  if (ghost?.creature === undefined) throw new Error("no ghost");
  ghost.creature.leaderId = leaderId;
}

describe("pick-up-ghost: King of the Hill bots fetch their Ghostly Hero (#2582)", () => {
  // Team 1's ghost at (1500, 400) is the one foe, beyond spell range of team 0's bots.

  it("sends the bot nearest the free ghost for it, the other to escort at the altar", () => {
    const sim = hill([
      body("near", 0, vec2(300, 400), { behaviour: BOT }),
      body("other", 0, vec2(500, 400), { behaviour: BOT }),
    ]);
    expect(askBot(sim, "near", HILL).attackTargetId).toBe(GHOST);
    const escort = askBot(sim, "other", HILL);
    expect(escort.attackTargetId).toBeUndefined();
    expect(escort.moveTo).toEqual(FIELD.altar);
  });

  it("takes the ghost past a human idle at their base, out of reach of it", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(200, 400)),
    ]);
    expect(askBot(sim, "bot", HILL, (id) => id !== "human").attackTargetId).toBe(GHOST);
  });

  it("leaves the ghost to a human teammate within reach of it", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(150, 400)),
    ]);
    const intent = askBot(sim, "bot", HILL, (id) => id !== "human");
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.moveTo).toEqual(FIELD.altar);
  });

  it("never touches a ghost a human leads", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("human", 0, vec2(700, 400)),
    ]);
    led(sim, "human");
    const intent = askBot(sim, "bot", HILL, (id) => id !== "human");
    expect(intent.attackTargetId).toBeUndefined();
  });

  it("leaves the ghost at its post while its team holds the altar", () => {
    const sim = hill([body("bot", 0, vec2(300, 400), { behaviour: BOT })]);
    const intent = askBot(sim, "bot", { ...HILL, altarHolder: 0 });
    expect(intent.attackTargetId).toBeUndefined();
    expect(intent.moveTo).toEqual(FIELD.altar);
  });

  it("leaves the ghost to the fight when a foe is within spell range", () => {
    const sim = hill([
      body("bot", 0, vec2(300, 400), { behaviour: BOT }),
      body("foe", 1, vec2(500, 400)),
    ]);
    const intent = askBot(sim, "bot", HILL);
    expect(intent.attackTargetId).not.toBe(GHOST);
    expect(intent.moveTo).not.toEqual(FIELD.altar);
  });
});
