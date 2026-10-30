import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import { describeStatus } from "../skills/describe.js";
import { weaponSnapshotOf } from "../skills/weapon-attack.js";
import { vec2, type Vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";

/**
 * Monk smiting staples (#1519), at rank 12 in Smiting Prayers: the "if
 * attacking" punishers, the knockdown signets, the touch strike, Word of
 * Censure's longer recharge on a foe below half health, Ray of
 * Judgment's pulse and Judge's Insight's holy, penetrating attacks.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const SMITE = "monk.smite";
const SPEAR_OF_LIGHT = "monk.spear-of-light";
const WORD_OF_CENSURE = "monk.word-of-censure";
const RAY_OF_JUDGMENT = "monk.ray-of-judgment";
const JUDGES_INSIGHT = "monk.judges-insight";
const BANE_SIGNET = "monk.bane-signet";
const CASTIGATION_SIGNET = "monk.castigation-signet";
const SIGNET_OF_JUDGMENT = "monk.signet-of-judgment";
const HOLY_STRIKE = "monk.holy-strike";
const BAR = [
  SMITE,
  SPEAR_OF_LIGHT,
  WORD_OF_CENSURE,
  RAY_OF_JUDGMENT,
  JUDGES_INSIGHT,
  BANE_SIGNET,
  CASTIGATION_SIGNET,
  SIGNET_OF_JUDGMENT,
];

/** Sturdy enough never to die here, unarmed: fists reach only the monk beside it. */
function fighter(id: string, team: number, skillBar: string[], spawn: Vec2): ParticipantSpec {
  return {
    id,
    team,
    skillBar,
    attributeRanks: new Map([["monk.smiting-prayers", 12]]),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 1000,
    spawn,
    facing: 0,
  };
}

/**
 * `m`, the monk, at the origin with `bar`; `ally` beside it. `f`, a foe
 * touching it, `n` adjacent to `f` but not to `m`, and `far` well away.
 */
function sim(bar: string[] = BAR): MatchSimulation {
  return new MatchSimulation({
    seed: "monk-smiting",
    participants: [
      fighter("m", 0, bar, vec2(0, 0)),
      fighter("ally", 0, [], vec2(0, -30)),
      fighter("f", 1, [], vec2(30, 0)),
      fighter("n", 1, [], vec2(30, 30)),
      fighter("far", 1, [], vec2(200, 0)),
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

/** `id` uses `skillId` from its bar on `targetId`, and what follows for `seconds`. */
function cast(
  match: MatchSimulation,
  skillId: string,
  targetId: string,
  seconds = 2,
  id = "m",
): CombatLogEntry[] {
  const slot = match.get(id)?.skillBar.indexOf(skillId) ?? -1;
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

/** `f` swings at the monk, standing, so it is attacking. */
function attacking(match: MatchSimulation): void {
  expect(match.requestAttack("f", "m")?.ok).toBe(true);
  stepFor(match, 0.1);
}

/** The damage `skillId` dealt to `targetId` in `log`, hit by hit. */
function hits(log: readonly CombatLogEntry[], skillId: string, targetId: string): number[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) =>
      event.kind === "damage" && event.targetId === targetId ? [event.amount] : [],
    );
}

function eventsOf(log: readonly CombatLogEntry[], skillId: string) {
  return log.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

describe("the Monk smiting staples (#1519)", () => {
  it("are the corpus's Smiting Prayers at its costs and times", () => {
    const rows: [string, string, boolean, number, number, number][] = [
      [SMITE, "spell", false, 10, 1, 10],
      [SPEAR_OF_LIGHT, "spell", false, 5, 1, 15],
      [WORD_OF_CENSURE, "spell", true, 10, 1, 2],
      [RAY_OF_JUDGMENT, "spell", true, 10, 1, 15],
      [JUDGES_INSIGHT, "enchantment", false, 10, 2, 10],
      [BANE_SIGNET, "signet", false, 0, 1, 15],
      [CASTIGATION_SIGNET, "signet", false, 0, 1, 15],
      [SIGNET_OF_JUDGMENT, "signet", true, 0, 1, 20],
      [HOLY_STRIKE, "skill", false, 5, 0.75, 8],
    ];
    for (const [id, type, elite, energy, activation, recharge] of rows) {
      const skill = getSkill(id);
      expect(skill, id).toMatchObject({
        type,
        elite,
        profession: "monk",
        attributeId: "monk.smiting-prayers",
        activationSeconds: activation,
        rechargeSeconds: recharge,
      });
      expect(skill?.cost, id).toEqual(
        energy === 0 ? undefined : { kind: "energy", amount: energy },
      );
    }
    expect(getSkill(SIGNET_OF_JUDGMENT)?.range).toBe(RANGE_SPELL / 2);
    expect(getSkill(SPEAR_OF_LIGHT)?.projectile).toBeDefined();
  });

  it("Smite: 46 holy, and 30 more on a foe attacking", () => {
    const idle = sim();
    expect(hits(cast(idle, SMITE, "f"), SMITE, "f")).toEqual([46]);

    const match = sim();
    attacking(match);
    expect(hits(cast(match, SMITE, "f"), SMITE, "f")).toEqual([46, 30]);
  });

  it("Spear of Light: flies, 50 holy, and 51 more on a foe attacking", () => {
    const idle = sim();
    expect(hits(cast(idle, SPEAR_OF_LIGHT, "f"), SPEAR_OF_LIGHT, "f")).toEqual([50]);

    const match = sim();
    attacking(match);
    expect(hits(cast(match, SPEAR_OF_LIGHT, "f"), SPEAR_OF_LIGHT, "f")).toEqual([50, 51]);
  });

  it("Word of Censure: 110 holy; 20 s more to recharge on a foe below half, read before the damage", () => {
    const match = sim();
    const foe = get(match, "f");
    foe.health = 0.4 * foe.maxHealth;
    const log = cast(match, WORD_OF_CENSURE, "f", 1.5);
    expect(hits(log, WORD_OF_CENSURE, "f")).toEqual([110]);
    expect(eventsOf(log, WORD_OF_CENSURE)).toContainEqual({
      kind: "recharge-lengthened",
      targetId: "m",
      skillId: WORD_OF_CENSURE,
      seconds: 20,
    });
    // 22 s in all, shown on the bar, half a second of it gone.
    const monk = get(match, "m");
    expect(monk.cast.rechargeTotal.get(WORD_OF_CENSURE)).toBe(22);
    expect(monk.cast.rechargeRemaining.get(WORD_OF_CENSURE)).toBeGreaterThan(21);

    // Recharged, the next use on a foe above half starts from 2 s again.
    stepFor(match, 22);
    foe.health = 0.6 * foe.maxHealth;
    cast(match, WORD_OF_CENSURE, "f", 1.5);
    expect(monk.cast.rechargeTotal.get(WORD_OF_CENSURE)).toBe(2);
  });

  it("Ray of Judgment: 42 holy and Burning each second for 5 s to foes adjacent to where it was cast", () => {
    const match = sim();
    // The first pulse lands with the cast; then the foe walks off, and
    // the circle stays where it stood.
    const log = cast(match, RAY_OF_JUDGMENT, "f", 1.05);
    expect(hits(log, RAY_OF_JUDGMENT, "f")).toEqual([42]);
    match.walkTo("f", vec2(30, -400));
    log.push(...stepFor(match, 6));
    expect(hits(log, RAY_OF_JUDGMENT, "n")).toEqual([42, 42, 42, 42, 42]);
    expect(hits(log, RAY_OF_JUDGMENT, "f").length).toBeLessThan(5);
    expect(hits(log, RAY_OF_JUDGMENT, "far")).toEqual([]);
    expect(hits(log, RAY_OF_JUDGMENT, "m")).toEqual([]);
    expect(eventsOf(log, RAY_OF_JUDGMENT)).toContainEqual({
      kind: "status-applied",
      targetId: "n",
      statusId: "burning",
      durationSeconds: 3,
    });
  });

  it("Judge's Insight: 18 s on an ally, whose attacks deal holy damage at 20% armor penetration", () => {
    const match = sim();
    cast(match, JUDGES_INSIGHT, "ally", 2.5);
    const ally = get(match, "ally");
    expect(ally.statuses.get("judges-insight")?.durationSeconds).toBe(18);
    expect(weaponSnapshotOf(ally)).toMatchObject({ damageType: "holy", armorPenetration: 0.2 });
    expect(weaponSnapshotOf(get(match, "m"))).toMatchObject({ armorPenetration: 0 });
    expect(describeStatus("judges-insight")).toBe(
      "attacks deal holy damage, attacks have 20% armor penetration",
    );
  });

  it("Bane Signet: 54 holy; knocks down a foe attacking, not one idle", () => {
    const idle = sim();
    const quiet = cast(idle, BANE_SIGNET, "f");
    expect(hits(quiet, BANE_SIGNET, "f")).toEqual([54]);
    expect(eventsOf(quiet, BANE_SIGNET).some((event) => event.kind === "knocked-down")).toBe(false);

    const match = sim();
    attacking(match);
    const log = cast(match, BANE_SIGNET, "f", 1.1);
    expect(hits(log, BANE_SIGNET, "f")).toEqual([54]);
    expect(eventsOf(log, BANE_SIGNET)).toContainEqual({
      kind: "knocked-down",
      targetId: "f",
      durationSeconds: 2,
    });
    // The knockdown cut the swing short.
    expect(get(match, "f").knockdownRemaining).toBeGreaterThan(0);
  });

  it("Castigation Signet: 50 holy; 12 energy to the monk off a foe attacking", () => {
    const idle = sim();
    get(idle, "m").energy = 0;
    const quiet = cast(idle, CASTIGATION_SIGNET, "f");
    expect(hits(quiet, CASTIGATION_SIGNET, "f")).toEqual([50]);
    expect(eventsOf(quiet, CASTIGATION_SIGNET).some((event) => event.kind === "energy-gain")).toBe(
      false,
    );

    const match = sim();
    attacking(match);
    get(match, "m").energy = 0;
    const log = cast(match, CASTIGATION_SIGNET, "f");
    expect(eventsOf(log, CASTIGATION_SIGNET)).toContainEqual({
      kind: "energy-gain",
      targetId: "m",
      amount: 12,
    });
  });

  it("Signet of Judgment (PvP): knocks down its target, 41 holy to it and each foe adjacent", () => {
    const match = sim();
    const log = cast(match, SIGNET_OF_JUDGMENT, "f", 1.1);
    expect(eventsOf(log, SIGNET_OF_JUDGMENT)).toContainEqual({
      kind: "knocked-down",
      targetId: "f",
      durationSeconds: 2,
    });
    expect(hits(log, SIGNET_OF_JUDGMENT, "f")).toEqual([41]);
    expect(hits(log, SIGNET_OF_JUDGMENT, "n")).toEqual([41]);
    expect(hits(log, SIGNET_OF_JUDGMENT, "far")).toEqual([]);
  });

  it("Holy Strike: a touch for 46 holy, and 46 more after Signet of Judgment knocked the foe down", () => {
    const touch = sim([HOLY_STRIKE, SIGNET_OF_JUDGMENT]);
    expect(hits(cast(touch, HOLY_STRIKE, "f", 1), HOLY_STRIKE, "f")).toEqual([46]);

    const match = sim([HOLY_STRIKE, SIGNET_OF_JUDGMENT]);
    cast(match, SIGNET_OF_JUDGMENT, "f", 1.1);
    expect(get(match, "f").knockdownRemaining).toBeGreaterThan(0);
    expect(hits(cast(match, HOLY_STRIKE, "f", 1.6), HOLY_STRIKE, "f")).toEqual([46, 46]);
  });
});
