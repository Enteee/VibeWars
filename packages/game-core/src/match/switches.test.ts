import { describe, expect, it } from "vitest";

import type { Segment } from "../geometry.js";
import { vec2, type Vec2 } from "../vec2.js";
import { body, BOUNDS, DT, RULESET } from "./bot/rules/test-support.js";
import { stepGate, initialGates, type GateField } from "./gates.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import {
  flipSwitch,
  initialSwitches,
  SWITCH_COOLDOWN_SECONDS,
  switchIdOf,
  switchTargetId,
  type SwitchField,
} from "./switches.js";

/** A wall right across the map at `x`, 8 thick. */
function across(x: number): readonly Segment[] {
  const corners = [vec2(x - 4, -10), vec2(x + 4, -10), vec2(x + 4, 810), vec2(x - 4, 810)];
  return corners.map((a, at) => ({ a, b: corners[(at + 1) % corners.length] ?? a }));
}

const WEST: GateField = { segments: across(400), opener: { kind: "switch" }, blocks: "all" };
const EAST: GateField = { segments: across(1000), opener: { kind: "switch" }, blocks: "all" };
const LEVER_AT = vec2(200, 400);
const LEVER: SwitchField = {
  id: "lever",
  layer: 0,
  position: LEVER_AT,
  gates: [0],
  teleports: [],
  decks: [],
};
const LEVER_ID = switchTargetId("lever");

function lever(): ReturnType<typeof initialSwitches>[number] {
  const [first] = initialSwitches([LEVER]);
  if (first === undefined) {
    throw new Error("no switch");
  }
  return first;
}

describe("flipSwitch (#3025)", () => {
  it("starts up, and each flip turns it", () => {
    const start = lever();
    expect(start).toMatchObject({ up: true, readyAt: 0 });
    const down = flipSwitch(start, 1);
    expect(down).toMatchObject({ up: false, readyAt: 1 + SWITCH_COOLDOWN_SECONDS });
    expect(flipSwitch(down, 1 + SWITCH_COOLDOWN_SECONDS).up).toBe(true);
  });

  it("rests for its cooldown: a flip in it leaves the very same lever", () => {
    const down = flipSwitch(lever(), 1);
    expect(flipSwitch(down, 1 + SWITCH_COOLDOWN_SECONDS - DT)).toBe(down);
  });

  it("names its target id with the switch- prefix, and reads it back", () => {
    expect(LEVER_ID).toBe("switch-lever");
    expect(switchIdOf(LEVER_ID)).toBe("lever");
    expect(switchIdOf("flag/0")).toBeUndefined();
  });
});

describe("stepGate on a switch's gate (#3025)", () => {
  it("is latched: no plate holds it, and only a flip toggles it", () => {
    const [gate] = initialGates([WEST]);
    if (gate === undefined) throw new Error("no gate");
    expect(stepGate(gate, true, false, DT)).toBe(gate);
    const opened = stepGate(gate, false, true, DT);
    expect(opened.open).toBe(true);
    expect(stepGate(opened, false, false, 60).open).toBe(true);
    expect(stepGate(opened, false, true, DT).open).toBe(false);
  });
});

