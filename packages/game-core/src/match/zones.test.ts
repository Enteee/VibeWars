import { describe, expect, it } from "vitest";

import type { Polygon } from "../geometry.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import { ZONE_RULES, zonesHolding, type MatchZone } from "./zones.js";

const rect = (x: number, y: number, width: number, height: number): Polygon => [
  vec2(x, y),
  vec2(x + width, y),
  vec2(x + width, y + height),
  vec2(x, y + height),
];

/** A strip across the way from x 200 to x 600, as Training Wilds has one. */
const STRIP: MatchZone = {
  id: "strip",
  kind: "scorched",
  layer: 0,
  polygon: rect(380, 300, 40, 200),
};

/** A deck over the strip, with a ramp up to it from the west. */
const LAYERS: MatchLayers = {
  count: 2,
  ground: 0,
  pits: [],
  walls: [[], []],
  decks: [{ layer: 1, footprint: rect(300, 300, 200, 200) }],
  transitions: [{ from: 0, to: 1, area: rect(150, 300, 170, 200), uphill: UPHILL.e }],
  deepWater: [[], []],
};

function spec(id: string, team: number, spawn: Vec2, extra: Partial<ParticipantSpec> = {}) {
  return fighter(id, team, RANGER, spawn, { behaviour: undefined, ...extra });
}

function arena(
  participants: readonly ParticipantSpec[],
  zones: readonly MatchZone[] = [STRIP],
): MatchSimulation {
  return new MatchSimulation({
    seed: "zones",
    ruleset: RULESET,
    bounds: BOUNDS,
    walls: [],
    layers: LAYERS,
    zones,
    participants,
  });
}

function get(sim: MatchSimulation, id: string): Participant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found;
}

/** `id`'s Burning, if it bears it. */
function burning(sim: MatchSimulation, id: string) {
  return get(sim, id).combatant.statuses.active.find((status) => status.id === "burning");
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

describe("zonesHolding (ADR-0053)", () => {
  const polygon: MatchZone = {
    id: "wedge",
    kind: "scorched",
    layer: 0,
    polygon: [vec2(0, 0), vec2(100, 0), vec2(0, 100)],
  };

  it("holds a point inside a rect zone, on its layer", () => {
    expect(zonesHolding([STRIP], vec2(400, 400), 0)).toEqual([STRIP]);
  });

  it("does not hold a point outside it, or just past its edge", () => {
    expect(zonesHolding([STRIP], vec2(500, 400), 0)).toEqual([]);
    expect(zonesHolding([STRIP], vec2(421, 400), 0)).toEqual([]);
    expect(zonesHolding([STRIP], vec2(419, 400), 0)).toEqual([STRIP]);
  });

  it("does not hold a point over it on another layer", () => {
    expect(zonesHolding([STRIP], vec2(400, 400), 1)).toEqual([]);
  });

  it("holds by a polygon's outline, not its bounding box", () => {
    expect(zonesHolding([polygon], vec2(20, 20), 0)).toEqual([polygon]);
    expect(zonesHolding([polygon], vec2(80, 80), 0)).toEqual([]);
  });

  it("names every zone holding the point, in the map's order", () => {
    const over = { ...STRIP, id: "over" };
    expect(zonesHolding([over, STRIP], vec2(400, 400), 0)).toEqual([over, STRIP]);
  });
});

describe("a scorched zone in a match (ADR-0053)", () => {
  it("burns a body walked through it, and the burn runs on after it steps out", () => {
    const sim = arena([spec("a", 0, vec2(250, 400), { layer: 0 })]);
    sim.walkTo("a", vec2(560, 400), 0);
    let inside = false;
    for (let tick = 0; tick < 600 && !inside; tick += 1) {
      sim.step(DT);
      inside = zonesHolding([STRIP], get(sim, "a").position, 0).length > 0;
    }
    expect(inside).toBe(true);
    // Put on as it stands there, then aged by the same step.
    expect(burning(sim, "a")?.remainingSeconds).toBeCloseTo(
      ZONE_RULES.scorched.lingerSeconds - DT,
      5,
    );
    while (zonesHolding([STRIP], get(sim, "a").position, 0).length > 0) {
      sim.step(DT);
    }
    run(sim, ZONE_RULES.scorched.lingerSeconds - 0.5);
    expect(burning(sim, "a")).toBeDefined();
    run(sim, 1);
    expect(burning(sim, "a")).toBeUndefined();
  });

  it("names the zone as the source, so no player is credited", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 }), spec("b", 1, vec2(900, 400))]);
    run(sim, 1);
    expect(burning(sim, "a")?.sourceId).toBe("zone:strip");
    expect(get(sim, "a").combatant.lastFoeTeam).toBeUndefined();
  });

  it("leaves a body on the deck over it alone", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 1 })]);
    run(sim, 1);
    expect(get(sim, "a").layer).toBe(1);
    expect(burning(sim, "a")).toBeUndefined();
  });

  it("refreshes one Burning under two overlapping zones", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0 })],
      [STRIP, { ...STRIP, id: "again" }],
    );
    run(sim, 1);
    const statuses = get(sim, "a").combatant.statuses.active;
    expect(statuses.filter((status) => status.id === "burning")).toHaveLength(1);
  });

  it("does not burn the dead", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })]);
    run(sim, 1);
    get(sim, "a").combatant.health = 1;
    run(sim, 1);
    expect(get(sim, "a").combatant.dead).toBe(true);
    expect(burning(sim, "a")).toBeUndefined();
  });

  it("spares a spirit standing in it", () => {
    const spirit = spec("s", 0, vec2(400, 400), {
      layer: 0,
      skillBar: [],
      attributeRanks: new Map(),
      creature: {
        ownerId: "a",
        kind: "spirit",
        look: "spirit",
        name: "s",
        expiresInSeconds: Number.POSITIVE_INFINITY,
        ageSeconds: 0,
        summonedAtTick: 0,
        skillId: undefined,
        aura: undefined,
        onDeath: "vanish",
        ownerDisableSeconds: 0,
        deathBurst: undefined,
        onDeathInRange: undefined,
        pulse: undefined,
        replacedBy: undefined,
        corpsesLeft: 0,
        companionSkillId: undefined,
        leaderId: undefined,
        bondStatusId: undefined,
        mode: "guard",
      },
    });
    const sim = arena([spec("a", 0, vec2(800, 400)), spirit]);
    run(sim, 1);
    expect(burning(sim, "s")).toBeUndefined();
  });
});
