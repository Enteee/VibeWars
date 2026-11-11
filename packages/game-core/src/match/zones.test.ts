import { describe, expect, it } from "vitest";

import type { Polygon } from "../geometry.js";
import { getSkill } from "../skills/catalog.js";
import type { StatusId } from "../skills/status.js";
import { vec2, type Vec2 } from "../vec2.js";
import { BOUNDS, DT, fighter, RANGER, RULESET } from "./bot/rules/test-support.js";
import { UPHILL } from "./layer-rules.js";
import {
  MatchSimulation,
  type MatchLayers,
  type Participant,
  type ParticipantSpec,
} from "./simulation.js";
import {
  ZONE_KINDS,
  ZONE_RULES,
  zoneKindOfSource,
  zonePhaseAt,
  zonePolygonAt,
  zoneSourceId,
  zonesHolding,
  type MatchZone,
  type ZoneKind,
} from "./zones.js";

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
  transitions: [{ from: 0, to: 1, area: rect(150, 300, 170, 200), uphill: UPHILL.e, pace: 1 }],
  outline: undefined,
  deepWater: [[], []],
  dropOffs: [],
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

/** The while-inside rule of `kind`; a strike kind has no linger. */
function lingering(kind: ZoneKind) {
  const rule = ZONE_RULES[kind];
  if (rule.trigger !== "while-inside") throw new Error(`${kind} strikes`);
  return rule;
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    sim.step(DT);
  }
}

describe("zoneKindOfSource (#3046)", () => {
  it("reads back the kind of every zone's source, an id with ':' in it too", () => {
    for (const kind of ZONE_KINDS) {
      const zone: MatchZone = { ...STRIP, id: "pool:north", kind };
      expect(zoneKindOfSource(zoneSourceId(zone))).toBe(kind);
    }
  });

  it("is undefined for an unknown kind, a kind with no id, and a player", () => {
    expect(zoneKindOfSource("zone:nope:x")).toBeUndefined();
    expect(zoneKindOfSource("zone:spring")).toBeUndefined();
    expect(zoneKindOfSource("a")).toBeUndefined();
  });
});

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
      lingering("scorched").lingerSeconds - DT,
      5,
    );
    while (zonesHolding([STRIP], get(sim, "a").position, 0).length > 0) {
      sim.step(DT);
    }
    run(sim, lingering("scorched").lingerSeconds - 0.5);
    expect(burning(sim, "a")).toBeDefined();
    run(sim, 1);
    expect(burning(sim, "a")).toBeUndefined();
  });

  it("names the zone as the source, so no player is credited", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 }), spec("b", 1, vec2(900, 400))]);
    run(sim, 1);
    expect(burning(sim, "a")?.sourceId).toBe("zone:scorched:strip");
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

