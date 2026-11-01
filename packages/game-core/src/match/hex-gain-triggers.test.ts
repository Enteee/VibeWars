import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SOUL_BARBS = "necromancer.soul-barbs";
const DEFILE_DEFENSES = "necromancer.defile-defenses";
const SCOURGE_ENCHANTMENT = "monk.scourge-enchantment";
const HEX_BREAKER = "mesmer.hex-breaker";
const ICE_SPIKES = "elementalist.ice-spikes";

const AXE: ResolvedEquipment = {
  ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
  mainHand: {
    weapon: WEAPONS.axe,
    attributeId: "warrior.axe-mastery",
    damageType: WEAPONS.axe.damageType,
    requirementMet: true,
    creatureDamageScale: undefined,
  },
};

/** A rank-12 caster of `team` with `skillBar`, sturdy enough never to die here. */
function caster(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["warrior.axe-mastery", 12],
      ["necromancer.curses", 12],
      ["monk.smiting-prayers", 12],
      ["mesmer.domination-magic", 12],
      ["elementalist.water-magic", 12],
    ]),
    equipment: AXE,
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/**
 * `b`, of team 0, the bearer, beside `ally`; `n`, a Necromancer of team 1,
 * `m`, a Monk, and `e`, an Elementalist, across from them.
 */
