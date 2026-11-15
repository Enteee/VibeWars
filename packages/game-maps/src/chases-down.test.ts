import {
  ANNIHILATION_MATCH_RULES,
  MatchSimulation,
  MINIMAL_GW_INSPIRED_PVP_V1,
  STARTER_BUILDS,
  type ParticipantSpec,
  type Vec2,
} from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { loadAllMaps } from "./loader.js";
import { mapSimulationFields } from "./match-fields.js";
import { playBuildBot } from "./tools/map-balance.js";

/**
 * A bot on Canyon's bed, a foe in the east gallery below it and
 * another on the bed (#3353): it walks down the stairs to the one, or
 * fights the other, but never stands over a foe in a tunnel.
 */

const RULESET = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULESET.tickRateHz;
/** The longest a bot may stand still without dealing damage. */
const STILL_SECONDS = 3;
/** How far a bot moves in a tick to count as walking. */
const MOVED = 0.5;
/** How long the scenario runs. */
const SECONDS = 40;

const map = loadAllMaps().find((candidate) => candidate.id === "arena-canyon");
if (map === undefined) throw new Error("no arena-canyon");

function bot(name: string, id: string, team: number, at: Vec2, layer: number): ParticipantSpec {
  const build = STARTER_BUILDS.find((candidate) => candidate.name === name);
  if (build === undefined) throw new Error(`no starter build ${name}`);
  return playBuildBot(build, id, team, { position: at, layer }, 0);
}

/** A bot's foe that stands where it is put and does nothing. */
function idle(id: string, at: Vec2, layer: number): ParticipantSpec {
  const { behaviour: _, ...spec } = bot("Barrage (R)", id, 1, at, layer);
  return spec;
}

describe("a bot over a foe in Canyon's tunnel (#3353)", () => {
  it.each(["Barrage (R)", "Signet of Suffering (N/A)", "Double Dragon (E)"])(
    "%s walks to it or fights the other, never standing still",
    (name) => {
      const sim = new MatchSimulation({
        seed: "chases-down",
        ruleset: RULESET,
        matchRules: ANNIHILATION_MATCH_RULES,
        ...mapSimulationFields(map, 2),
        participants: [
          bot(name, "bot", 0, { x: 1600, y: 760 }, 1),
          idle("tunnel", { x: 1600, y: 870 }, 0),
          idle("bed", { x: 1300, y: 1000 }, 1),
        ],
      });
      const self = () => {
        const found = [...sim.participants()].find(({ id }) => id === "bot");
        if (found === undefined) throw new Error("no bot");
        return found;
      };
      let last = self().position;
      let still = 0;
      let longest = 0;
      let damaged = false;
      for (let t = 0; t < SECONDS; t += DT) {
        const hit = sim
          .step(DT)
          .log.some(
            (entry) =>
              entry.sourceId === "bot" && entry.events.some((event) => event.kind === "damage"),
          );
        damaged ||= hit;
        const now = self().position;
        still = hit || Math.hypot(now.x - last.x, now.y - last.y) > MOVED ? 0 : still + DT;
        longest = Math.max(longest, still);
        last = now;
      }
      expect(longest).toBeLessThan(STILL_SECONDS);
      expect(damaged).toBe(true);
    },
    60_000,
  );
});
