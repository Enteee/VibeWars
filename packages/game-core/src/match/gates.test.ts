import { describe, expect, it } from "vitest";

import type { Segment } from "../geometry.js";
import { vec2 } from "../vec2.js";
import {
  askBot,
  body,
  BOT,
  BOUNDS,
  DT,
  fighter,
  RANGER,
  RULESET,
} from "./bot/rules/test-support.js";
import { NO_OBJECTIVES } from "./behaviour.js";
import {
  cutShotAtGate,
  GATE_PLATE_REACH_UNITS,
  GATE_REOPEN_SECONDS,
  holdsPlate,
  initialGates,
  stepGate,
  type Gate,
  type GateField,
} from "./gates.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import type { Projectile } from "../skills/projectile.js";

/** A wall right across the map, x = 396 to 404, and its plate on the left. */
const CORNERS = [vec2(396, -10), vec2(404, -10), vec2(404, 810), vec2(396, 810)];
const SEGMENTS: readonly Segment[] = CORNERS.map((a, at) => ({
  a,
  b: CORNERS[(at + 1) % CORNERS.length] ?? a,
}));
const PLATE = vec2(100, 400);
const FIELD: GateField = {
  segments: SEGMENTS,
  opener: { kind: "plate", plate: PLATE, team: null },
  blocks: "all",
};

function closedGate(): Gate {
  const [gate] = initialGates([FIELD]);
  if (gate === undefined) {
    throw new Error("no gate");
  }
  return gate;
}

function arena(participants: readonly ParticipantSpec[], field = FIELD): MatchSimulation {
  return new MatchSimulation({
    seed: "gates",
    ruleset: RULESET,
    bounds: BOUNDS,
    participants,
    gates: [field],
  });
}

function open(sim: MatchSimulation): boolean | undefined {
  return sim.gates[0]?.open;
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
  }
}

const OFF_PLATE = vec2(40, 400);

describe("stepGate (#2691)", () => {
  it("opens while its plate is held, and closes when left", () => {
    const opened = stepGate(closedGate(), true, false, DT);
    expect(opened.open).toBe(true);
    expect(stepGate(opened, true, false, DT).open).toBe(true);
    const closed = stepGate(opened, false, false, DT);
    expect(closed).toMatchObject({ open: false, reopenSeconds: GATE_REOPEN_SECONDS });
  });

  it("refuses to reopen until the wait is over", () => {
    let gate = stepGate(stepGate(closedGate(), true, false, DT), false, false, DT);
    gate = stepGate(gate, true, false, GATE_REOPEN_SECONDS - 1);
    expect(gate.open).toBe(false);
    expect(stepGate(gate, true, false, 1).open).toBe(true);
  });
});

describe("holdsPlate (#2691)", () => {
  it("answers only to its team, within reach", () => {
    const owned: GateField = { ...FIELD, opener: { kind: "plate", plate: PLATE, team: 1 } };
    expect(holdsPlate(owned, 1, PLATE)).toBe(true);
    expect(holdsPlate(owned, 0, PLATE)).toBe(false);
    expect(holdsPlate(FIELD, 0, PLATE)).toBe(true);
    expect(holdsPlate(FIELD, 0, vec2(PLATE.x + GATE_PLATE_REACH_UNITS + 1, PLATE.y))).toBe(false);
  });
});

describe("cutShotAtGate (#2691)", () => {
  const shot = (elapsed: number): Projectile =>
    ({
      from: vec2(300, 400),
      aimPoint: vec2(500, 400),
      obstructed: false,
      speed: 100,
      flightSeconds: 2,
      elapsed,
    }) as Projectile;

  it("stops a shot still short of the gate, on its near side", () => {
    expect(cutShotAtGate(shot(0.5), FIELD)).toMatchObject({
      aimPoint: vec2(395, 400),
      obstructed: true,
      flightSeconds: 0.95,
    });
  });

  it("leaves a shot already past the gate", () => {
    const past = shot(1.5);
    expect(cutShotAtGate(past, FIELD)).toBe(past);
  });
});

