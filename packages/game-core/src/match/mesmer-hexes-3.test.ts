import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { describeStatus } from "../skills/describe.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const GUILT = "mesmer.guilt";
const SHAME = "mesmer.shame";
const MISTRUST = "mesmer.mistrust";
const FRAGILITY = "mesmer.fragility";
const BARBS = "necromancer.barbs";
const ORISON = "monk.orison-of-healing";
const ARMOR_OF_EARTH = "elementalist.armor-of-earth";
const BARBED_SIGNET = "necromancer.barbed-signet";

/** A rank-12 caster of `team` with `skillBar`, sturdy enough never to die here. */
function caster(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([
      ["mesmer.domination-magic", 12],
      ["mesmer.illusion-magic", 12],
      ["necromancer.curses", 12],
      ["monk.healing-prayers", 12],
      ["elementalist.earth-magic", 12],
    ]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/**
 * `b`, of team 0, the bearer, who casts a hex on a foe, a heal on an ally,
 * a "you" spell and a signet on a foe; `ally` beside it and `near` beside
 * `ally`. `m`, the Mesmer of team 1, and `f`, its ally, across from them.
 */
function sim(): MatchSimulation {
  return new MatchSimulation({
    seed: "mesmer-hexes-3",
    participants: [
      caster("b", 0, [BARBS, ORISON, ARMOR_OF_EARTH, BARBED_SIGNET], vec2(0, 0)),
      caster("ally", 0, [], vec2(0, 30)),
      caster("far", 0, [], vec2(0, -900)),
      caster("m", 1, [GUILT, SHAME, MISTRUST, FRAGILITY], vec2(200, 0)),
      caster("f", 1, [], vec2(200, 40)),
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

/** The events of `entries` credited to `skillId`. */
function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

describe("the next spell fails (#1475)", () => {
  it("Guilt fails a hex on a foe: paid for, recharging, and 12 energy stolen", () => {
    const match = sim();
    cast(match, "m", 0, "b");
    const bearer = get(match, "b");
    expect(bearer.statuses.has("guilt")).toBe(true);
    get(match, "m").energy = 100;

    const log = cast(match, "b", 0, "m");
    expect(eventsOf(log, GUILT)).toEqual([
      { kind: "spell-failed", targetId: "b", skillId: BARBS },
      { kind: "energy-loss", targetId: "b", amount: 12 },
      { kind: "energy-gain", targetId: "m", amount: 12 },
    ]);
    expect(log.find((entry) => entry.skillId === GUILT)?.sourceId).toBe("m");
    // Nothing of Barbs landed, and Barbs recharges.
    expect(eventsOf(log, BARBS)).toEqual([]);
    expect(get(match, "m").statuses.has("barbs")).toBe(false);
    expect(bearer.cast.rechargeRemaining.get(BARBS)).toBeGreaterThan(0);
    expect(bearer.statuses.has("guilt")).toBe(false);
  });

  it("Guilt lets a heal on an ally, a 'you' spell and a signet on a foe through, and stays", () => {
    const match = sim();
    cast(match, "m", 0, "b");
    const bearer = get(match, "b");

    // Within Guilt's 6 s: each goes off and its aftercast ends.
    cast(match, "b", 1, "ally", 1.8);
    cast(match, "b", 2, "b", 1.55);
    const signet = cast(match, "b", 3, "m", 1.1);
    expect(eventsOf(signet, BARBED_SIGNET)).toContainEqual(
      expect.objectContaining({ kind: "status-applied", targetId: "m", statusId: "bleeding" }),
    );
    expect(bearer.statuses.has("armor-boost")).toBe(true);
    expect(bearer.statuses.has("guilt")).toBe(true);
  });

  it("Shame fails a heal on an ally, and one the bearer casts on itself", () => {
    const match = sim();
    cast(match, "m", 1, "b");
    const onAlly = cast(match, "b", 1, "ally", 1.2);
    expect(eventsOf(onAlly, SHAME)[0]).toEqual({
      kind: "spell-failed",
      targetId: "b",
      skillId: ORISON,
    });
    expect(eventsOf(onAlly, ORISON)).toEqual([]);
    expect(get(match, "b").statuses.has("shame")).toBe(false);

    stepFor(match, 30);
    cast(match, "m", 1, "b");
    const onSelf = cast(match, "b", 1, "b", 1.2);
    expect(eventsOf(onSelf, SHAME)[0]).toEqual({
      kind: "spell-failed",
      targetId: "b",
      skillId: ORISON,
    });
  });

  it("Shame lets a hex on a foe through", () => {
    const match = sim();
    cast(match, "m", 1, "b");
    cast(match, "b", 0, "m");
    expect(get(match, "m").statuses.has("barbs")).toBe(true);
    expect(get(match, "b").statuses.has("shame")).toBe(true);
  });

  it("Mistrust deals 50 to the bearer and 38 to foes near it", () => {
    const match = sim();
    cast(match, "m", 2, "b");
    const log = cast(match, "b", 0, "m");
    expect(eventsOf(log, MISTRUST)).toEqual([
      { kind: "spell-failed", targetId: "b", skillId: BARBS },
      expect.objectContaining({ kind: "damage", targetId: "b", amount: 50 }),
      expect.objectContaining({ kind: "damage", targetId: "ally", amount: 38 }),
    ]);
  });

  it("with Guilt and Mistrust, the newest catches the spell and the other stays", () => {
    const match = sim();
    cast(match, "m", 0, "b");
    cast(match, "m", 2, "b");
    const log = cast(match, "b", 0, "m");
    expect(eventsOf(log, MISTRUST)[0]?.kind).toBe("spell-failed");
    expect(eventsOf(log, GUILT)).toEqual([]);
    expect(get(match, "b").statuses.has("guilt")).toBe(true);
    expect(get(match, "b").statuses.has("mistrust")).toBe(false);
  });

  it("describes them", () => {
    expect(describeStatus("guilt")).toBe(
      "the next spell it casts at a foe fails: steals up to 12 energy",
    );
    expect(describeStatus("shame")).toBe(
      "the next spell it casts at an ally fails: steals up to 12 energy",
    );
    expect(describeStatus("mistrust")).toBe(
      "the next spell it casts at a foe fails: deals 50 damage, nearby foes take 38 damage",
    );
  });
});

describe("Fragility (#1475)", () => {
  it("hexes the target and the foes adjacent to it", () => {
    const match = sim();
    cast(match, "m", 3, "b");
    expect(get(match, "b").statuses.has("fragility")).toBe(true);
    expect(get(match, "ally").statuses.has("fragility")).toBe(true);
    expect(get(match, "far").statuses.has("fragility")).toBe(false);
  });

  it("deals 17 for a new condition and for each one lost, not for a refresh", () => {
    const match = sim();
    cast(match, "m", 3, "b");
    const bearer = get(match, "b");
    const damage = (entries: readonly CombatLogEntry[]): number[] =>
      eventsOf(entries, FRAGILITY).flatMap((event) =>
        event.kind === "damage" && event.targetId === "b" ? [event.amount] : [],
      );

    bearer.statuses.apply("bleeding", 3, "f", NO_RANKS);
    expect(damage(stepFor(match, 0.25))).toEqual([17]);
    // Already bleeding: no gain, and the old one's end is no loss.
    bearer.statuses.apply("bleeding", 5, "f", NO_RANKS);
    expect(damage(stepFor(match, 0.25))).toEqual([]);

    bearer.statuses.apply("poison", 10, "f", NO_RANKS);
    bearer.statuses.apply("weakness", 10, "f", NO_RANKS);
    stepFor(match, 0.25);
    expect(bearer.statuses.removeByCategory("condition", 3)).toHaveLength(3);
    expect(damage(stepFor(match, 0.25))).toEqual([17, 17, 17]);

    bearer.statuses.apply("blind", 0.5, "f", NO_RANKS);
    stepFor(match, 0.25);
    expect(damage(stepFor(match, 0.5))).toEqual([17]);
  });

  it("describes it", () => {
    expect(describeStatus("fragility")).toBe(
      "takes 17 damage whenever it gains a new condition or loses a condition",
    );
  });
});