function sim(...more: ParticipantSpec[]): MatchSimulation {
  return new MatchSimulation({
    seed: "hex-gain-triggers",
    participants: [
      caster("b", 0, [HEX_BREAKER], vec2(0, 0)),
      caster("ally", 0, [], vec2(0, 30)),
      caster("n", 1, [SOUL_BARBS, DEFILE_DEFENSES], vec2(200, 0)),
      caster("m", 1, [SCOURGE_ENCHANTMENT], vec2(200, 40)),
      caster("e", 1, [ICE_SPIKES], vec2(200, -40)),
      ...more,
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

/** `id` uses the skill in `slot` on `targetId`, and what follows for `seconds`. */
function cast(
  match: MatchSimulation,
  id: string,
  slot: number,
  targetId: string,
  seconds = 2.5,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

/** Damage to `id` in `entries` the skill `skillId` is credited with. */
function damageBy(entries: readonly CombatLogEntry[], skillId: string, id: string): number[] {
  return entries
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) =>
      entry.events.flatMap((event) =>
        event.kind === "damage" && event.targetId === id ? [event.amount] : [],
      ),
    );
}

describe("Soul Barbs (#1403)", () => {
  it("does not hurt as it lands", () => {
    const match = sim();
    const log = cast(match, "n", 0, "b");
    expect(get(match, "b").statuses.get("soul-barbs")?.sourceId).toBe("n");
    expect(damageBy(log, SOUL_BARBS, "b")).toEqual([]);
  });

  it("deals 27 for an ally's enchantment, a second hex and a renewed enchantment", () => {
    const match = sim();
    cast(match, "n", 0, "b");
    const bearer = get(match, "b");

    bearer.statuses.apply("guardian", 10, "ally", NO_RANKS);
    const enchanted = stepFor(match, 0.5);
    expect(damageBy(enchanted, SOUL_BARBS, "b")).toEqual([27]);
    expect(enchanted.find((entry) => entry.skillId === SOUL_BARBS)?.sourceId).toBe("n");

    bearer.statuses.apply("barbs", 30, "n", NO_RANKS);
    expect(damageBy(stepFor(match, 0.5), SOUL_BARBS, "b")).toEqual([27]);

    bearer.statuses.apply("guardian", 10, "ally", NO_RANKS);
    expect(damageBy(stepFor(match, 0.5), SOUL_BARBS, "b")).toEqual([27]);

    // Shorter than what runs: a refresh that changes nothing is no gain.
    bearer.statuses.apply("guardian", 2, "ally", NO_RANKS);
    expect(damageBy(stepFor(match, 0.5), SOUL_BARBS, "b")).toEqual([]);
  });

  it("describes it", () => {
    expect(describeStatus("soul-barbs")).toBe(
      "takes 27 damage whenever it gains a hex or an enchantment",
    );
  });
});

describe("Scourge Enchantment (#1403)", () => {
  it("costs the enchanting ally 63 holy, not the bearer", () => {
    const match = sim();
    cast(match, "m", 0, "b");
    expect(get(match, "b").statuses.get("scourge-enchantment")?.sourceId).toBe("m");

    get(match, "b").statuses.apply("guardian", 10, "ally", NO_RANKS);
    const log = stepFor(match, 0.5);
    expect(damageBy(log, SCOURGE_ENCHANTMENT, "ally")).toEqual([63]);
    expect(damageBy(log, SCOURGE_ENCHANTMENT, "b")).toEqual([]);
    expect(log.find((entry) => entry.skillId === SCOURGE_ENCHANTMENT)?.sourceId).toBe("m");
  });

  it("hurts a bearer that enchants itself, and a hex not at all", () => {
    const match = sim();
    cast(match, "m", 0, "b");
    get(match, "b").statuses.apply("barbs", 30, "n", NO_RANKS);
    expect(damageBy(stepFor(match, 0.5), SCOURGE_ENCHANTMENT, "n")).toEqual([]);

    get(match, "b").statuses.apply("guardian", 10, "b", NO_RANKS);
    expect(damageBy(stepFor(match, 0.5), SCOURGE_ENCHANTMENT, "b")).toEqual([63]);
  });

  it("describes it", () => {
    expect(describeStatus("scourge-enchantment")).toBe(
      "whenever it gains an enchantment, the caster of that enchantment takes 63 holy damage",
    );
  });
});

describe("Defile Defenses (#1403)", () => {
  it("deals 102 on the first block, by any stance, and ends", () => {
    const hexed = sim();
    cast(hexed, "n", 1, "b");
    expect(get(hexed, "b").statuses.get("defile-defenses")?.sourceId).toBe("n");

    const match = sim(caster("a", 0, [], vec2(170, 0)));
    const bearer = get(match, "n");
    bearer.statuses.apply("defile-defenses", 17, "a", NO_RANKS);
    bearer.statuses.apply("guardian", 30, "n", NO_RANKS);

    expect(match.requestAttack("a", "n")).toEqual({ ok: true });
    const log = stepFor(match, 12);
    const blocks = log
      .filter((entry) => entry.cause === "weapon" && entry.sourceId === "a")
      .flatMap((entry) => entry.events.filter((event) => event.kind === "attack-blocked"));
    expect(blocks.length).toBeGreaterThan(1);
    expect(damageBy(log, DEFILE_DEFENSES, "n")).toEqual([102]);
    expect(bearer.statuses.has("defile-defenses")).toBe(false);
  });

  it("describes it", () => {
    expect(describeStatus("defile-defenses")).toBe("takes 102 damage the next time it blocks");
  });
});

describe("Hex Breaker (#1403)", () => {
  it("stops the next hex, costs its caster 39 and ends; the spell's damage lands", () => {
    const match = sim();
    cast(match, "b", 0, "b", 0.5);
    expect(get(match, "b").statuses.has("hex-breaker")).toBe(true);

    const log = cast(match, "e", 0, "b");
    expect(get(match, "b").statuses.has("ice-spikes")).toBe(false);
    expect(get(match, "b").statuses.has("hex-breaker")).toBe(false);
    expect(damageBy(log, ICE_SPIKES, "b").length).toBe(1);
    expect(damageBy(log, HEX_BREAKER, "e")).toEqual([39]);
    expect(log.find((entry) => entry.skillId === HEX_BREAKER)?.sourceId).toBe("b");
    expect(
      log.some((entry) =>
        entry.events.some(
          (event) =>
            event.kind === "status-applied" &&
            event.targetId === "b" &&
            event.statusId === "ice-spikes",
        ),
      ),
    ).toBe(false);

    // Spent: the next one lands.
    stepFor(match, 10);
    cast(match, "e", 0, "b");
    expect(get(match, "b").statuses.has("ice-spikes")).toBe(true);
  });

  it("spares only its bearer from an area hex, and stops Soul Barbs, which never fires", () => {
    const match = sim();
    get(match, "ally").statuses.apply("hex-breaker", 65, "ally", NO_RANKS);
    get(match, "b").statuses.apply("hex-breaker", 65, "b", NO_RANKS);
    cast(match, "e", 0, "b");
    expect(get(match, "b").statuses.has("ice-spikes")).toBe(false);
    expect(get(match, "ally").statuses.has("ice-spikes")).toBe(false);

    const lone = sim();
    get(lone, "b").statuses.apply("hex-breaker", 65, "b", NO_RANKS);
    const log = cast(lone, "e", 0, "b");
    expect(get(lone, "b").statuses.has("ice-spikes")).toBe(false);
    expect(get(lone, "ally").statuses.has("ice-spikes")).toBe(true);
    expect(damageBy(log, HEX_BREAKER, "e")).toEqual([39]);

    const barbed = sim();
    get(barbed, "b").statuses.apply("soul-barbs", 30, "n", NO_RANKS);
    get(barbed, "b").statuses.apply("hex-breaker", 65, "b", NO_RANKS);
    expect(damageBy(cast(barbed, "e", 0, "b"), SOUL_BARBS, "b")).toEqual([]);

    const broken = sim();
    get(broken, "b").statuses.apply("hex-breaker", 65, "b", NO_RANKS);
    cast(broken, "n", 0, "b");
    expect(get(broken, "b").statuses.has("soul-barbs")).toBe(false);
  });

  it("describes it", () => {
    expect(describeStatus("hex-breaker")).toBe(
      "the next hex fails, and its caster takes 39 damage",
    );
  });
});