describe("switches in a match (#3025)", () => {
  const foe = body("foe", 1, vec2(1500, 700));

  function arena(
    participants: readonly ParticipantSpec[],
    switches: readonly SwitchField[] = [LEVER],
  ): MatchSimulation {
    return new MatchSimulation({
      seed: "switches",
      ruleset: RULESET,
      bounds: BOUNDS,
      participants,
      gates: [WEST, EAST],
      switches,
    });
  }

  function run(sim: MatchSimulation, seconds: number): void {
    for (let t = 0; t < seconds; t += DT) {
      sim.step(DT);
    }
  }

  const open = (sim: MatchSimulation): (boolean | undefined)[] => sim.gates.map((g) => g.open);

  it("opens its gate when a body walks to it, and a second body walks through", () => {
    const sim = arena([body("puller", 0, vec2(100, 300)), body("walker", 0, vec2(300, 500)), foe]);
    expect(sim.requestAttack("puller", LEVER_ID)).toEqual({ ok: true });
    run(sim, 2);
    expect(open(sim)).toEqual([true, false]);
    expect(sim.switches[0]?.up).toBe(false);
    sim.walkTo("walker", vec2(600, 500));
    run(sim, 3);
    expect(sim.get("walker")?.position.x).toBeGreaterThan(550);
  });

  it("toggles every gate it names: an open one closes and a closed one opens", () => {
    const both: SwitchField = { ...LEVER, gates: [0, 1] };
    const sim = arena([body("puller", 0, vec2(100, 300)), foe], [both]);
    sim.requestAttack("puller", LEVER_ID);
    run(sim, 2);
    expect(open(sim)).toEqual([true, true]);
    run(sim, SWITCH_COOLDOWN_SECONDS);
    sim.requestAttack("puller", LEVER_ID);
    run(sim, DT * 3);
    expect(open(sim)).toEqual([false, false]);
  });

  it("ignores an arrival in its rest, silently", () => {
    const sim = arena([body("puller", 0, vec2(100, 300)), foe]);
    sim.requestAttack("puller", LEVER_ID);
    for (let tick = 0; tick < 2 / DT && open(sim)[0] !== true; tick++) {
      sim.step(DT);
    }
    expect(open(sim)).toEqual([true, false]);
    // Standing at it the tick after the flip: the order lands in the rest.
    expect(sim.requestAttack("puller", LEVER_ID)).toEqual({ ok: true });
    run(sim, DT * 3);
    expect(open(sim)).toEqual([true, false]);
    expect(sim.switches[0]?.up).toBe(false);
  });

  it("flips again 0.5 s after its last flip, not before (#3054)", () => {
    expect(SWITCH_COOLDOWN_SECONDS).toBe(0.5);
    const down = flipSwitch(lever(), 1);
    expect(flipSwitch(down, 1.5 - DT)).toBe(down);
    expect(flipSwitch(down, 1.5).up).toBe(true);
  });

  it("closes its gate with no walk when one standing at it orders again after the rest (#3054)", () => {
    const sim = arena([body("puller", 0, vec2(100, 300)), foe]);
    sim.requestAttack("puller", LEVER_ID);
    run(sim, 2);
    expect(open(sim)).toEqual([true, false]);
    const at = sim.get("puller")?.position;
    run(sim, SWITCH_COOLDOWN_SECONDS);
    sim.requestAttack("puller", LEVER_ID);
    sim.step(DT);
    expect(open(sim)).toEqual([false, false]);
    expect(sim.switches[0]?.up).toBe(true);
    expect(sim.get("puller")?.position).toEqual(at);
  });

  it("flips once when two arrive on one tick (#3054)", () => {
    const sim = arena([body("one", 0, vec2(190, 400)), body("two", 0, vec2(210, 400)), foe]);
    sim.requestAttack("one", LEVER_ID);
    sim.requestAttack("two", LEVER_ID);
    sim.step(DT);
    expect(open(sim)).toEqual([true, false]);
    expect(sim.switches[0]?.up).toBe(false);
  });

  it("refuses the dead, and a switch the map does not have", () => {
    const sim = arena([body("puller", 0, LEVER_AT), foe]);
    expect(sim.requestAttack("puller", switchTargetId("nowhere"))).toEqual({
      ok: false,
      reason: "no-target",
    });
    const puller = sim.get("puller");
    if (puller === undefined) throw new Error("no puller");
    puller.combatant.dead = true;
    expect(sim.requestAttack("puller", LEVER_ID)).toEqual({ ok: false, reason: "caster-dead" });
  });

  it("moves a body standing in the doorway when its flip closes the gate", () => {
    const sim = arena([body("puller", 0, vec2(100, 300)), body("door", 1, vec2(430, 400)), foe]);
    sim.requestAttack("puller", LEVER_ID);
    run(sim, 2);
    sim.walkTo("door", vec2(402, 400));
    run(sim, SWITCH_COOLDOWN_SECONDS);
    sim.requestAttack("puller", LEVER_ID);
    run(sim, DT * 3);
    expect(open(sim)).toEqual([false, false]);
    const x: Vec2 | undefined = sim.get("door")?.position;
    expect(Math.abs((x?.x ?? 400) - 400)).toBeGreaterThanOrEqual(
      4 + RULESET.collision.playerRadius,
    );
  });
});
