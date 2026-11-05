import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeStatus } from "./describe.js";
import type { Combatant } from "./types.js";

/**
 * Signet of Suffering (#2333): "You suffer from Bleeding for 6 seconds.
 * The next Necromancer skill that targets a foe causes Bleeding for
 * 2...16 seconds."
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12: ReadonlyMap<string, number> = new Map([["necromancer.blood-magic", 12]]);
const R0: ReadonlyMap<string, number> = new Map();

const SUFFERING = "necromancer.signet-of-suffering";
const BARBS = "necromancer.barbs";
const RITUAL = "necromancer.blood-ritual";
const SHOVE = "warrior.shove";

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[],
  attributeRanks: ReadonlyMap<string, number>,
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

/**
 * Necromancer `n`, of team 0, with Signet of Suffering, Barbs, Blood
 * Ritual and Shove at `ranks`; `ally` beside it, `foe`, of team 1, at hand.
 */
function arena(ranks: ReadonlyMap<string, number> = R12) {
  return new MatchSimulation({
    seed: "signet-of-suffering",
    participants: [
      spec("n", 0, vec2(0, 0), [SUFFERING, BARBS, RITUAL, SHOVE], ranks),
      spec("ally", 0, vec2(0, 30), [], R0),
      spec("foe", 1, vec2(30, 0), [], R0),
    ],
  });
}

function get(match: MatchSimulation, id: string): Combatant {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...match.step(DT).log);
  }
  return log;
}

/** `n` uses the skill in `slot` on `targetId`, and what follows for `seconds`. */
function cast(match: MatchSimulation, slot: number, targetId: string, seconds = 1.5): void {
  match.setTarget("n", targetId);
  expect(match.requestSkill("n", slot)?.check).toEqual({ ok: true });
  stepFor(match, seconds);
}

describe("Signet of Suffering (#2333)", () => {
  it("is the corpus's elite Blood Magic signet", () => {
    expect(getSkill(SUFFERING)).toMatchObject({
      gwId: 1364,
      type: "signet",
      elite: true,
      attributeId: "necromancer.blood-magic",
      cost: undefined,
      activationSeconds: 0,
      rechargeSeconds: 4,
    });
  });

  it("bleeds its user for 6 s and waits for the next Necromancer skill on a foe", () => {
    const match = arena();
    cast(match, 0, "n", 0.1);
    const n = get(match, "n");
    expect(n.statuses.get("bleeding")?.durationSeconds).toBe(6);
    expect(n.statuses.has("signet-of-suffering")).toBe(true);
  });

  it.each([
    [R12, 13],
    [R0, 2],
  ])("a Necromancer hex on a foe bleeds it, by Blood Magic, and spends it", (ranks, seconds) => {
    const match = arena(ranks);
    cast(match, 0, "n", 0.1);
    cast(match, 1, "foe");
    expect(get(match, "foe").statuses.get("bleeding")?.durationSeconds).toBe(seconds);
    expect(get(match, "n").statuses.has("signet-of-suffering")).toBe(false);
  });

  it("a Necromancer skill on an ally, or another profession's on a foe, leaves it", () => {
    const match = arena();
    cast(match, 0, "n", 0.1);
    cast(match, 2, "ally");
    expect(get(match, "ally").statuses.has("bleeding")).toBe(false);
    cast(match, 3, "foe");
    expect(get(match, "foe").statuses.has("bleeding")).toBe(false);
    expect(get(match, "n").statuses.has("signet-of-suffering")).toBe(true);
  });

  it("fires once", () => {
    const match = arena();
    cast(match, 0, "n", 0.1);
    cast(match, 1, "foe");
    get(match, "foe").statuses.remove("bleeding");
    stepFor(match, 5);
    cast(match, 1, "foe");
    expect(get(match, "foe").statuses.has("bleeding")).toBe(false);
  });

  it("used again while up, it bleeds its user again", () => {
    const match = arena();
    cast(match, 0, "n", 0.1);
    get(match, "n").statuses.remove("bleeding");
    stepFor(match, 4);
    cast(match, 0, "n", 0.1);
    const n = get(match, "n");
    expect(n.statuses.get("bleeding")?.durationSeconds).toBe(6);
    expect(n.statuses.has("signet-of-suffering")).toBe(true);
  });

  it("says what it waits for", () => {
    expect(describeStatus("signet-of-suffering", R12)).toContain(
      "the next time it uses a Necromancer skill on a foe",
    );
  });
});