describe("harmful ground (#3027)", () => {
  const holds = (sim: MatchSimulation, id: string, status: StatusId) =>
    get(sim, id).combatant.statuses.active.some((active) => active.id === status);

  for (const kind of ["molten", "toxic-fog", "mire", "foul-water"] as const) {
    it(`${kind}: puts its statuses on inside, keeps them its linger out, then they end`, () => {
      const rule = lingering(kind);
      const zone = { ...STRIP, kind };
      const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [zone]);
      run(sim, 0.5);
      for (const status of rule.statuses) {
        expect(holds(sim, "a", status)).toBe(true);
      }
      sim.walkTo("a", vec2(560, 400), 0);
      while (zonesHolding([zone], get(sim, "a").position, 0).length > 0) {
        sim.step(DT);
      }
      run(sim, rule.lingerSeconds - 0.2);
      for (const status of rule.statuses) {
        expect(holds(sim, "a", status)).toBe(true);
      }
      run(sim, 0.5);
      for (const status of rule.statuses) {
        expect(holds(sim, "a", status)).toBe(false);
      }
    });
  }

  it("mire: a skill used inside costs 1 Energy more than outside", () => {
    const spent = (spawn: Vec2): number => {
      const sim = arena(
        [spec("a", 0, spawn, { layer: 0, skillBar: ["warrior.sprint"] })],
        [{ ...STRIP, kind: "mire" }],
      );
      run(sim, 0.5);
      const before = get(sim, "a").combatant.energy;
      expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
      sim.step(DT);
      return before - get(sim, "a").combatant.energy;
    };
    expect(spent(vec2(400, 400)) - spent(vec2(900, 400))).toBeCloseTo(1, 5);
  });

  it("mire: never takes Energy below 0", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0, skillBar: ["warrior.sprint"] })],
      [{ ...STRIP, kind: "mire" }],
    );
    run(sim, 0.5);
    const combatant = get(sim, "a").combatant;
    combatant.energy = getSkill("warrior.sprint")?.cost?.amount ?? 0;
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    sim.step(DT);
    expect(combatant.energy).toBeGreaterThanOrEqual(0);
    expect(combatant.energy).toBeLessThan(0.5);
  });

  it("a strip of any other category leaves Mired in place", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [{ ...STRIP, kind: "mire" }]);
    run(sim, 0.5);
    const statuses = get(sim, "a").combatant.statuses;
    for (const category of ["condition", "hex", "enchantment", "skill-effect"] as const) {
      statuses.removeByCategory(category);
    }
    expect(holds(sim, "a", "mired")).toBe(true);
  });

  it("molten: a condition removed inside comes back on the next tick", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [{ ...STRIP, kind: "molten" }]);
    run(sim, 0.5);
    get(sim, "a").combatant.statuses.removeByCategory("condition");
    expect(holds(sim, "a", "burning")).toBe(false);
    sim.step(DT);
    expect(holds(sim, "a", "burning")).toBe(true);
    expect(holds(sim, "a", "crippled")).toBe(true);
  });

  it("stacks different kinds and refreshes one status under two of a kind", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0 })],
      [
        { ...STRIP, kind: "mire" },
        { ...STRIP, id: "again", kind: "mire" },
        { ...STRIP, id: "swamp", kind: "foul-water" },
      ],
    );
    run(sim, 0.5);
    const ids = get(sim, "a").combatant.statuses.active.map((status) => status.id);
    expect(ids.filter((id) => id === "mired")).toHaveLength(1);
    expect(ids).toContain("fouled");
  });
});

