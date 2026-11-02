import { describe, expect, it } from "vitest";

import { AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type Participant, type ParticipantSpec } from "../match/simulation.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill, describeStatus } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { NO_RANKS, aggregateModifiers } from "./status.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Necromancer staples 2 (#1583): Wither, Life Siphon, Reckless Haste,
 * Corrupt Enchantment, Strip Enchantment, Deathly Chill, Putrid Explosion
 * and Signet of Agony (PvP). Numbers are the corpus's at rank 12.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const RANKS = new Map([
  ["necromancer.blood-magic", 12],
  ["necromancer.death-magic", 12],
  ["necromancer.curses", 12],
]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function necro(overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id: "n", attributeRanks: RANKS, ...overrides });
}

function foe(id: string, overrides: Partial<Combatant> = {}): Combatant {
  return makeCombatant({ id, team: 1, ...overrides });
}

/** Everyone in `row` stands on the x axis at the given distance from the first. */
function placed(row: readonly (readonly [Combatant, number])[]) {
  return new Map(
    row.map(([combatant, x]) => [
      combatant.id,
      { combatant, position: vec2(x, 0), creature: undefined, corpseExploited: false },
    ]),
  );
}

/** `user` pays for `skillId` and it lands on `targets`, among `around`. */
function use(
  user: Combatant,
  skillId: string,
  targets: readonly Combatant[],
  around: readonly (readonly [Combatant, number])[] = [],
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings: placed([[user, -200], ...targets.map((t) => [t, 0] as const), ...around]),
    skill: skill(skillId),
    caster: user,
    targets,
    rng: createRng(1),
    rules: RULES.combat,
  });
}

function damages(events: readonly CombatEvent[], id: string): number[] {
  return events.flatMap((event) =>
    event.kind === "damage" && event.targetId === id ? [event.amount] : [],
  );
}

/** How many of the enchantments the tests put on are still on `target`. */
function enchantments(target: Combatant): number {
  return ENCHANTMENTS.filter((id) => target.statuses.has(id)).length;
}

const ENCHANTMENTS = ["blood-is-power", "order-of-pain", "judges-insight"] as const;

function described(id: string): string[] {
  return describeSkill(skill(id), RANKS).effects.map(({ text }) => text);
}

