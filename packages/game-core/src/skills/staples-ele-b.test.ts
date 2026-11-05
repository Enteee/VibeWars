import { describe, expect, it } from "vitest";

import { RANGE_MELEE, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { effectiveArmor, skillDamage } from "./damage.js";
import { describeStatus } from "./describe.js";
import { NO_RANKS } from "./status.js";
import { rankOf } from "./tick.js";
import type { Combatant } from "./types.js";

/**
 * Elementalist staples (#2289): Armor of Frost, Phoenix, Incendiary
 * Bonds, Stone Daggers, Star Burst and Rust, each scaled number at rank
 * 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R12 = new Map([
  ["elementalist.fire-magic", 12],
  ["elementalist.water-magic", 12],
  ["elementalist.earth-magic", 12],
]);
const R0: ReadonlyMap<string, number> = new Map();

const FROST = "elementalist.armor-of-frost";
const PHOENIX = "elementalist.phoenix";
const BONDS = "elementalist.incendiary-bonds";
const DAGGERS = "elementalist.stone-daggers";
const STAR = "elementalist.star-burst";
const RUST = "elementalist.rust";
const SIGNET = "dervish.signet-of-pious-light";
const RES = "common.resurrection-signet";

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
 * `c`, the Elementalist of team 0, with `bar` at `ranks`, at hand of
 * `foe`; `ally` near `foe`, `allyFar` well away. `foe` and `foe2`, of
 * team 1, adjacent, each with a one-second signet, `foe` with
 * Resurrection Signet too; `foeFar` beyond every area; `foeBody` near
 * `foe`, for a test to kill.
 */
function arena(bar: readonly string[], ranks: ReadonlyMap<string, number> = R12) {
  const signet = new Map([["dervish.earth-prayers", 12]]);
  return new MatchSimulation({
    seed: "staples-ele-b",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("ally", 0, vec2(30, 50), [], R0),
      spec("allyFar", 0, vec2(-300, 0), [], R0),
      spec("foe", 1, vec2(30, 0), [SIGNET, RES], signet),
      spec("foe2", 1, vec2(60, 0), [SIGNET], signet),
      spec("foeFar", 1, vec2(-200, -150), [], R0),
      spec("foeBody", 1, vec2(30, -45), [], R0),
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

/** `id` dies within a step, to a burn of `c`'s; the log a few steps on. */
function kill(match: MatchSimulation, id: string): CombatLogEntry[] {
  const victim = get(match, id);
  victim.statuses.apply("burning", 10, "c", NO_RANKS);
  victim.health = 0.2;
  const log = stepFor(match, 4 * DT);
  expect(victim.dead).toBe(true);
  return log;
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
  seconds = 3,
): CombatLogEntry[] {
  match.setTarget(id, targetId);
  expect(match.requestSkill(id, slot)?.check).toEqual({ ok: true });
  return stepFor(match, seconds);
}

function eventsOf(entries: readonly CombatLogEntry[], skillId: string) {
  return entries.filter((entry) => entry.skillId === skillId).flatMap((entry) => entry.events);
}

/** The damage `skillId` dealt each of `ids`, in that order; 0 for none. */
function damageTo(
  entries: readonly CombatLogEntry[],
  skillId: string,
  ids: readonly string[],
): number[] {
  const events = eventsOf(entries, skillId);
  return ids.map((id) =>
    events
      .filter((event) => event.kind === "damage")
      .filter((event) => event.targetId === id)
      .reduce((sum, event) => sum + event.amount, 0),
  );
}

describe("the six are the corpus's (#2289)", () => {
  it.each([
    [FROST, 206, "enchantment", false, 5, 1, 20, 0, "self"],
    [PHOENIX, 193, "spell", false, 10, 1.5, 7, 0, "single-enemy"],
    [BONDS, 179, "hex", false, 10, 1, 7, 5, "single-enemy"],
    [DAGGERS, 172, "spell", false, 5, 1, 0, 0, "single-enemy"],
    [STAR, 1095, "spell", true, 5, 0.75, 7, 0, "single-enemy"],
    [RUST, 204, "hex", false, 10, 1, 8, 0, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, overcast, target) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        overcast,
        range: id === STAR ? RANGE_MELEE : RANGE_SPELL,
        target,
      });
    },
  );

  it("Star Burst is a touch spell", () => {
    expect(getSkill(STAR)?.touch).toBe(true);
  });
});

describe("Armor of Frost (#2289)", () => {
  it.each([
    ["rank 12", R12, 29, 13],
    ["rank 0", R0, 10, 1],
  ])("at %s, lasts its seconds and adds 1 Water Magic", (_, ranks, seconds, water) => {
    const match = arena([FROST], ranks);
    cast(match, "c", 0, "c", 1.05);
    const c = get(match, "c");
    expect(c.statuses.get("armor-of-frost")?.durationSeconds).toBe(seconds);
    expect(rankOf(c, "elementalist.water-magic")).toBe(water);
  });

  it("adds 40 armor against physical damage only", () => {
    const match = arena([FROST]);
    const c = get(match, "c");
    const blade = skillDamage(40, "slashing", 0);
    const fire = skillDamage(40, "fire", 0);
    const [bladeBefore, fireBefore] = [
      effectiveArmor(c, blade, null),
      effectiveArmor(c, fire, null),
    ];
    cast(match, "c", 0, "c", 1.05);
    expect(effectiveArmor(c, blade, null) - bladeBefore).toBe(40);
    expect(effectiveArmor(c, fire, null)).toBe(fireBefore);
  });
});

describe("Phoenix (#2289)", () => {
  it.each([
    ["rank 12", R12, 50],
    ["rank 0", R0, 10],
  ])("at %s, strikes the target and foes near it, none farther", (_, ranks, amount) => {
    const match = arena([PHOENIX], ranks);
    const log = cast(match, "c", 0, "foe");
    const [foe, foe2, far] = damageTo(log, PHOENIX, ["foe", "foe2", "foeFar"]);
    expect([foe, foe2, far]).toEqual([amount, amount, 0]);
  });

  it.each([
    ["rank 12", R12, 68],
    ["rank 0", R0, 20],
  ])("Overcast at %s, heals allies near the target; none far", (_, ranks, amount) => {
    const match = arena([PHOENIX], ranks);
    const c = get(match, "c");
    c.overcast = 5;
    get(match, "ally").health = 5e4;
    get(match, "allyFar").health = 5e4;
    const heals = eventsOf(cast(match, "c", 0, "foe"), PHOENIX).filter(
      (event) => event.kind === "heal",
    );
    expect(heals).toContainEqual({ kind: "heal", targetId: "ally", amount });
    expect(heals.some((event) => event.targetId === "allyFar")).toBe(false);
  });

  it("heals nobody when not Overcast", () => {
    const match = arena([PHOENIX]);
    get(match, "ally").health = 5e4;
    const log = cast(match, "c", 0, "foe");
    expect(eventsOf(log, PHOENIX).filter((event) => event.kind === "heal")).toEqual([]);
  });
});

describe("Incendiary Bonds (#2289)", () => {
  it.each([
    ["rank 12", R12, 3],
    ["rank 0", R0, 1],
  ])("at %s, after 3 s burns the bearer and nearby foes", (_, ranks, burning) => {
    const match = arena([BONDS], ranks);
    cast(match, "c", 0, "foe", 1.05);
    expect(get(match, "foe").statuses.get("incendiary-bonds")?.durationSeconds).toBe(3);
    expect(get(match, "foe").statuses.has("burning")).toBe(false);
    const log = stepFor(match, 3);
    const [foe, foe2, far] = damageTo(log, BONDS, ["foe", "foe2", "foeFar"]);
    expect(foe).toBeGreaterThan(0);
    expect(foe2).toBe(foe);
    expect(far).toBe(0);
    expect(get(match, "foe").statuses.get("burning")?.durationSeconds).toBe(burning);
    expect(get(match, "foe2").statuses.has("burning")).toBe(true);
    expect(get(match, "foeFar").statuses.has("burning")).toBe(false);
  });

  it.each([
    ["rank 12", R12, 68],
    ["rank 0", R0, 20],
  ])("at %s, strikes for the corpus's number", (_, ranks, amount) => {
    const match = arena([BONDS], ranks);
    cast(match, "c", 0, "foe", 1.05);
    expect(damageTo(stepFor(match, 3), BONDS, ["foe", "foe2"])).toEqual([amount, amount]);
  });

  it("strikes at once if its bearer dies", () => {
    const match = arena([BONDS]);
    cast(match, "c", 0, "foe", 1.05);
    const log = kill(match, "foe");
    expect(damageTo(log, BONDS, ["foe2"])[0]).toBeGreaterThan(0);
    expect(get(match, "foe2").statuses.has("burning")).toBe(true);
  });

  it("says it strikes on expiry, or at once on a death", () => {
    expect(describeStatus("incendiary-bonds")).toMatch(
      /^when it expires, or at once if target foe dies while hexed with this, target and nearby foes take 20 fire damage/,
    );
  });

  it("does nothing if removed early", () => {
    const match = arena([BONDS]);
    cast(match, "c", 0, "foe", 1.05);
    get(match, "foe").statuses.remove("incendiary-bonds");
    const log = stepFor(match, 3);
    expect(damageTo(log, BONDS, ["foe", "foe2"])).toEqual([0, 0]);
    expect(get(match, "foe2").statuses.has("burning")).toBe(false);
  });
});

describe("Stone Daggers (#2289)", () => {
  it("sends two daggers, each striking", () => {
    const match = arena([DAGGERS]);
    const log = cast(match, "c", 0, "foe");
    const hits = eventsOf(log, DAGGERS).filter(
      (event) => event.kind === "damage" && event.targetId === "foe",
    );
    expect(hits).toHaveLength(2);
    expect(get(match, "foe").statuses.has("bleeding")).toBe(false);
  });

  it.each([
    ["rank 12", R12, 28],
    ["rank 0", R0, 8],
  ])("at %s, each strikes for the corpus's number", (_, ranks, amount) => {
    const log = cast(arena([DAGGERS], ranks), "c", 0, "foe");
    expect(damageTo(log, DAGGERS, ["foe"])).toEqual([2 * amount]);
  });

  it.each([
    ["rank 12", R12, 4],
    ["rank 0", R0, 1],
  ])("Overcast at %s, each dagger causes Bleeding", (_, ranks, seconds) => {
    const match = arena([DAGGERS], ranks);
    get(match, "c").overcast = 5;
    const log = cast(match, "c", 0, "foe", 1.2);
    const bleeds = eventsOf(log, DAGGERS).filter(
      (event) => event.kind === "status-applied" && event.targetId === "foe",
    );
    expect(bleeds).toHaveLength(2);
    expect(get(match, "foe").statuses.get("bleeding")?.durationSeconds).toBe(seconds);
  });
});

describe("Star Burst (#2289)", () => {
  it.each([
    ["rank 12", R12, 3],
    ["rank 0", R0, 1],
  ])("at %s, strikes foes in the area and burns them", (_, ranks, seconds) => {
    const match = arena([STAR], ranks);
    const log = cast(match, "c", 0, "foe", 1);
    const [foe, foe2, far] = damageTo(log, STAR, ["foe", "foe2", "foeFar"]);
    expect(foe).toBeGreaterThan(0);
    expect(foe2).toBe(foe);
    expect(far).toBe(0);
    expect(get(match, "foe").statuses.get("burning")?.durationSeconds).toBe(seconds);
    expect(get(match, "foe2").statuses.has("burning")).toBe(true);
  });

  it.each([
    ["rank 12", R12, 91],
    ["rank 0", R0, 7],
  ])("at %s, strikes for the corpus's number", (_, ranks, amount) => {
    const log = cast(arena([STAR], ranks), "c", 0, "foe", 1);
    expect(damageTo(log, STAR, ["foe", "foe2"])).toEqual([amount, amount]);
  });

  it.each([
    ["three foes", "foe", 6],
    ["the target alone", "foeFar", 2],
  ])("gives 2 Energy for each foe struck: %s", (_, target, gained) => {
    const match = arena([STAR]);
    get(match, "c").energy = 50;
    // Far: it walks to touch, then casts.
    const log = cast(match, "c", 0, target, 6);
    const gains = eventsOf(log, STAR)
      .filter((event) => event.kind === "energy-gain")
      .reduce((sum, event) => sum + event.amount, 0);
    expect(gains).toBe(gained);
  });
});

describe("Rust (#2289)", () => {
  it.each([
    ["rank 12", R12, 17],
    ["rank 0", R0, 5],
  ])("at %s, hexes the target and adjacent foes", (_, ranks, seconds) => {
    const match = arena([RUST], ranks);
    const log = cast(match, "c", 0, "foe", 1.05);
    const [foe, foe2, far] = damageTo(log, RUST, ["foe", "foe2", "foeFar"]);
    expect(foe).toBeGreaterThan(0);
    expect(foe2).toBe(foe);
    expect(far).toBe(0);
    expect(get(match, "foe").statuses.get("rust")?.durationSeconds).toBe(seconds);
    expect(get(match, "foe2").statuses.has("rust")).toBe(true);
    expect(get(match, "foeFar").statuses.has("rust")).toBe(false);
  });

  it.each([
    ["rank 12", R12, 70],
    ["rank 0", R0, 10],
  ])("at %s, strikes for the corpus's number", (_, ranks, amount) => {
    const log = cast(arena([RUST], ranks), "c", 0, "foe", 1.05);
    expect(damageTo(log, RUST, ["foe", "foe2"])).toEqual([amount, amount]);
  });

  it("says signets take twice as long", () => {
    expect(describeStatus("rust")).toBe("your signets take 2× as long to cast");
  });

  it("doubles a hexed foe's signet activation", () => {
    const match = arena([RUST]);
    cast(match, "c", 0, "foe", 1.05);
    match.setTarget("foe", "foe2");
    expect(match.requestSkill("foe", 0)?.check).toEqual({ ok: true });
    stepFor(match, DT);
    expect(get(match, "foe").cast.activeCast?.totalSeconds).toBe(2);
  });

  it.each([
    ["rank 12", R12, 8],
    ["rank 0", R0, 1],
  ])("Overcast at %s, interrupts a signet and disables it", (_, ranks, seconds) => {
    const match = arena([RUST], ranks);
    get(match, "c").overcast = 5;
    match.setTarget("c", "foe");
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
    // The foe starts raising its dead as Rust is half cast: a signet
    // that never recharges, so what waits after is the disable alone.
    kill(match, "foeBody");
    stepFor(match, 0.5 - 4 * DT);
    match.setTarget("foe", "foeBody");
    expect(match.requestSkill("foe", 1)?.check).toEqual({ ok: true });
    const log = stepFor(match, 0.6);
    const events = eventsOf(log, RUST);
    expect(events).toContainEqual({ kind: "interrupted", targetId: "foe", skillId: RES });
    expect(events.some((event) => event.kind === "interrupted" && event.targetId === "foe2")).toBe(
      false,
    );
    expect(Math.round(get(match, "foe").cast.rechargeRemaining.get(RES) ?? 0)).toBe(seconds);
  });

  it("leaves a foe casting no signet alone, Overcast or not", () => {
    const match = arena([RUST]);
    get(match, "c").overcast = 5;
    const log = cast(match, "c", 0, "foe", 1.05);
    expect(eventsOf(log, RUST).filter((event) => event.kind === "interrupted")).toEqual([]);
  });
});
