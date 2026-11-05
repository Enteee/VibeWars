import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applyEffects, withPerCount, type CombatEvent } from "./effects.js";
import { NO_RANKS, StatusSet } from "./status.js";
import { makeCombatant } from "./testing.js";
import { maintainedEnchantments, upkeepPips } from "./tick.js";
import type { AttackWeaponClass, Combatant, Skill, SkillEffect } from "./types.js";

/**
 * Six staples, each on one small primitive (#2321): Rising Bile's
 * held-seconds end count, Doom's recharging binding rituals, Grenth's
 * Balance's health balance, Nature's Renewal's upkeep multiplier,
 * Equinox's Overcast surcharge and Archer's Signet's bow condition
 * duration. Every scaled number at rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const R0: ReadonlyMap<string, number> = new Map();

const BILE = "necromancer.rising-bile";
const DOOM = "ritualist.doom";
const BALANCE = "necromancer.grenths-balance";
const RENEWAL = "ranger.natures-renewal";
const EQUINOX = "ranger.equinox";
const ARCHERS = "ranger.archers-signet";
const PAIN = "ritualist.pain";
const SHADOWSONG = "ritualist.shadowsong";
const RECUPERATION = "ritualist.recuperation";
const FLARE = "elementalist.flare";
const ICY_PRISM = "elementalist.icy-prism";
const GLYPH_OF_ENERGY = "elementalist.glyph-of-energy";
const GUARDIAN = "monk.guardian";
const MENDING = "monk.mending";

const DEATH = (rank: number) => new Map([["necromancer.death-magic", rank]]);
const SPAWNING = (rank: number) => new Map([["ritualist.spawning-power", rank]]);
const WILDERNESS = (rank: number) => new Map([["ranger.wilderness-survival", rank]]);

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
 * `c` of team 0 with `bar` at `ranks`, `c2` beside it with the same; `foe`
 * of team 1 at hand, with `foeBar`; `foeAlly` 60 beside it, in its area;
 * `far` of team 1, out of every spirit's range.
 */