describe("springs, groves, tainted water and draining spires (#3028)", () => {
  const holds = (sim: MatchSimulation, id: string, status: StatusId) =>
    get(sim, id).combatant.statuses.active.some((active) => active.id === status);

  it("has bots shun tainted water and spires, not springs or groves (#3026)", () => {
    expect(ZONE_RULES["tainted-water"].harmful).toBe(true);
    expect(ZONE_RULES["draining-spire"].harmful).toBe(true);
    expect(ZONE_RULES.spring.harmful).toBe(false);
    expect(ZONE_RULES.grove.harmful).toBe(false);
  });

  for (const [kind, status] of [
    ["spring", "refreshed"],
    ["grove", "fleet"],
    ["tainted-water", "tainted"],
    ["draining-spire", "drained"],
  ] as const) {
    it(`${kind}: puts ${status} on inside, keeps it its linger out, then it ends`, () => {
      const rule = lingering(kind);
      expect(rule.statuses).toEqual([status]);
      expect(rule.lingerSeconds).toBe(1);
      const zone = { ...STRIP, kind };
      const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [zone]);
      run(sim, 0.5);
      expect(holds(sim, "a", status)).toBe(true);
      sim.walkTo("a", vec2(560, 400), 0);
      while (zonesHolding([zone], get(sim, "a").position, 0).length > 0) {
        sim.step(DT);
      }
      run(sim, rule.lingerSeconds - 0.2);
      expect(holds(sim, "a", status)).toBe(true);
      run(sim, 0.5);
      expect(holds(sim, "a", status)).toBe(false);
    });
  }

  /** Health `a` has after a second, from half, standing at `spawn` among `zones`. */
  const healthAfter = (spawn: Vec2, zones: readonly MatchZone[]): number => {
    const sim = arena([spec("a", 0, spawn, { layer: 0 })], zones);
    run(sim, 0.5);
    const combatant = get(sim, "a").combatant;
    combatant.health = 240;
    run(sim, 1);
    return combatant.health;
  };

  it("spring: Refreshed heals 6 Health a second more than outside", () => {
    const spring = { ...STRIP, kind: "spring" } as const;
    expect(
      healthAfter(vec2(400, 400), [spring]) - healthAfter(vec2(900, 400), [spring]),
    ).toBeCloseTo(6, 0);
  });

  it("spring in scorched ground: the pips sum, Burning's -7 and Refreshed's +3", () => {
    const both = [STRIP, { ...STRIP, id: "spring", kind: "spring" } as const];
    expect(healthAfter(vec2(900, 400), both) - healthAfter(vec2(400, 400), both)).toBeCloseTo(8, 0);
  });

  it("draining spire: Drained takes 1 Energy a second", () => {
    const after = (spawn: Vec2): number => {
      const sim = arena(
        [spec("a", 0, spawn, { layer: 0 })],
        [{ ...STRIP, kind: "draining-spire" }],
      );
      run(sim, 0.5);
      const combatant = get(sim, "a").combatant;
      combatant.energy = 10;
      run(sim, 3);
      return combatant.energy;
    };
    expect(after(vec2(900, 400)) - after(vec2(400, 400))).toBeCloseTo(3, 1);
  });

  it("draining spire: never takes Energy below 0", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0, baseEnergyPips: 0 })],
      [{ ...STRIP, kind: "draining-spire" }],
    );
    run(sim, 0.5);
    get(sim, "a").combatant.energy = 0.5;
    run(sim, 2);
    expect(get(sim, "a").combatant.energy).toBe(0);
  });

  it("grove: one Fleet under two overlapping groves", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0 })],
      [
        { ...STRIP, kind: "grove" },
        { ...STRIP, id: "again", kind: "grove" },
      ],
    );
    run(sim, 0.5);
    const ids = get(sim, "a").combatant.statuses.active.map((status) => status.id);
    expect(ids.filter((id) => id === "fleet")).toHaveLength(1);
  });

  /** Health `a` loses using its first skill, standing at `spawn` by tainted water. */
  const lostToSkill = (spawn: Vec2, skillId: string): number => {
    const sim = arena(
      [spec("a", 0, spawn, { layer: 0, skillBar: [skillId] })],
      [{ ...STRIP, kind: "tainted-water" }],
    );
    run(sim, 0.5);
    const combatant = get(sim, "a").combatant;
    const before = combatant.health;
    expect(sim.requestSkill("a", 0)?.check).toEqual({ ok: true });
    sim.step(DT);
    return before - combatant.health;
  };

  it("tainted water: a skill paid for inside costs 15 Health, outside nothing", () => {
    expect(lostToSkill(vec2(400, 400), "warrior.sprint")).toBeCloseTo(15, 0);
    expect(lostToSkill(vec2(900, 400), "warrior.sprint")).toBe(0);
  });

  it("tainted water: a skill that costs nothing still costs 15 Health", () => {
    expect(getSkill("warrior.signet-of-strength")?.cost).toBeUndefined();
    expect(lostToSkill(vec2(400, 400), "warrior.signet-of-strength")).toBeCloseTo(15, 0);
  });

  it("tainted water: a cast cancelled after it began keeps its price", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0, skillBar: ["warrior.signet-of-strength"] })],
      [{ ...STRIP, kind: "tainted-water" }],
    );
    run(sim, 0.5);
    const combatant = get(sim, "a").combatant;
    const before = combatant.health;
    sim.requestSkill("a", 0);
    sim.step(DT);
    sim.cancelAction("a");
    sim.step(DT);
    expect(before - combatant.health).toBeCloseTo(15, 0);
  });

  it("tainted water: a plain attack costs nothing", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0 }), spec("b", 1, vec2(560, 400), { layer: 0 })],
      [{ ...STRIP, kind: "tainted-water" }],
    );
    run(sim, 0.5);
    const attacker = get(sim, "a").combatant;
    const foe = get(sim, "b").combatant;
    const [before, foeBefore] = [attacker.health, foe.health];
    expect(sim.requestAttack("a", "b")).toEqual({ ok: true });
    run(sim, 4);
    expect(foe.health).toBeLessThan(foeBefore);
    expect(attacker.health).toBe(before);
  });

  it("tainted water: its health loss can kill", () => {
    const sim = arena(
      [spec("a", 0, vec2(400, 400), { layer: 0, skillBar: ["warrior.sprint"] })],
      [{ ...STRIP, kind: "tainted-water" }],
    );
    run(sim, 0.5);
    get(sim, "a").combatant.health = 10;
    sim.requestSkill("a", 0);
    sim.step(DT);
    expect(get(sim, "a").combatant.dead).toBe(true);
  });
});