describe("the eight are the corpus's (#1583)", () => {
  it.each([
    ["wither", 125, "hex", true, "curses", 10, 1, 5],
    ["life-siphon", 109, "hex", false, "blood-magic", 10, 1, 5],
    ["reckless-haste", 834, "hex", false, "curses", 15, 1, 12],
    ["corrupt-enchantment", 1362, "hex", true, "curses", 5, 0.75, 5],
    ["strip-enchantment", 143, "spell", false, "blood-magic", 10, 1, 20],
    ["deathly-chill", 89, "spell", false, "death-magic", 10, 1, 5],
    ["putrid-explosion", 95, "spell", false, "death-magic", 10, 1, 5],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attribute, energy, activation, recharge) => {
      expect(skill(`necromancer.${id}`)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId: `necromancer.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
      });
    },
  );

  it("Signet of Agony is the PvP split: free, ¾ s, 20 s recharge", () => {
    expect(skill("necromancer.signet-of-agony")).toMatchObject({
      gwId: 145,
      type: "signet",
      attributeId: "necromancer.blood-magic",
      cost: undefined,
      activationSeconds: 0.75,
      rechargeSeconds: 20,
      target: "self",
    });
  });
});

describe("Wither (#1583)", () => {
  /** A rank-12 Necromancer `n` and a foe `f`, energy 20, 300 apart. */
  function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: ["necromancer.wither"],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 500,
      maxEnergy: 20,
      startHealthFraction: 1,
      spawn,
      facing: 0,
    };
  }

  function get(match: MatchSimulation, id: string): Participant {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...match.step(DT).log);
    }
    return log;
  }

  const blows = (log: readonly CombatLogEntry[]) =>
    log
      .filter((entry) => entry.skillId === "necromancer.wither")
      .flatMap((entry) => damages(entry.events, "f"));

  /** `n` withers `f`, who then has `energy` left. */
  function withered(energy: number): MatchSimulation {
    const match = new MatchSimulation({
      seed: "wither",
      participants: [spec("n", 0, vec2(0, 0)), spec("f", 1, vec2(300, 0))],
    });
    match.setTarget("n", "f");
    expect(match.requestSkill("n", 0)?.check).toEqual({ ok: true });
    stepFor(match, 1 + RULES.combat.aftercastSeconds);
    expect(get(match, "f").combatant.statuses.get("wither")?.sourceId).toBe("n");
    get(match, "f").combatant.energy = energy;
    return match;
  }

  it("is -4 health and -1 energy pips for 29 s", () => {
    const status = getSkill("necromancer.wither")?.effects[0];
    expect(status).toEqual({
      kind: "apply-status",
      statusId: "wither",
      durationSeconds: { scaling: { attributeId: "necromancer.curses", atZero: 5, atTwelve: 29 } },
    });
    expect(aggregateModifiers([{ id: "wither", ranks: NO_RANKS }])).toMatchObject({
      healthPips: -4,
      energyPips: -1,
    });
  });

  it("deals 63 once the foe's energy reaches 0, and ends (bearer-energy-empty)", () => {
    const match = withered(0.2);
    const f = get(match, "f").combatant;
    expect(blows(stepFor(match, 0.5))).toEqual([]);
    // The degeneration empties it within a few seconds: one blow, then gone.
    expect(blows(stepFor(match, 5))).toEqual([63]);
    expect(f.statuses.has("wither")).toBe(false);
    expect(blows(stepFor(match, 3))).toEqual([]);
  });

  it("on a foe already at 0 energy, fires on the first step", () => {
    const match = withered(0);
    expect(blows(stepFor(match, DT))).toEqual([63]);
    expect(get(match, "f").combatant.statuses.has("wither")).toBe(false);
  });

  it("removed before the energy runs out, deals nothing", () => {
    const match = withered(20);
    get(match, "f").combatant.statuses.removeByCategory("hex");
    get(match, "f").combatant.energy = 0;
    expect(blows(stepFor(match, 1))).toEqual([]);
  });

  it("says when it strikes", () => {
    expect(describeStatus("wither", RANKS)).toContain("if its energy reaches 0");
  });
});

describe("Life Siphon (#1583)", () => {
  it("hexes -3 for 22 s and gives the caster +3 for as long", () => {
    const n = necro();
    const f = foe("f");
    use(n, "necromancer.life-siphon", [f]);
    expect(f.statuses.get("life-siphon")?.sourceId).toBe("n");
    expect(f.statuses.get("life-siphon")?.remainingSeconds).toBe(22);
    expect(n.statuses.get("life-siphon-regen")?.remainingSeconds).toBe(22);
    expect(aggregateModifiers([{ id: "life-siphon", ranks: NO_RANKS }]).healthPips).toBe(-3);
    expect(aggregateModifiers([{ id: "life-siphon-regen", ranks: NO_RANKS }]).healthPips).toBe(3);
  });

  it("the caster keeps its regeneration when the hex is removed early", () => {
    const n = necro();
    const f = foe("f");
    use(n, "necromancer.life-siphon", [f]);
    f.statuses.removeByCategory("hex");
    expect(n.statuses.has("life-siphon-regen")).toBe(true);
  });
});

describe("Reckless Haste (#1583)", () => {
  it("hexes the target and adjacent foes for 11 s: 25% faster, 50% to miss", () => {
    expect(skill("necromancer.reckless-haste").area).toMatchObject({
      origin: "target",
      affects: "enemies",
    });
    const f = foe("f");
    use(necro(), "necromancer.reckless-haste", [f]);
    expect(f.statuses.get("reckless-haste")?.remainingSeconds).toBe(11);
    expect(aggregateModifiers([{ id: "reckless-haste", ranks: NO_RANKS }])).toMatchObject({
      attackMissChance: 0.5,
      attackDurationMultiplier: 0.75,
    });
  });
});

describe("Corrupt Enchantment (#1583)", () => {
  it("removes one enchantment and hexes -7 for 10 s", () => {
    const f = foe("f");
    f.statuses.apply("blood-is-power", 10, "x", NO_RANKS);
    f.statuses.apply("order-of-pain", 10, "x", NO_RANKS);
    use(necro(), "necromancer.corrupt-enchantment", [f]);
    expect(enchantments(f)).toBe(1);
    expect(f.statuses.get("corrupt-enchantment")?.remainingSeconds).toBe(10);
    expect(aggregateModifiers([{ id: "corrupt-enchantment", ranks: NO_RANKS }]).healthPips).toBe(
      -7,
    );
  });

  it("on an unenchanted foe: no hex, and the cost is paid", () => {
    const n = necro({ energy: 20 });
    const f = foe("f");
    use(n, "necromancer.corrupt-enchantment", [f]);
    expect(f.statuses.has("corrupt-enchantment")).toBe(false);
    expect(n.energy).toBe(15);
  });
});

describe("Strip Enchantment (#1583)", () => {
  it("removes two enchantments and steals 53", () => {
    const n = necro({ health: 300 });
    const f = foe("f");
    for (const id of ENCHANTMENTS) {
      f.statuses.apply(id, 10, "x", NO_RANKS);
    }
    const events = use(n, "necromancer.strip-enchantment", [f]);
    expect(enchantments(f)).toBe(1);
    expect(events).toContainEqual({ kind: "life-stolen", targetId: "f", amount: 53 });
    expect(n.health).toBe(353);
  });

  it("on an unenchanted foe: no steal", () => {
    const events = use(necro(), "necromancer.strip-enchantment", [foe("f")]);
    expect(events.some((event) => event.kind === "life-stolen")).toBe(false);
  });
});

describe("Deathly Chill (#1583)", () => {
  it("strikes cold, and shadow too above half health", () => {
    expect(damages(use(necro(), "necromancer.deathly-chill", [foe("f")]), "f")).toHaveLength(2);
  });

  it("at exactly half health, cold only", () => {
    const f = foe("f", { health: 250 });
    expect(damages(use(necro(), "necromancer.deathly-chill", [f]), "f")).toHaveLength(1);
  });

  it("reads health before the cold lands: just above half, both", () => {
    const f = foe("f", { health: 260 });
    expect(damages(use(necro(), "necromancer.deathly-chill", [f]), "f")).toHaveLength(2);
  });

  it("says 41 and 41", () => {
    expect(described("necromancer.deathly-chill").join(" | ")).toMatch(/41.*41/);
  });
});

describe("Signet of Agony (#1583)", () => {
  it("sacrifices 10%, bleeds the caster 25 s, and hits nearby foes for 58", () => {
    const n = necro({ health: 500, maxHealth: 500 });
    const near = foe("near");
    const far = foe("far");
    const events = applySkillEffects({
      surroundings: placed([
        [n, 0],
        [near, AREA_NEARBY - 10],
        [far, AREA_NEARBY + 50],
      ]),
      skill: skill("necromancer.signet-of-agony"),
      caster: n,
      targets: [n],
      rng: createRng(1),
      rules: RULES.combat,
    });
    expect(events).toContainEqual({ kind: "sacrifice", targetId: "n", amount: 50 });
    expect(n.statuses.get("bleeding")?.remainingSeconds).toBe(25);
    expect(damages(events, "near")).toEqual([58]);
    expect(damages(events, "far")).toEqual([]);
  });

  it("near no foe, still sacrifices and bleeds", () => {
    const n = necro();
    const events = use(n, "necromancer.signet-of-agony", [n]);
    expect(events.some((event) => event.kind === "sacrifice")).toBe(true);
    expect(n.statuses.has("bleeding")).toBe(true);
  });
});

describe("Putrid Explosion (#1583)", () => {
  const PUTRID = "necromancer.putrid-explosion";

  function spec(id: string, team: number, spawn: Vec2): ParticipantSpec {
    return {
      id,
      team,
      skillBar: [PUTRID],
      attributeRanks: RANKS,
      equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
      maxHealth: 500,
      maxEnergy: 100,
      startHealthFraction: 1,
      spawn,
      facing: 0,
    };
  }

  function get(match: MatchSimulation, id: string): Participant {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  function stepFor(match: MatchSimulation, seconds: number): CombatLogEntry[] {
    const log: CombatLogEntry[] = [];
    for (let i = 0; i < Math.round(seconds / DT); i += 1) {
      log.push(...match.step(DT).log);
    }
    return log;
  }

  function kill(match: MatchSimulation, id: string): void {
    const victim = get(match, id);
    victim.combatant.statuses.apply("burning", 10, "n", NO_RANKS);
    victim.combatant.health = 0.2;
    stepFor(match, DT);
    expect(victim.combatant.dead).toBe(true);
  }

  /**
   * `n` at the origin targets `t` at 400. Corpses to be: `nearN` behind
   * the caster, past the radius from `t`, and `nearT` 300 past `t`. `f`
   * stands beside `nearT`'s spot, `g` past the shockwave.
   */
  function match(): MatchSimulation {
    return new MatchSimulation({
      seed: "putrid",
      participants: [
        spec("n", 0, vec2(0, 0)),
        spec("nearN", 1, vec2(-100, 0)),
        spec("t", 1, vec2(400, 0)),
        spec("nearT", 1, vec2(700, 0)),
        spec("f", 1, vec2(700, AREA_NEARBY / 2)),
        spec("g", 1, vec2(700, AREA_NEARBY * 2)),
      ],
    });
  }

  const hits = (log: readonly CombatLogEntry[], id: string) =>
    log.filter((entry) => entry.skillId === PUTRID).flatMap((entry) => damages(entry.events, id));

  it("explodes the corpse nearest the target, not the caster (near: target)", () => {
    expect(skill(PUTRID).corpse).toEqual({ radius: RANGE_SPELL, near: "target" });
    const sim = match();
    kill(sim, "nearN");
    kill(sim, "nearT");
    sim.setTarget("n", "t");
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: true });
    const log = stepFor(sim, 1 + RULES.combat.aftercastSeconds + 2 * DT);
    expect(sim.get("nearT")?.corpseExploited).toBe(true);
    expect(sim.get("nearN")?.corpseExploited).toBe(false);
    expect(hits(log, "f")).toEqual([101]);
    expect(hits(log, "g")).toEqual([]);
  });

  it("is refused with no corpse near the target, and nothing is paid", () => {
    const sim = match();
    kill(sim, "nearN");
    sim.setTarget("n", "t");
    const energy = get(sim, "n").combatant.energy;
    expect(sim.requestSkill("n", 0)?.check).toEqual({ ok: false, reason: "no-corpse" });
    stepFor(sim, DT);
    expect(get(sim, "n").combatant.energy).toBeGreaterThanOrEqual(energy);
    expect(sim.get("nearN")?.corpseExploited).toBe(false);
  });

  it("says whose corpse", () => {
    expect(described(PUTRID)).toContain("Exploits the corpse nearest your target");
  });
});