function arena(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  foeBar: readonly string[] = [],
  foeRanks: ReadonlyMap<string, number> = R0,
) {
  return new MatchSimulation({
    seed: "mech-2321",
    participants: [
      spec("c", 0, vec2(0, 0), bar, ranks),
      spec("c2", 0, vec2(0, 30), bar, ranks),
      spec("foe", 1, vec2(30, 0), foeBar, foeRanks),
      spec("foeAlly", 1, vec2(90, 0), [], R0),
      spec("far", 1, vec2(3000, 0), foeBar, foeRanks),
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

/** The damage `skillId` dealt `targetId`, each packet. */
function damageTo(entries: readonly CombatLogEntry[], skillId: string, targetId: string) {
  return entries
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .filter((event) => event.kind === "damage" && event.targetId === targetId)
    .map((event) => (event.kind === "damage" ? event.amount : 0));
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** The spirit `ownerId` made. */
function spiritOf(match: MatchSimulation, ownerId: string) {
  const spirit = [...match.participants()].find(
    (other) => other.creature?.kind === "spirit" && other.creature.ownerId === ownerId,
  );
  if (spirit === undefined) {
    throw new Error(`no spirit of ${ownerId}`);
  }
  return spirit;
}

describe("the six are the corpus's (#2321)", () => {
  it.each([
    [BILE, 935, "hex", false, 10, 1, 20, "single-enemy"],
    [DOOM, 1264, "spell", false, 10, 1, 8, "single-enemy"],
    [BALANCE, 86, "spell", true, 10, 0.25, 10, "single-enemy"],
    [RENEWAL, 476, "nature-ritual", false, 5, 2, 60, "self"],
    [EQUINOX, 1212, "nature-ritual", true, 10, 2, 15, "self"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, energy, activationSeconds, rechargeSeconds, target) => {
      expect(getSkill(id)).toMatchObject({
        gwId,
        type,
        elite,
        cost: { kind: "energy", amount: energy },
        activationSeconds,
        rechargeSeconds,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("Archer's Signet is a free elite signet", () => {
    expect(getSkill(ARCHERS)).toMatchObject({
      gwId: 1200,
      type: "signet",
      elite: true,
      cost: undefined,
      activationSeconds: 1,
      rechargeSeconds: 12,
      target: "self",
    });
  });

  it("Grenth's Balance has no attribute", () => {
    expect(getSkill(BALANCE)?.attributeId).toBeUndefined();
  });
});

describe("Rising Bile (#2321)", () => {
  it.each([
    [12, 5],
    [0, 1],
  ])(
    "at Death Magic %i deals %i a second held to the foe and its neighbour at expiry",
    (rank, perSecond) => {
      const match = arena([BILE], DEATH(rank));
      const log = cast(match, "c", 0, "foe", 23);
      expect(get(match, "foe").statuses.has("rising-bile")).toBe(false);
      expect(damageTo(log, BILE, "foe")).toEqual([20 * perSecond]);
      expect(damageTo(log, BILE, "foeAlly")).toEqual([20 * perSecond]);
      // Its caster's own side takes none.
      expect(damageTo(log, BILE, "c2")).toEqual([]);
    },
  );

  it("removed after 7.5 s counts 7 whole seconds", () => {
    const match = arena([BILE], DEATH(12));
    cast(match, "c", 0, "foe", 1);
    expect(get(match, "foe").statuses.has("rising-bile")).toBe(true);
    const landed = get(match, "foe").statuses.get("rising-bile");
    stepFor(match, 7.5 - (20 - (landed?.remainingSeconds ?? 0)));
    get(match, "foe").statuses.remove("rising-bile");
    const log = stepFor(match, 0.5);
    expect(damageTo(log, BILE, "foe")).toEqual([35]);
    expect(damageTo(log, BILE, "foeAlly")).toEqual([35]);
  });

  it("the bearer's death bursts on those near, not on the corpse", () => {
    const match = arena([BILE, FLARE], new Map([...DEATH(12), ["elementalist.fire-magic", 12]]));
    cast(match, "c", 0, "foe", 1);
    const held = get(match, "foe").statuses.get("rising-bile");
    stepFor(match, 4 - (20 - (held?.remainingSeconds ?? 0)));
    get(match, "foe").health = 1;
    const log = cast(match, "c", 1, "foe", 2);
    expect(get(match, "foe").dead).toBe(true);
    expect(damageTo(log, BILE, "foe")).toEqual([]);
    // Flare's second of activation: 5 whole seconds held.
    expect(damageTo(log, BILE, "foeAlly")).toEqual([25]);
  });

  it("a second Necromancer's cast on the hexed foe changes nothing", () => {
    const match = arena([BILE], DEATH(12));
    cast(match, "c", 0, "foe", 1);
    stepFor(match, 5);
    const before = get(match, "foe").statuses.get("rising-bile");
    const remaining = before?.remainingSeconds ?? 0;
    cast(match, "c2", 0, "foe", 2);
    const after = get(match, "foe").statuses.get("rising-bile");
    expect(after?.sourceId).toBe("c");
    expect(after?.remainingSeconds).toBeCloseTo(remaining - 2, 5);
    // Still 20 whole seconds from the first cast.
    const log = stepFor(match, 15);
    expect(damageTo(log, BILE, "foe")).toEqual([100]);
  });

  it("says what it does", () => {
    expect(
      describeSkill(skill(BILE), DEATH(12))
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("for each second it was in effect");
  });
});

describe("ignoresReapplication (#2321)", () => {
  it("leaves a status that ignores it as it is, and refreshes one that does not", () => {
    const set = new StatusSet();
    set.apply("rising-bile", 20, "a", NO_RANKS);
    set.advance(5, false);
    expect(set.apply("rising-bile", 20, "b", NO_RANKS)).toBe(false);
    expect(set.get("rising-bile")).toMatchObject({ sourceId: "a", remainingSeconds: 15 });
    set.apply("bleeding", 10, "a", NO_RANKS);
    set.advance(5, false);
    set.apply("bleeding", 10, "b", NO_RANKS);
    expect(set.get("bleeding")).toMatchObject({ sourceId: "b", remainingSeconds: 10 });
  });
});

describe("held-seconds (#2321)", () => {
  it("counts 0 outside an end trigger", () => {
    const caster = makeCombatant({ id: "c" });
    const per = { count: { kind: "held-seconds" }, amount: { flat: 5 }, max: undefined } as const;
    expect(withPerCount(0, per, caster, caster, { surroundings: new Map() }, [])).toBe(0);
    expect(
      withPerCount(0, per, caster, caster, { surroundings: new Map(), heldSeconds: 3 }, []),
    ).toBe(15);
  });

  it("is carried on the ended record, whole seconds", () => {
    const set = new StatusSet();
    set.apply("rising-bile", 20, "a", NO_RANKS);
    set.drainChanges();
    set.advance(3.9, false);
    set.remove("rising-bile");
    expect(set.drainChanges()).toEqual([
      expect.objectContaining({ kind: "ended", heldSeconds: 3 }),
    ]);
  });
});

describe("Doom (#2321)", () => {
  /** `c`, a Ritualist with Doom and three binding rituals, `recharging` of them recharging. */
  function ritualist(rank: number, recharging: readonly string[]) {
    const match = arena([DOOM, PAIN, SHADOWSONG, RECUPERATION, FLARE], SPAWNING(rank));
    for (const id of recharging) {
      get(match, "c").cast.startRecharge(id, 30);
    }
    return match;
  }

  it.each([
    [12, [PAIN], 50],
    [0, [PAIN], 10],
    [12, [PAIN, SHADOWSONG], 100],
    [15, [PAIN, SHADOWSONG, RECUPERATION], 135],
  ] as const)("at Spawning Power %i with %j recharging deals %i", (rank, recharging, dealt) => {
    const match = ritualist(rank, recharging);
    expect(damageTo(cast(match, "c", 0, "foe", 2), DOOM, "foe")).toEqual([dealt]);
  });

  it("counts no recharging skill that is not a binding ritual", () => {
    const match = ritualist(12, []);
    get(match, "c").cast.startRecharge(FLARE, 30);
    const energy = get(match, "c").energy;
    const log = cast(match, "c", 0, "foe", 2);
    expect(damageTo(log, DOOM, "foe")).toEqual([]);
    // Spent all the same.
    expect(get(match, "c").energy).toBeLessThan(energy - 9);
    expect(get(match, "c").cast.rechargeRemaining.get(DOOM) ?? 0).toBeGreaterThan(0);
  });

  it("counts no ritual that is disabled but not recharging", () => {
    const match = ritualist(12, [PAIN]);
    get(match, "c").cast.disable(SHADOWSONG, 30);
    expect(damageTo(cast(match, "c", 0, "foe", 2), DOOM, "foe")).toEqual([50]);
  });

  it("counts by attribute too, on the caster's own bar", () => {
    const caster = makeCombatant({
      id: "c",
      skillBar: [PAIN, SHADOWSONG, RECUPERATION],
    });
    for (const id of [PAIN, SHADOWSONG, RECUPERATION]) {
      caster.cast.startRecharge(id, 30);
    }
    const per = (attributeId: string | undefined) =>
      ({
        count: { kind: "recharging-skills", of: "caster", attributeId, type: undefined },
        amount: { flat: 1 },
        max: undefined,
      }) as const;
    const context = { surroundings: new Map() };
    expect(withPerCount(0, per("ritualist.communing"), caster, undefined, context, [])).toBe(2);
    expect(withPerCount(0, per(undefined), caster, undefined, context, [])).toBe(3);
  });

  it("says what it counts", () => {
    expect(
      describeSkill(skill(DOOM), SPAWNING(12))
        .effects.map(({ text }) => text)
        .join(" "),
    ).toContain("recharging binding rituals");
  });
});

describe("Grenth's Balance (#2321)", () => {
  function balance(caster: Combatant, foe: Combatant): CombatEvent[] {
    return applyEffects([{ kind: "balance-health" }], {
      caster,
      target: foe,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
  }

  it("takes half the difference from a foe with more", () => {
    const caster = makeCombatant({ id: "c", health: 100, maxHealth: 480 });
    const foe = makeCombatant({ id: "f", team: 1, health: 500, maxHealth: 600 });
    balance(caster, foe);
    expect([caster.health, foe.health]).toEqual([300, 300]);
  });

  it("gives half the difference to a foe with less", () => {
    const caster = makeCombatant({ id: "c", health: 400, maxHealth: 480 });
    const foe = makeCombatant({ id: "f", team: 1, health: 101, maxHealth: 600 });
    balance(caster, foe);
    // floor(299 / 2) = 149.
    expect([caster.health, foe.health]).toEqual([251, 250]);
  });

  it("takes only what fits under the caster's maximum", () => {
    const caster = makeCombatant({ id: "c", health: 450, maxHealth: 480 });
    const foe = makeCombatant({ id: "f", team: 1, health: 600, maxHealth: 600 });
    balance(caster, foe);
    expect([caster.health, foe.health]).toEqual([480, 570]);
  });

  it("does nothing at equal Health, or at full Health against more", () => {
    const even = makeCombatant({ id: "c", health: 300 });
    const foe = makeCombatant({ id: "f", team: 1, health: 300 });
    expect(balance(even, foe)).toEqual([]);
    const full = makeCombatant({ id: "c", health: 400, maxHealth: 400 });
    const more = makeCombatant({ id: "f", team: 1, health: 500, maxHealth: 600 });
    expect(balance(full, more)).toEqual([]);
    expect(more.health).toBe(500);
  });

  it("gains nothing from an invulnerable foe", () => {
    const caster = makeCombatant({ id: "c", health: 100, maxHealth: 480 });
    const foe = makeCombatant({ id: "f", team: 1, health: 500, invulnerableRemaining: 5 });
    balance(caster, foe);
    expect([caster.health, foe.health]).toEqual([100, 500]);
  });

  it("is neither damage nor a heal of the foe's", () => {
    const caster = makeCombatant({ id: "c", health: 100, maxHealth: 480 });
    const foe = makeCombatant({ id: "f", team: 1, health: 500 });
    expect(balance(caster, foe).map(({ kind }) => kind)).toEqual(["health-loss", "heal"]);
  });
});

describe("Nature's Renewal (#2321)", () => {
  it.each([
    [12, 1.7, 210, 198],
    [0, 1.5, 70, 30],
  ])(
    "at Wilderness Survival %i: enchantments and hexes x%f, a %i-Health spirit for %i s",
    (rank, multiplier, health, seconds) => {
      const match = arena([RENEWAL], WILDERNESS(rank), [GUARDIAN, BILE, FLARE], DEATH(0));
      cast(match, "c", 0, "c", 3);
      const spirit = spiritOf(match, "c");
      expect(spirit.combatant.maxHealth).toBe(health);
      expect(spirit.creature?.expiresInSeconds).toBeCloseTo(seconds - 1, 0);
      const foe = get(match, "foe");
      match.setTarget("foe", "foe");
      match.requestSkill("foe", 0);
      expect(foe.cast.activeCast?.totalSeconds).toBeCloseTo(multiplier, 5);
      stepFor(match, 3);
      match.setTarget("foe", "c");
      match.requestSkill("foe", 1);
      expect(foe.cast.activeCast?.totalSeconds).toBeCloseTo(multiplier, 5);
      stepFor(match, 3);
      // A plain spell is left alone.
      match.requestSkill("foe", 2);
      expect(foe.cast.activeCast?.totalSeconds).toBeCloseTo(1, 5);
    },
  );

  it("doubles the upkeep of an enchantment its bearer maintains, in range only", () => {
    const match = arena([RENEWAL], WILDERNESS(12), [MENDING], R0);
    cast(match, "c", 0, "c", 3);
    cast(match, "foe", 0, "foeAlly", 2);
    cast(match, "far", 0, "far", 2);
    const everyone = [...match.participants()].map(({ combatant }) => combatant);
    expect(upkeepPips(get(match, "foe"), everyone)).toBe(-2);
    expect(upkeepPips(get(match, "far"), everyone)).toBe(-1);
    // Counted as one enchantment still.
    expect(maintainedEnchantments("foe", everyone)).toBe(1);
  });

  it("says what its aura does", () => {
    expect(describeStatus("natures-renewal", WILDERNESS(12))).toContain(
      "enchantments you maintain cost 2× the upkeep",
    );
  });
});

describe("Equinox (#2321)", () => {
  /** `c`'s Equinox up at `rank`; the foe, an Elementalist, beside it. */
  function equinox(rank: number) {
    const match = arena(
      [EQUINOX],
      WILDERNESS(rank),
      [ICY_PRISM, FLARE, GLYPH_OF_ENERGY],
      new Map([
        ["elementalist.water-magic", 12],
        ["elementalist.fire-magic", 12],
        ["elementalist.energy-storage", 12],
      ]),
    );
    cast(match, "c", 0, "c", 3);
    return match;
  }

  it.each([
    [12, 198],
    [0, 30],
  ])("at Wilderness Survival %i lives %i s", (rank, seconds) => {
    expect(spiritOf(equinox(rank), "c").creature?.expiresInSeconds).toBeCloseTo(seconds - 1, 0);
  });

  it("adds 10 Overcast as an Overcast spell finishes, not as it starts", () => {
    const match = equinox(12);
    const foe = get(match, "foe");
    match.setTarget("foe", "c");
    match.requestSkill("foe", 0);
    expect(foe.overcast).toBe(5);
    stepFor(match, 2);
    expect(foe.overcast).toBeGreaterThan(14);
    expect(foe.overcast).toBeLessThanOrEqual(15);
  });

  it("adds none to a cancelled one", () => {
    const match = equinox(12);
    const foe = get(match, "foe");
    match.setTarget("foe", "c");
    match.requestSkill("foe", 0);
    stepFor(match, 0.5);
    match.cancelAction("foe");
    stepFor(match, 2);
    expect(foe.overcast).toBeLessThanOrEqual(5);
  });

  it("adds none to a spell with no Overcast, or one a Glyph of Energy spared", () => {
    const match = equinox(12);
    const foe = get(match, "foe");
    cast(match, "foe", 1, "c", 2);
    expect(foe.overcast).toBe(0);
    cast(match, "foe", 2, "foe", 2);
    cast(match, "foe", 0, "c", 2);
    expect(foe.overcast).toBe(0);
  });
});

describe("Archer's Signet (#2321)", () => {
  it.each([
    [12, 19],
    [0, 1],
  ])("at Expertise %i lasts %i s", (rank, seconds) => {
    const match = arena([ARCHERS], new Map([["ranger.expertise", rank]]));
    expect(match.requestSkill("c", 0)?.check).toEqual({ ok: true });
    stepFor(match, 1);
    expect(get(match, "c").statuses.get("archers-signet")?.remainingSeconds).toBeCloseTo(
      seconds,
      1,
    );
  });

  /** `caster`, holding `weapon` under Archer's Signet, uses `effects` on a foe. */
  function underSignet(weapon: AttackWeaponClass, effects: readonly SkillEffect[]) {
    const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
    const held = weapon === "bow" ? WEAPONS.longbow : WEAPONS.sword;
    const caster = makeCombatant({
      id: "c",
      equipment: {
        ...unarmed,
        mainHand: {
          weapon: held,
          attributeId: undefined,
          damageType: held.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
    });
    caster.statuses.apply("archers-signet", 20, "c", NO_RANKS);
    const foe = makeCombatant({ id: "f", team: 1 });
    applyEffects(effects, {
      caster,
      target: foe,
      rng: createRng(1),
      rules: RULES.combat,
      surroundings: new Map(),
    });
    return { caster, foe };
  }

  const BLEED: SkillEffect = {
    kind: "apply-status",
    statusId: "bleeding",
    durationSeconds: { flat: 10 },
  };

  it("lengthens a condition 150% with a bow", () => {
    expect(underSignet("bow", [BLEED]).foe.statuses.get("bleeding")?.remainingSeconds).toBe(25);
  });

  it("leaves it alone with a sword, and a hex with a bow", () => {
    expect(underSignet("sword", [BLEED]).foe.statuses.get("bleeding")?.remainingSeconds).toBe(10);
    const hex: SkillEffect = {
      kind: "apply-status",
      statusId: "rising-bile",
      durationSeconds: { flat: 10 },
    };
    expect(underSignet("bow", [hex]).foe.statuses.get("rising-bile")?.remainingSeconds).toBe(10);
  });

  it("leaves a transferred condition its own duration", () => {
    const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
    const caster = makeCombatant({
      id: "c",
      equipment: {
        ...unarmed,
        mainHand: {
          weapon: WEAPONS.longbow,
          attributeId: undefined,
          damageType: WEAPONS.longbow.damageType,
          requirementMet: true,
          creatureDamageScale: undefined,
        },
      },
    });
    caster.statuses.apply("archers-signet", 20, "c", NO_RANKS);
    caster.statuses.apply("bleeding", 4, "x", NO_RANKS);
    const foe = makeCombatant({ id: "f", team: 1 });
    applyEffects(
      [{ kind: "transfer-conditions", from: "caster", count: { flat: 1 }, durationMultiplier: 1 }],
      { caster, target: foe, rng: createRng(1), rules: RULES.combat, surroundings: new Map() },
    );
    expect(foe.statuses.get("bleeding")?.remainingSeconds).toBe(4);
  });

  it("says what it does", () => {
    expect(describeStatus("archers-signet", NO_RANKS)).toContain(
      "conditions you apply last 150% longer while wielding",
    );
  });
});
