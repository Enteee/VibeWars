import {
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  loadoutOf,
  resolveLoadout,
  switchTargetId,
  type ParticipantSpec,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { mapSimulationFields } from "./match-fields.js";
import { validateMapData } from "./schema.js";
import switchedData from "../test-maps/switched/map.json" with { type: "json" };

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
const MAP = validateMapData(switchedData);

const build = STARTER_BUILDS[0];
if (build === undefined) throw new Error("no starter build");
const loadout = loadoutOf(build);
const resolved = resolveLoadout(
  {
    primaryProfession: loadout.primaryProfession,
    secondaryProfession: loadout.secondaryProfession,
    allocatedRanks: loadout.attributeRanks,
    equipment: loadout.equipment,
  },
  RULESET.combat,
);

/** A body with no skills at (`x`, `y`) on `layer`; team 1 is the foe that keeps the match going. */
function body(id: string, x: number, y: number, layer: number, team = 0): ParticipantSpec {
  return {
    id,
    team,
    layer,
    skillBar: [],
    attributeRanks: resolved.attributeRanks,
    equipment: resolved.weaponSets[0].equipment,
    baseEnergyPips: resolved.weaponSets[0].baseEnergyPips,
    maxHealth: 1e6,
    spawn: { x, y },
    facing: 0,
  };
}

/** A match on the switched test map with `bodies`, a foe far off in its corner. */
function arena(bodies: readonly ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "switched-decks",
    ruleset: RULESET,
    ...mapSimulationFields(MAP, 2),
    participants: [...bodies, body("foe", 1900, 900, 1, 1)],
  });
}

function run(sim: MatchSimulation, seconds: number): void {
  for (let t = 0; t < seconds; t += DT) {
    sim.step(DT);
  }
}

/** Whether the switched deck `id` can be walked on now. */
function up(sim: MatchSimulation, id: string): boolean | undefined {
  return sim.switchedDecks.find((deck) => deck.id === id)?.up;
}

/** Where `id` stands and on which layer. */
function where(sim: MatchSimulation, id: string) {
  const record = sim.get(id);
  return { x: record?.position.x, y: record?.position.y, layer: record?.layer };
}

describe("switched decks in a match (#3068)", () => {
  it("raises the drawbridge on its lever, pushing each body on it off its nearer end", () => {
    // The span runs x 1400..1700, hinged west; 1550 is the tie, which goes away from the hinge.
    const sim = arena([
      body("puller", 1300, 680, 1),
      body("west", 1440, 480, 2),
      body("east", 1660, 480, 2),
      body("middle", 1550, 520, 2),
    ]);
    sim.requestAttack("puller", switchTargetId("drawbridge-lever"));
    run(sim, 2);
    expect(up(sim, "drawbridge")).toBe(false);
    expect(where(sim, "west")).toMatchObject({ layer: 2 });
    expect(where(sim, "west").x).toBeLessThan(1400);
    expect(where(sim, "east").x).toBeGreaterThan(1700);
    expect(where(sim, "middle").x).toBeGreaterThan(1700);
  });

  it("cuts the rope bridge: a body over the gorge falls into it, one over ground to the ground", () => {
    const sim = arena([
      body("puller", 600, 760, 1),
      body("gorge", 1000, 670, 2),
      body("bank", 880, 670, 2),
    ]);
    sim.requestAttack("puller", switchTargetId("rope-lever"));
    run(sim, 2);
    expect(up(sim, "rope-bridge")).toBe(false);
    expect(where(sim, "gorge")).toMatchObject({ layer: 0 });
    expect(where(sim, "bank")).toMatchObject({ layer: 1 });
  });

  it("keeps a cut rope bridge cut when its lever is pulled again", () => {
    const sim = arena([body("puller", 600, 760, 1)]);
    sim.requestAttack("puller", switchTargetId("rope-lever"));
    run(sim, 2);
    sim.requestAttack("puller", switchTargetId("rope-lever"));
    run(sim, 2);
    expect(sim.switches.find(({ id }) => id === "rope-lever")?.up).toBe(true);
    expect(up(sim, "rope-bridge")).toBe(false);
  });

  it("cracks the planks once per body stepping on, and drops them on the third", () => {
    const sim = arena([body("a", 1500, 785, 2), body("b", 1600, 785, 2)]);
    run(sim, 0.5);
    expect(sim.switchedDecks.find(({ id }) => id === "crumbling-planks")).toMatchObject({
      up: true,
      crossings: 2,
    });
    run(sim, 1);
    expect(sim.switchedDecks.find(({ id }) => id === "crumbling-planks")?.crossings).toBe(2);
    sim.walkTo("a", { x: 1300, y: 785 }, 2);
    run(sim, 3);
    expect(up(sim, "crumbling-planks")).toBe(true);
    sim.walkTo("a", { x: 1500, y: 785 }, 2);
    run(sim, 3);
    expect(up(sim, "crumbling-planks")).toBe(false);
    expect(where(sim, "a")).toMatchObject({ layer: 1 });
    expect(where(sim, "b")).toMatchObject({ layer: 1 });
  });

  it("paths round a raised drawbridge, and across it lowered", () => {
    const onSpan = (sim: MatchSimulation): boolean => {
      const { x = 0, y = 0, layer } = where(sim, "walker");
      return layer === 2 && x > 1420 && x < 1680 && y > 400 && y < 560;
    };
    const walk = (raised: boolean): boolean => {
      const sim = arena([body("puller", 1300, 680, 1), body("walker", 1330, 480, 2)]);
      if (raised) {
        sim.requestAttack("puller", switchTargetId("drawbridge-lever"));
        run(sim, 2);
      }
      sim.walkTo("walker", { x: 1770, y: 480 }, 2);
      let crossed = false;
      for (let t = 0; t < 20; t += DT) {
        sim.step(DT);
        crossed ||= onSpan(sim);
      }
      expect(where(sim, "walker")).toMatchObject({ layer: 2 });
      expect(where(sim, "walker").x).toBeGreaterThan(1740);
      return crossed;
    };
    expect(walk(false)).toBe(true);
    expect(walk(true)).toBe(false);
  });
});
