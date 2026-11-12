import { describe, expect, it } from "vitest";

import type { Polygon, Segment } from "../../../geometry.js";
import { vec2, type Vec2 } from "../../../vec2.js";
import { createCursor, decide, NO_OBJECTIVES, type BotLever } from "../../behaviour.js";
import type { GateField } from "../../gates.js";
import { MatchSimulation, type ParticipantSpec } from "../../simulation.js";
import { switchTargetId, type SwitchField } from "../../switches.js";
import type { TeleportField } from "../../teleports.js";
import levers, { LEVER_SETTLE_SECONDS, LEVER_WORTH_UNITS } from "./levers.js";
import {
  BOT,
  BOUNDS,
  contextFor,
  DT,
  fighter,
  match,
  RANGER,
  RULESET,
  ruleFor,
  WARRIOR,
} from "./test-support.js";

const LEVER_ID = switchTargetId("lever");

/** A lever at `position` winning team 0 `gain`, never flipped. */
function lever(gain: number, position: Vec2 = vec2(300, 400), id = LEVER_ID): BotLever {
  return {
    targetId: id,
    position,
    layer: 0,
    flippedAt: Number.NEGATIVE_INFINITY,
    readyAt: 0,
    gain: [gain, 0],
  };
}

/** What `id` does in `sim` at match second `now`, reading `list` as the map's levers. */
function think(sim: MatchSimulation, id: string, list: readonly BotLever[], now = 10) {
  return levers.decide(
    ruleFor(sim, id, {}, { objectives: { ...NO_OBJECTIVES, levers: list }, now }),
  );
}

describe("levers (#3138)", () => {
  const sim = match([
    fighter("near", 0, WARRIOR, vec2(200, 400)),
    fighter("far", 0, RANGER, vec2(100, 200)),
    fighter("foe", 1, WARRIOR, vec2(1500, 400)),
  ]);

  it("sends the idle bot nearest a lever worth the walk to throw it", () => {
    expect(think(sim, "near", [lever(LEVER_WORTH_UNITS)])?.attackTargetId).toBe(LEVER_ID);
  });

  it("sends only the nearest bot of the team", () => {
    expect(think(sim, "far", [lever(LEVER_WORTH_UNITS)])).toBeUndefined();
    // Nearer to the far one, the lever is the far one's.
    expect(think(sim, "far", [lever(1000, vec2(100, 100))])?.attackTargetId).toBe(LEVER_ID);
    expect(think(sim, "near", [lever(1000, vec2(100, 100))])).toBeUndefined();
  });

  it("never throws a lever that lengthens its way, or wins too little", () => {
    expect(think(sim, "near", [lever(-500)])).toBeUndefined();
    expect(think(sim, "near", [lever(LEVER_WORTH_UNITS - 1)])).toBeUndefined();
    // The foes' gain is not its own.
    expect(think(sim, "near", [{ ...lever(0), gain: [0, 1000] }])).toBeUndefined();
  });

  it("takes the lever worth most", () => {
    const other = switchTargetId("other");
    const list = [lever(400), lever(Number.POSITIVE_INFINITY, vec2(320, 400), other)];
    expect(think(sim, "near", list)?.attackTargetId).toBe(other);
  });

  it("leaves a lever thrown 3 s ago alone, and takes one thrown 7 s ago", () => {
    const thrown = (ago: number): BotLever => ({ ...lever(1000), flippedAt: 10 - ago });
    expect(think(sim, "near", [thrown(3)])).toBeUndefined();
    expect(think(sim, "near", [thrown(LEVER_SETTLE_SECONDS - 0.01)])).toBeUndefined();
    expect(think(sim, "near", [thrown(7)])?.attackTargetId).toBe(LEVER_ID);
  });

  it("leaves a lever still resting alone", () => {
    expect(think(sim, "near", [{ ...lever(1000), readyAt: 10.2 }])).toBeUndefined();
  });

  it("fights a foe in reach first", () => {
    const close = match([
      fighter("near", 0, WARRIOR, vec2(200, 400)),
      fighter("foe", 1, WARRIOR, vec2(400, 400)),
    ]);
    expect(think(close, "near", [lever(1000)])).toBeUndefined();
    const objectives = { ...NO_OBJECTIVES, levers: [lever(1000)] };
    const intent = decide(BOT, createCursor(), contextFor(close, "near", { objectives, now: 10 }));
    expect(intent.attackTargetId).not.toBe(LEVER_ID);
  });
});

/** A wall from (`x`, `top`) down to (`x`, `bottom`), 8 thick. */
function wall(x: number, top: number, bottom: number): Segment[] {
  const corners = [vec2(x - 4, top), vec2(x + 4, top), vec2(x + 4, bottom), vec2(x - 4, bottom)];
  return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
}

