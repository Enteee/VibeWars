import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { applyEffects } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * Triggers on a skill type used or a heal (#1913): Cacophony and Soul
 * Bind on a foe, Scribe's Insight on yourself, at rank 12.
 */
const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const CACOPHONY = "necromancer.cacophony";
const SOUL_BIND = "necromancer.soul-bind";
const SCRIBES_INSIGHT = "monk.scribes-insight";

/**
 * `a` on team 0: a shout, a chant, a spell, a signet, and a self-heal. `h`
 * its healer; `n` the Necromancer on team 1, whose hexes these are.
 */
function participant(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["paragon.command", 12],
      ["paragon.leadership", 12],
      ["elementalist.fire-magic", 12],
      ["monk.healing-prayers", 12],
      ["monk.divine-favor", 12],
      ["necromancer.curses", 12],
    ]),
    equipment: unarmedResolvedEquipment(60),
    maxHealth: 1e4,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function sim(): MatchSimulation {
  return new MatchSimulation({
    seed: "skill-type-triggers",
    participants: [
      participant(
        "a",
        0,
        [
          "paragon.fall-back",
          "paragon.anthem-of-flame",
          "elementalist.fireball",
          "warrior.healing-signet",
          "monk.orison-of-healing",
          SCRIBES_INSIGHT,
        ],
        vec2(0, 0),
      ),
      participant(
        "h",
        0,
        ["monk.heal-other", "monk.healing-breeze", "monk.orison-of-healing"],
        vec2(40, 0),
      ),
      participant("n", 1, [CACOPHONY, SOUL_BIND], vec2(300, 0)),
    ],
  });
}

function get(match: MatchSimulation, id: string) {
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

/** `id` uses its skill in `slot` on `target`. */
function use(match: MatchSimulation, id: string, slot: number, target: string): void {
  match.setTarget(id, target);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
}

/** The damage `skillId`'s trigger, the Necromancer's, dealt `id`. */
function damageBy(log: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return log
    .filter((entry) => entry.skillId === skillId && entry.sourceId === "n")
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === id ? [event.amount] : [],
      ),
    );
}

describe("Cacophony (#1913)", () => {
  it("is cast as the cacophony hex", () => {
    const match = sim();
    use(match, "n", 0, "a");
    stepFor(match, 1.5);
    expect(get(match, "a").statuses.get("cacophony")?.sourceId).toBe("n");
    expect(describeStatus("cacophony")).toContain("90");
  });

  it("a shout costs the foe 90, and so does a chant, through its armor", () => {
    const match = sim();
    get(match, "a").statuses.apply("cacophony", 15, "n", NO_RANKS);
    use(match, "a", 0, "a");
    expect(damageBy(stepFor(match, 1), CACOPHONY, "a")).toEqual([90]);
    use(match, "a", 1, "a");
    expect(damageBy(stepFor(match, 2), CACOPHONY, "a")).toEqual([90]);
  });

  it("a spell or a signet costs nothing", () => {
    const match = sim();
    get(match, "a").statuses.apply("cacophony", 15, "n", NO_RANKS);
    use(match, "a", 2, "n");
    expect(damageBy(stepFor(match, 3), CACOPHONY, "a")).toEqual([]);
    use(match, "a", 3, "a");
    expect(damageBy(stepFor(match, 2), CACOPHONY, "a")).toEqual([]);
  });
});

describe("Soul Bind (#1913)", () => {
  it("is cast as the soul-bind hex", () => {
    const match = sim();
    use(match, "n", 1, "a");
    stepFor(match, 1.5);
    expect(get(match, "a").statuses.get("soul-bind")?.sourceId).toBe("n");
    expect(describeStatus("soul-bind")).toContain("the healer takes 68 damage");
  });

  it("an ally's heal costs the healer 68, not the bearer, at full Health too", () => {
    const match = sim();
    get(match, "a").statuses.apply("soul-bind", 30, "n", NO_RANKS);
    use(match, "h", 0, "a");
    const log = stepFor(match, 1.5);
    expect(damageBy(log, SOUL_BIND, "h")).toEqual([68]);
    expect(damageBy(log, SOUL_BIND, "a")).toEqual([]);
  });

  it("a self-heal costs the bearer itself", () => {
    const match = sim();
    get(match, "a").statuses.apply("soul-bind", 30, "n", NO_RANKS);
    use(match, "a", 4, "a");
    expect(damageBy(stepFor(match, 2), SOUL_BIND, "a")).toEqual([68]);
  });

  it("Healing Breeze's regeneration pips are no heal by a skill", () => {
    const match = sim();
    const bearer = get(match, "a");
    bearer.health = 5000;
    bearer.statuses.apply("soul-bind", 30, "n", NO_RANKS);
    use(match, "h", 1, "a");
    const log = stepFor(match, 6);
    expect(bearer.health).toBeGreaterThan(5000);
    expect(damageBy(log, SOUL_BIND, "h")).toEqual([]);
  });

  it("a heal of the hex's own side never hurts its healer", () => {
    const match = sim();
    get(match, "a").statuses.apply("soul-bind", 30, "h", NO_RANKS);
    use(match, "h", 0, "a");
    const log = stepFor(match, 1.5);
    expect(
      log.filter((entry) => entry.skillId === SOUL_BIND).flatMap((entry) => entry.events),
    ).toEqual([]);
  });

  it("a heal of 0 records nothing; any heal above it does", () => {
    const bearer = makeCombatant({ id: "a", team: 0 });
    const healer = makeCombatant({ id: "h", team: 0 });
    bearer.statuses.apply("soul-bind", 30, "n", NO_RANKS);
    bearer.statuses.drainChanges();
    const heal = (amount: number) =>
      applyEffects([{ kind: "heal", amount: { flat: amount } }], {
        caster: healer,
        target: bearer,
        rng: createRng(1),
        rules: RULES.combat,
        surroundings: new Map(),
        usedSkill: undefined,
      });
    heal(0);
    expect(bearer.statuses.drainChanges().map(({ kind }) => kind)).toEqual([]);
    heal(1);
    expect(bearer.statuses.drainChanges().map(({ kind }) => kind)).toEqual(["healed-by-skill"]);
  });
});

describe("Scribe's Insight (#1913)", () => {
  /** `a`'s Energy after using `slot`, with Scribe's Insight on it or not. */
  function energyAfter(slot: number, insight: boolean, energy = 50): number {
    const match = sim();
    const a = get(match, "a");
    a.energy = energy;
    if (insight) {
      a.statuses.apply("scribes-insight", 30, "a", NO_RANKS);
    }
    use(match, "a", slot, slot === 2 ? "n" : "a");
    stepFor(match, 3);
    return get(match, "a").energy;
  }

  it("is cast on yourself", () => {
    const match = sim();
    use(match, "a", 5, "a");
    stepFor(match, 1);
    expect(get(match, "a").statuses.get("scribes-insight")?.sourceId).toBe("a");
    expect(describeStatus("scribes-insight")).toContain("3");
  });

  it("a signet gives 3 Energy, a spell none", () => {
    expect(energyAfter(3, true) - energyAfter(3, false)).toBe(3);
    expect(energyAfter(2, true) - energyAfter(2, false)).toBe(0);
  });

  it("gives nothing past max Energy", () => {
    expect(energyAfter(3, true, 100)).toBe(100);
  });
});
