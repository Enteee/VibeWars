import { describe, expect, it } from "vitest";

import type { PlayerBuild } from "../../build.js";
import { distance, vec2, type Vec2 } from "../../vec2.js";
import type { MatchSimulation } from "../simulation.js";
import { ELBOW_DISTANCE } from "./rules/shared.js";
import { DT, ELEMENTALIST, MONK, RANGER, WARRIOR, fighter, match } from "./rules/test-support.js";

const RANGED = ["e0", "r0", "e1", "r1"];
const SECONDS = 20;

/** 4v4 (#2545): `lead`, two ranged bots and a healer a side. */
function fight(lead: PlayerBuild, seed: string): MatchSimulation {
  const side = (team: number, x: number) => [
    fighter(`w${String(team)}`, team, lead, vec2(x, 400)),
    fighter(`e${String(team)}`, team, ELEMENTALIST, vec2(x, 300)),
    fighter(`r${String(team)}`, team, RANGER, vec2(x, 500)),
    fighter(`m${String(team)}`, team, MONK, vec2(x, 600)),
  ];
  return match([...side(0, 200), ...side(1, 1400)], seed);
}

const fighters = (sim: MatchSimulation, team: number) =>
  [...sim.participants()].filter(
    (body) => body.combatant.team === team && !body.combatant.dead && body.creature === undefined,
  );

function centroid(sim: MatchSimulation, team: number): Vec2 {
  const bodies = fighters(sim, team);
  const x = bodies.reduce((sum, { position }) => sum + position.x, 0);
  const y = bodies.reduce((sum, { position }) => sum + position.y, 0);
  return vec2(x / bodies.length, y / bodies.length);
}

/** `lead`'s 4v4 played for `SECONDS`: ticks each ranged bot had no foe at its elbow, and whether each side was hurt. */
function play(lead: PlayerBuild, seed = "positions") {
  const sim = fight(lead, seed);
  const clear = new Map(RANGED.map((id) => [id, 0]));
  const hurt = [false, false];
  let ticks = 0;
  for (let t = 0; t < SECONDS; t += DT) {
    sim.step(DT);
    ticks += 1;
    for (const id of RANGED) {
      const self = sim.get(id);
      if (self === undefined) throw new Error(`no ${id}`);
      const pressed = fighters(sim, 1 - self.combatant.team).some(
        (foe) => distance(foe.position, self.position) <= ELBOW_DISTANCE,
      );
      if (!pressed) clear.set(id, (clear.get(id) ?? 0) + 1);
    }
    for (const team of [0, 1]) {
      if (fighters(sim, team).some(({ combatant }) => combatant.health < combatant.maxHealth)) {
        hurt[team] = true;
      }
    }
  }
  const positions = [...sim.participants()].map(
    ({ id, position }) => `${id}@${String(position.x)},${String(position.y)}`,
  );
  return { sim, clear, hurt, ticks, positions };
}

describe("bots take positions by role (#2545)", () => {
  it("keeps every ranged bot clear of foes most of a fight with no frontline", () => {
    const { clear, ticks } = play(MONK);
    for (const id of RANGED) {
      expect(clear.get(id) ?? 0, id).toBeGreaterThanOrEqual(ticks * 0.5);
    }
  });

  describe("with a frontline a side", () => {
    const { sim, hurt, positions } = play(WARRIOR);

    it("fights rather than stalemates", () => {
      expect(hurt).toEqual([true, true]);
    });

    it("keeps each healer farther from the foes than its frontline", () => {
      for (const team of [0, 1]) {
        const foes = centroid(sim, 1 - team);
        const healer = sim.get(`m${String(team)}`);
        const frontline = sim.get(`w${String(team)}`);
        if (healer === undefined || frontline === undefined) throw new Error("missing");
        expect(distance(healer.position, foes)).toBeGreaterThan(distance(frontline.position, foes));
      }
    });

    it("plays the same fight twice from the same seed", () => {
      expect(play(WARRIOR).positions).toEqual(positions);
    });
  });
});