function square(centre: Vec2, half: number): Polygon {
  return [
    vec2(centre.x - half, centre.y - half),
    vec2(centre.x + half, centre.y - half),
    vec2(centre.x + half, centre.y + half),
    vec2(centre.x - half, centre.y + half),
  ];
}

/** A lever gate down the middle, in a wall with a way round over the top unless `sealed`. */
function gated(participants: readonly ParticipantSpec[], sealed = false): MatchSimulation {
  const gate: GateField = {
    segments: wall(800, 300, 500),
    opener: { kind: "switch" },
    blocks: "all",
  };
  const throws: SwitchField = {
    id: "lever",
    layer: 0,
    position: vec2(600, 650),
    gates: [0],
    teleports: [],
    decks: [],
    lifts: [],
  };
  return new MatchSimulation({
    seed: "levers",
    ruleset: RULESET,
    bounds: BOUNDS,
    participants,
    walls: [...wall(800, sealed ? -10 : 60, 300), ...wall(800, 500, 810)],
    gates: [gate],
    switches: [throws],
  });
}

function run(sim: MatchSimulation, seconds: number, until: () => boolean = () => false): void {
  for (let t = 0; t < seconds && !until(); t += DT) {
    sim.step(DT);
  }
}

describe("a lever's gain (#3138)", () => {
  const teams = [
    fighter("a", 0, WARRIOR, vec2(200, 650)),
    fighter("b", 1, WARRIOR, vec2(1400, 650)),
  ];

  it("is what opening its gate shortens each team's way by, and nothing for a team that cannot reach it", () => {
    const sim = gated(teams);
    sim.step(DT);
    const [read] = sim.botLevers;
    expect(read).toMatchObject({ targetId: LEVER_ID, flippedAt: Number.NEGATIVE_INFINITY });
    expect(read?.gain[0]).toBeGreaterThan(LEVER_WORTH_UNITS);
    expect(read?.gain[0]).toBeLessThan(Number.POSITIVE_INFINITY);
    // The lever stands on team 0's side; team 1 walks round to it, so it counts for both.
    expect(read?.gain[1]).toBeGreaterThan(LEVER_WORTH_UNITS);
  });

  it("is everything when the gate is the only way, and nothing to a team walled off from the lever", () => {
    const sim = gated(teams, true);
    sim.step(DT);
    expect(sim.botLevers[0]?.gain).toEqual([Number.POSITIVE_INFINITY, 0]);
  });

  it("is negative once its gate is open: throwing it again would close it", () => {
    const sim = gated(teams);
    sim.requestAttack("a", LEVER_ID);
    run(sim, 5, () => sim.gates[0]?.open === true);
    expect(sim.gates[0]?.open).toBe(true);
    sim.step(DT);
    expect(sim.botLevers[0]?.gain[0]).toBeLessThan(0);
    expect(sim.botLevers[0]?.flippedAt).toBeGreaterThan(0);
  });

  it("counts a teleport it turns on, a jump costing nothing", () => {
    const out: TeleportField = {
      id: "out",
      from: { layer: 0, area: square(vec2(300, 400), 30) },
      to: { layer: 0, position: vec2(1300, 400) },
      enabled: false,
    };
    const throws: SwitchField = {
      id: "lever",
      layer: 0,
      position: vec2(200, 700),
      gates: [],
      teleports: [0],
      decks: [],
      lifts: [],
    };
    const sim = new MatchSimulation({
      seed: "levers",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants: [
        fighter("a", 0, WARRIOR, vec2(200, 400)),
        fighter("b", 1, WARRIOR, vec2(1400, 400)),
      ],
      teleports: [out],
      switches: [throws],
    });
    sim.step(DT);
    // 1200 walked, against ~70 to the entry and 100 from the exit.
    expect(sim.botLevers[0]?.gain[0]).toBeGreaterThan(900);
    // Team 1 has no teleport back: its way is the same.
    expect(sim.botLevers[0]?.gain[1]).toBeCloseTo(0);
  });
});

describe("bots and a lever gate (#3138)", () => {
  it("throw it when it is the only way to the foes, and meet them", () => {
    const sim = gated(
      [
        fighter("a", 0, WARRIOR, vec2(200, 650)),
        fighter("a2", 0, RANGER, vec2(150, 600)),
        fighter("b", 1, WARRIOR, vec2(1400, 650)),
        fighter("b2", 1, RANGER, vec2(1450, 600)),
      ],
      true,
    );
    run(sim, 20, () => sim.gates[0]?.open === true);
    expect(sim.gates[0]?.open).toBe(true);
    run(
      sim,
      20,
      () => (sim.get("a")?.position.x ?? 0) > 800 || (sim.get("b")?.position.x ?? 1600) < 800,
    );
    const crossed =
      (sim.get("a")?.position.x ?? 0) > 800 || (sim.get("b")?.position.x ?? 1600) < 800;
    expect(crossed).toBe(true);
  });
});