describe("gates in a match (#2691)", () => {
  const holder = body("holder", 0, PLATE);
  const foe = body("foe", 1, vec2(1500, 700));

  it("blocks sight while closed: a ranger across it hits nothing until it opens", () => {
    const rangers = [
      fighter("left", 0, RANGER, vec2(300, 400)),
      fighter("right", 1, RANGER, vec2(500, 400)),
    ];
    const hurt = (sim: MatchSimulation): boolean => {
      const { health, maxHealth } = sim.get("right")?.combatant ?? { health: 0, maxHealth: 0 };
      run(sim, 6);
      return (sim.get("right")?.combatant.health ?? 0) < Math.min(health, maxHealth);
    };
    expect(hurt(arena(rangers))).toBe(false);
    expect(hurt(arena([holder, ...rangers]))).toBe(true);
  });

  it("blocks a walk while closed, and lets it through while open", () => {
    const left = vec2(300, 400);
    const right = vec2(500, 400);
    const shut = arena([body("walker", 0, left), foe]);
    shut.walkTo("walker", right);
    run(shut, 3);
    expect(shut.get("walker")?.position.x).toBeLessThan(396);

    const held = arena([holder, body("walker", 0, left), foe]);
    run(held, DT);
    expect(open(held)).toBe(true);
    held.walkTo("walker", right);
    run(held, 3);
    expect(held.get("walker")?.position.x).toBeGreaterThan(450);
  });

  it("closes when the plate is left, and a player back on it waits out the 8 s", () => {
    const sim = arena([holder, foe]);
    run(sim, DT);
    sim.walkTo("holder", OFF_PLATE);
    run(sim, 1.5);
    expect(open(sim)).toBe(false);
    sim.walkTo("holder", PLATE);
    run(sim, 1.5);
    expect(open(sim)).toBe(false);
    run(sim, GATE_REOPEN_SECONDS);
    expect(open(sim)).toBe(true);
  });

  it("moves a body in the doorway to the nearer side when it closes", () => {
    const sim = arena([holder, body("door", 1, vec2(430, 400)), foe]);
    run(sim, DT);
    sim.walkTo("door", vec2(402, 400));
    run(sim, 1);
    expect(sim.get("door")?.position.x).toBeLessThan(404);
    sim.walkTo("holder", OFF_PLATE);
    run(sim, 1.5);
    expect(open(sim)).toBe(false);
    const x = sim.get("door")?.position.x ?? 0;
    expect(x).toBeGreaterThanOrEqual(404 + RULESET.collision.playerRadius);
  });

  it("has a bot walk to its own team's plate, and not to a foe's", () => {
    const sim = arena([body("bot", 0, vec2(300, 400), { behaviour: BOT }), foe]);
    const gate = (team: number): Gate => ({
      ...closedGate(),
      opener: { kind: "plate", plate: PLATE, team },
    });
    const objectives = (team: number) => ({ ...NO_OBJECTIVES, gates: [gate(team)] });
    expect(askBot(sim, "bot", objectives(0)).moveTo).toEqual(PLATE);
    expect(askBot(sim, "bot", objectives(1)).moveTo).not.toEqual(PLATE);
  });

  it("keeps a walk going the long way round when the gate shuts behind its plate (#3031)", () => {
    // A wall down the map with a gap at its foot; the gate shuts its middle.
    const box = (top: number, bottom: number): Segment[] => {
      const corners = [vec2(396, top), vec2(404, top), vec2(404, bottom), vec2(396, bottom)];
      return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
    };
    const plate = vec2(300, 400);
    const sim = new MatchSimulation({
      seed: "gates",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants: [body("walker", 0, plate), foe],
      walls: [...box(-10, 300), ...box(500, 700)],
      gates: [{ ...FIELD, segments: box(300, 500), opener: { kind: "plate", plate, team: null } }],
    });
    run(sim, DT);
    expect(open(sim)).toBe(true);
    sim.walkTo("walker", vec2(600, 400));
    run(sim, 1);
    expect(open(sim)).toBe(false);
    run(sim, 20);
    const walker = sim.get("walker")?.position ?? vec2(0, 0);
    expect(Math.hypot(walker.x - 600, walker.y - 400)).toBeLessThan(5);
  });
});

describe("energy barriers (#3031)", () => {
  /** A barrier no plate opens: a switch's, left closed. */
  const BARRIER: GateField = {
    segments: SEGMENTS,
    opener: { kind: "switch" },
    blocks: "bodies-and-shots",
  };
  const foe = body("foe", 1, vec2(500, 400));
  const hurt = (sim: MatchSimulation): boolean => {
    run(sim, 6);
    const { health, maxHealth } = sim.get("foe")?.combatant ?? { health: 0, maxHealth: 0 };
    return health < maxHealth;
  };

  it("stops an arrow while closed", () => {
    const sim = arena(
      [fighter("ranger", 0, RANGER, vec2(300, 400), { behaviour: undefined }), foe],
      BARRIER,
    );
    expect(sim.requestAttack("ranger", "foe")?.ok).toBe(true);
    let stopped = 0;
    for (let t = 0; t < 6; t += DT) {
      for (const entry of sim.step(DT).log) {
        stopped += entry.events.filter(({ kind }) => kind === "attack-obstructed").length;
      }
    }
    expect(stopped).toBeGreaterThan(0);
    expect(hurt(sim)).toBe(false);
  });

  it("lets a targeted spell through, and the walk stays blocked", () => {
    const sim = arena(
      [
        body("monk", 0, vec2(300, 400), {
          skillBar: ["monk.smite"],
          attributeRanks: new Map([["monk.smiting-prayers", 12]]),
        }),
        foe,
      ],
      BARRIER,
    );
    sim.setTarget("monk", "foe");
    expect(sim.requestSkill("monk", 0)?.check.ok).toBe(true);
    expect(hurt(sim)).toBe(true);
    sim.walkTo("monk", vec2(600, 400));
    run(sim, 3);
    expect(sim.get("monk")?.position.x).toBeLessThan(396);
  });
});