describe("zonePhaseAt (#3029)", () => {
  const zone = { schedule: { periodSeconds: 4, activeSeconds: 1, offsetSeconds: 3 } };

  it("telegraphs from its offset, strikes for its window, then idles out the period", () => {
    expect(zonePhaseAt(zone, 2.99)).toBe("idle");
    expect(zonePhaseAt(zone, 3)).toBe("telegraph");
    expect(zonePhaseAt(zone, 3.99)).toBe("telegraph");
    expect(zonePhaseAt(zone, 4)).toBe("active");
    expect(zonePhaseAt(zone, 4.99)).toBe("active");
    expect(zonePhaseAt(zone, 5)).toBe("idle");
    expect(zonePhaseAt(zone, 7)).toBe("telegraph");
  });

  it("is already in its last period's beat before its offset", () => {
    expect(zonePhaseAt(zone, 0)).toBe("active");
    expect(zonePhaseAt(zone, 1)).toBe("idle");
  });

  it("is always active with no schedule", () => {
    expect(zonePhaseAt({}, 0)).toBe("active");
    expect(zonePhaseAt({}, 123.4)).toBe("active");
  });
});

describe("zonePolygonAt (#3029)", () => {
  const zone: MatchZone = {
    id: "rock",
    kind: "rockfall",
    layer: 0,
    polygon: rect(0, 0, 10, 10),
    path: { points: [vec2(5, 5), vec2(105, 5)], speed: 50 },
  };
  const left = (seconds: number) => zonePolygonAt(zone, seconds)[0]?.x;

  it("slides along its path at its speed, and back from the far end", () => {
    expect(left(0)).toBeCloseTo(0);
    expect(left(1)).toBeCloseTo(50);
    expect(left(2)).toBeCloseTo(100);
    expect(left(3)).toBeCloseTo(50);
    expect(left(4)).toBeCloseTo(0);
    expect(left(5)).toBeCloseTo(50);
  });

  it("stands where it is drawn with no path", () => {
    const { path: _path, ...still } = zone;
    expect(zonePolygonAt(still, 3)).toBe(still.polygon);
  });
});

describe("timed and moving hazards in a match (#3029)", () => {
  /** The strip as a vent: telegraph [0, 1), active [1, 2), idle [2, 4). */
  const VENT: MatchZone = {
    ...STRIP,
    id: "vent",
    kind: "vent",
    schedule: { periodSeconds: 4, activeSeconds: 1, offsetSeconds: 0 },
  };

  /** Strikes on `id` by `zone` over `seconds`. */
  function strikes(sim: MatchSimulation, zone: MatchZone, id: string, seconds: number): number {
    let count = 0;
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      count += sim
        .step(DT)
        .log.filter(
          (entry) =>
            entry.cause === "zone" &&
            entry.sourceId === zoneSourceId(zone) &&
            entry.events.some((event) => event.kind === "damage" && event.targetId === id),
        ).length;
    }
    return count;
  }

  it("strikes nobody while it telegraphs", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [VENT]);
    expect(strikes(sim, VENT, "a", 0.9)).toBe(0);
    expect(burning(sim, "a")).toBeUndefined();
  });

  it("strikes a body standing in it once per window, and burns it", () => {
    const sim = arena([spec("a", 0, vec2(400, 400), { layer: 0 })], [VENT]);
    expect(strikes(sim, VENT, "a", 1.5)).toBe(1);
    expect(burning(sim, "a")).toBeDefined();
    expect(strikes(sim, VENT, "a", 2.4)).toBe(0);
    expect(strikes(sim, VENT, "a", 4)).toBe(1);
  });

  it("strikes a body that walks in mid-window, once", () => {
    const sim = arena([spec("a", 0, vec2(450, 400), { layer: 0 })], [VENT]);
    expect(strikes(sim, VENT, "a", 1.4)).toBe(0);
    sim.walkTo("a", vec2(400, 400), 0);
    expect(strikes(sim, VENT, "a", 0.6)).toBe(1);
    expect(zonesHolding([VENT], get(sim, "a").position, 0)).toHaveLength(1);
  });

  it("strikes a body standing on a moving hazard's path once each pass", () => {
    // Centred on (400, 400), down to (400, 600) and back in 4 s: over the body at 1 s and 3 s.
    const rock: MatchZone = {
      id: "rock",
      kind: "rockfall",
      layer: 0,
      polygon: rect(390, 390, 20, 20),
      path: { points: [vec2(400, 400), vec2(400, 600)], speed: 100 },
    };
    const sim = arena([spec("a", 0, vec2(400, 500), { layer: 0 })], [rock]);
    expect(strikes(sim, rock, "a", 0.8)).toBe(0);
    expect(strikes(sim, rock, "a", 0.4)).toBe(1);
    expect(strikes(sim, rock, "a", 1.6)).toBe(0);
    expect(strikes(sim, rock, "a", 0.4)).toBe(1);
    expect(strikes(sim, rock, "a", 4)).toBe(2);
  });
});
