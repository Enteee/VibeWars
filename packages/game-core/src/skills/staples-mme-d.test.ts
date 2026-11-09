import { describe, expect, it } from "vitest";

import { RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, type Weapon } from "../equipment/weapons.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { ADRENALINE_PER_STRIKE, MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import type { Combatant, Skill } from "./types.js";
import { EN_NAMES, EN_WORDS } from "./describe-words.js";

/**
 * Mesmer, Monk and Elementalist staples (#2414): Sympathetic Visage,
 * Mantra of Inscriptions, Resurrection Chant, Defender's Zeal, Whirlwind
 * and Flame Djinn's Haste, on today's primitives. Every scaled number at
 * rank 12 and at rank 0.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const rankAll = (rank: number): ReadonlyMap<string, number> =>
  new Map([
    ["mesmer.illusion-magic", rank],
    ["mesmer.inspiration-magic", rank],
    ["monk.healing-prayers", rank],
    ["monk.smiting-prayers", rank],
    ["elementalist.air-magic", rank],
    ["elementalist.fire-magic", rank],
  ]);
const R12 = rankAll(12);
const R0 = rankAll(0);

const VISAGE = "mesmer.sympathetic-visage";
const INSCRIPTIONS = "mesmer.mantra-of-inscriptions";
const CHANT = "monk.resurrection-chant";
const ZEAL = "monk.defenders-zeal";
const WHIRLWIND = "elementalist.whirlwind";
const DJINN = "elementalist.flame-djinns-haste";
const SIGNET = "mesmer.signet-of-illusions";
const SPELL = "mesmer.arcane-conundrum";
const LEECH = "mesmer.leech-signet";
const FRENZY = "warrior.frenzy";
const SEVER = "warrior.sever-artery";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the six are the corpus's (#2414)", () => {
  it.each([
    [VISAGE, 34, "enchantment", false, "illusion-magic", 10, 1, 20, RANGE_SPELL, "single-ally"],
    [INSCRIPTIONS, 15, "stance", false, "inspiration-magic", 10, 0, 20, RANGE_SPELL, "self"],
    [
      CHANT,
      1128,
      "spell",
      false,
      "healing-prayers",
      10,
      6,
      15,
      RANGE_SPELL / 2,
      "single-dead-ally",
    ],
    [ZEAL, 1688, "hex", true, "smiting-prayers", 5, 1, 5, RANGE_SPELL, "single-enemy"],
    [WHIRLWIND, 163, "spell", false, "air-magic", 5, 0.75, 8, RANGE_SPELL, "self"],
    [DJINN, 1381, "enchantment", false, "fire-magic", 10, 0.75, 20, RANGE_SPELL, "self"],
  ] as const)(
    "%s: gwId %i, %s",
    (id, gwId, type, elite, attribute, energy, activation, recharge, range, target) => {
      const [profession = ""] = id.split(".");
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        profession,
        attributeId: `${profession}.${attribute}`,
        cost: { kind: "energy", amount: energy },
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range,
        target,
      });
    },
  );
});

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weapon.damageType,
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const SWORD = wielding(WEAPONS.sword, "warrior.swordsmanship");
const BOW = wielding(WEAPONS.longbow, "ranger.marksmanship");

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  extra: Partial<ParticipantSpec> = {},
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [],
    attributeRanks: new Map(),
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 1e5,
    maxEnergy: 100,
    spawn,
    facing: 0,
    ...extra,
  };
}

/** `c` of team 0 at the origin with `bar` at `ranks`; `others` as given. */
function arena(
  bar: readonly string[],
  ranks: ReadonlyMap<string, number>,
  ...others: ParticipantSpec[]
): MatchSimulation {
  const sim = new MatchSimulation({
    seed: "staples-mme-d",
    participants: [spec("c", 0, vec2(0, 0), { skillBar: bar, attributeRanks: ranks }), ...others],
  });
  for (const participant of sim.participants()) {
    participant.combatant.health = participant.combatant.maxHealth;
    participant.combatant.energy = 50;
  }
  return sim;
}

function get(sim: MatchSimulation, id: string): Combatant {
  const found = sim.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

function stepFor(sim: MatchSimulation, seconds: number): CombatLogEntry[] {
  const log: CombatLogEntry[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `c` uses `skillId` on `targetId`, and steps until it has landed. */
function use(sim: MatchSimulation, skillId: string, targetId = "c"): CombatLogEntry[] {
  sim.setTarget("c", targetId);
  expect(sim.requestSkill("c", get(sim, "c").skillBar.indexOf(skillId))?.check).toEqual({
    ok: true,
  });
  const log: CombatLogEntry[] = [];
  for (let i = 0; !log.some((entry) => entry.sourceId === "c" && entry.skillId === skillId); i++) {
    expect(i).toBeLessThan(10 * RULES.tickRateHz);
    log.push(...sim.step(DT).log);
  }
  return log;
}

/** `remaining` is `seconds`, less a step or two. */
function lasts(remaining: number | undefined, seconds: number): void {
  expect(remaining).toBeGreaterThan(seconds - 0.2);
  expect(remaining).toBeLessThanOrEqual(seconds + 1e-9);
}

/** Damage each target took from `skillId` in `log`. */
function damage(log: readonly CombatLogEntry[], skillId: string): Map<string, number> {
  const taken = new Map<string, number>();
  for (const entry of log) {
    if (entry.skillId !== skillId) {
      continue;
    }
    for (const event of entry.events) {
      if (event.kind === "damage") {
        taken.set(event.targetId, (taken.get(event.targetId) ?? 0) + event.amount);
      }
    }
  }
  return taken;
}

/** Who `skillId` knocked down in `log`. */
function knockedDown(log: readonly CombatLogEntry[], skillId: string): string[] {
  return log
    .filter((entry) => entry.skillId === skillId)
    .flatMap((entry) => entry.events)
    .flatMap((event) => (event.kind === "knocked-down" ? [event.targetId] : []));
}

describe("Sympathetic Visage (#2414)", () => {
  /**
   * `ally` enchanted by `c`; `brute`, a sworded Warrior beside it with
   * Frenzy and Sever Artery's pool full; `beside`, another foe beside the
   * ally; `away`, a foe far from it; `archer`, a bow at range.
   */
  function visaged(ranks = R12): MatchSimulation {
    const warrior = { skillBar: [FRENZY, SEVER], equipment: SWORD };
    const sim = arena(
      [VISAGE],
      ranks,
      spec("ally", 0, vec2(0, 200)),
      spec("brute", 1, vec2(30, 200), warrior),
      spec("beside", 1, vec2(-30, 200)),
      spec("away", 1, vec2(300, 200)),
      spec("archer", 1, vec2(0, 500), { equipment: BOW }),
    );
    use(sim, VISAGE, "ally");
    return sim;
  }

  it.each([
    // Whole seconds as it lands: 8.8 is 9.
    [R12, 9],
    [R0, 4],
  ] as const)("lasts 4...10 seconds on the ally (%#)", (ranks, seconds) => {
    const sim = visaged(ranks);
    lasts(get(sim, "ally").statuses.get("sympathetic-visage")?.remainingSeconds, seconds);
  });

  it("a melee hit on the ally empties adjacent foes' adrenaline and takes 3 Energy each", () => {
    const sim = visaged();
    const brute = get(sim, "brute");
    brute.adrenaline.set(SEVER, 6 * ADRENALINE_PER_STRIKE);
    const ally = get(sim, "ally");
    expect(sim.requestAttack("brute", "ally")).toEqual({ ok: true });
    for (let i = 0; ally.health === ally.maxHealth; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      sim.step(DT);
    }
    expect(brute.adrenaline.get(SEVER)).toBe(0);
    expect(brute.energy).toBeLessThanOrEqual(47);
    expect(get(sim, "beside").energy).toBeLessThanOrEqual(47);
    expect(get(sim, "away").energy).toBeGreaterThan(47);
  });

  it("a bow's hit does nothing", () => {
    const sim = visaged();
    const ally = get(sim, "ally");
    expect(sim.requestAttack("archer", "ally")).toEqual({ ok: true });
    for (let i = 0; ally.health === ally.maxHealth; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      sim.step(DT);
    }
    expect(get(sim, "beside").energy).toBeGreaterThan(47);
    expect(get(sim, "archer").energy).toBeGreaterThan(47);
  });
});

describe("Mantra of Inscriptions (#2414)", () => {
  function mantra(ranks: ReadonlyMap<string, number>): MatchSimulation {
    const sim = arena(
      [INSCRIPTIONS, SIGNET, SPELL],
      ranks,
      spec("f", 1, vec2(200, 0), { skillBar: [LEECH] }),
    );
    use(sim, INSCRIPTIONS);
    return sim;
  }

  it.each([
    [R12, 21],
    [R0, 5],
  ] as const)("lasts 5...25 seconds (%#)", (ranks, seconds) => {
    lasts(
      get(mantra(ranks), "c").statuses.get("mantra-of-inscriptions")?.remainingSeconds,
      seconds,
    );
  });

  it.each([
    [R12, 5 * (1 - 0.34)],
    [R0, 5 * (1 - 0.1)],
  ] as const)("a signet used under it recharges 10...40% faster (%#)", (ranks, seconds) => {
    const sim = mantra(ranks);
    use(sim, SIGNET);
    lasts(get(sim, "c").cast.rechargeRemaining.get(SIGNET), seconds);
  });

  it("a signet interrupted recharges in full", () => {
    const sim = mantra(R12);
    sim.setTarget("c", "c");
    expect(sim.requestSkill("c", 1)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    sim.setTarget("f", "c");
    expect(sim.requestSkill("f", 0)?.check).toEqual({ ok: true });
    stepFor(sim, 0.5);
    const c = get(sim, "c");
    expect(c.cast.activeCast).toBeUndefined();
    lasts(c.cast.rechargeRemaining.get(SIGNET), 5);
  });

  it("a spell gets nothing", () => {
    const sim = mantra(R12);
    use(sim, SPELL, "f");
    lasts(get(sim, "c").cast.rechargeRemaining.get(SPELL), skill(SPELL).rechargeSeconds);
  });
});

describe("Resurrection Chant (#2414)", () => {
  function chant(ranks: ReadonlyMap<string, number>, at: Vec2, maxHealth = 1e5) {
    const sim = arena([CHANT], ranks, spec("dead", 0, at, { maxHealth }));
    const c = get(sim, "c");
    c.health = 400;
    const dead = get(sim, "dead");
    dead.dead = true;
    dead.health = 0;
    dead.energy = 0;
    // A corpse through the 6 s chant, no respawn first.
    const record = sim.get("dead");
    if (record !== undefined) {
      record.respawnInSeconds = Number.POSITIVE_INFINITY;
    }
    return sim;
  }

  it.each([
    [R12, 29],
    [R0, 5],
  ] as const)(
    "raises the ally with the Monk's Health and 5...35% Energy (%#)",
    (ranks, percent) => {
      const sim = chant(ranks, vec2(100, 0));
      use(sim, CHANT, "dead");
      const dead = get(sim, "dead");
      expect(dead.dead).toBe(false);
      // The Monk's own, a little regenerated over the chant, and all kept.
      const c = get(sim, "c");
      expect(c.health).toBeGreaterThanOrEqual(400);
      expect(dead.health).toBe(Math.floor(c.health));
      // Of 100, floored: 0.29 of it is a hair under 29.
      expect(dead.energy).toBeGreaterThanOrEqual(percent - 1);
      expect(dead.energy).toBeLessThanOrEqual(percent);
    },
  );

  it("gives no more than the ally's own maximum", () => {
    const sim = chant(R12, vec2(100, 0), 300);
    use(sim, CHANT, "dead");
    expect(get(sim, "dead").health).toBe(300);
  });

  it("reads as up to the Monk's current Health", () => {
    expect(
      describeSkill(skill(CHANT), R12, EN_WORDS, EN_NAMES).effects.map((effect) => effect.text),
    ).toContain("Returns the target to life with up to your current health and 29% energy");
  });
});

describe("Defender's Zeal (#2414)", () => {
  function zealous(ranks = R12): MatchSimulation {
    const sim = arena(
      [ZEAL],
      ranks,
      spec("brute", 1, vec2(30, 0), { equipment: SWORD }),
      spec("archer", 1, vec2(0, 300), { equipment: BOW }),
    );
    use(sim, ZEAL, "brute");
    return sim;
  }

  it.each([
    [R12, 26],
    [R0, 10],
  ] as const)("lasts 10...30 seconds on the foe (%#)", (ranks, seconds) => {
    lasts(get(zealous(ranks), "brute").statuses.get("defenders-zeal")?.remainingSeconds, seconds);
  });

  it.each(["brute", "archer"] as const)("the Monk gains 2 Energy when the hexed %s hits", (foe) => {
    const sim = zealous();
    if (foe === "archer") {
      get(sim, "archer").statuses.apply("defenders-zeal", 30, "c", R12);
    }
    const c = get(sim, "c");
    const log: CombatLogEntry[] = [];
    expect(sim.requestAttack(foe, "c")).toEqual({ ok: true });
    for (let i = 0; c.health === c.maxHealth; i++) {
      expect(i).toBeLessThan(5 * RULES.tickRateHz);
      log.push(...sim.step(DT).log);
    }
    const gains = log
      .filter((entry) => entry.skillId === ZEAL)
      .flatMap((entry) => entry.events)
      .filter((event) => event.kind === "energy-gain" && event.targetId === "c");
    expect(gains).toEqual([expect.objectContaining({ amount: 2 })]);
  });
});

describe("Whirlwind (#2414)", () => {
  /**
   * `swinging`, adjacent and attacking `c`; `still`, adjacent and idle;
   * `near`, nearby but not adjacent.
   */
  function whirl(ranks: ReadonlyMap<string, number>, overcast: boolean): CombatLogEntry[] {
    const sim = arena(
      [WHIRLWIND],
      ranks,
      spec("swinging", 1, vec2(30, 0), { equipment: SWORD }),
      spec("still", 1, vec2(-30, 0)),
      spec("near", 1, vec2(0, 70)),
    );
    expect(sim.requestAttack("swinging", "c")).toEqual({ ok: true });
    stepFor(sim, 0.2);
    if (overcast) {
      get(sim, "c").overcast = 5;
    }
    return use(sim, WHIRLWIND);
  }

  it.each([
    [R12, 63],
    [R0, 15],
  ] as const)("strikes adjacent foes for 15...75 cold (%#)", (ranks, amount) => {
    const taken = damage(whirl(ranks, false), WHIRLWIND);
    expect(taken.get("swinging")).toBe(amount);
    expect(taken.get("still")).toBe(amount);
    expect(taken.has("near")).toBe(false);
  });

  it("knocks down the attacking foe, not the idle one", () => {
    expect(knockedDown(whirl(R12, false), WHIRLWIND)).toEqual(["swinging"]);
  });

  it("strikes nearby when the Elementalist is Overcast", () => {
    const log = whirl(R12, true);
    expect(damage(log, WHIRLWIND).get("near")).toBe(63);
    expect(knockedDown(log, WHIRLWIND)).toEqual(["swinging"]);
  });
});

describe("Flame Djinn's Haste (#2414)", () => {
  function djinn(ranks: ReadonlyMap<string, number>, foeAt: Vec2, foeHealth = 1e5) {
    const sim = arena([DJINN], ranks, spec("f", 1, foeAt, { maxHealth: foeHealth }));
    get(sim, "f").health = foeHealth;
    const log = use(sim, DJINN);
    return { sim, log };
  }

  it.each([
    // Whole seconds as it lands: 12.8 is 13.
    [R12, 99, 13],
    [R0, 15, 8],
  ] as const)(
    "strikes adjacent foes for 15...120 fire, 8...14 s of 25%% speed (%#)",
    (ranks, amount, seconds) => {
      const { sim, log } = djinn(ranks, vec2(30, 0));
      expect(damage(log, DJINN).get("f")).toBe(amount);
      lasts(get(sim, "c").statuses.get("flame-djinns-haste")?.remainingSeconds, seconds);
    },
  );

  it("recharges 50% faster when a foe was struck", () => {
    const { sim } = djinn(R12, vec2(30, 0));
    lasts(get(sim, "c").cast.rechargeRemaining.get(DJINN), 10);
  });

  it("a foe the burst kills still counts", () => {
    const { sim } = djinn(R12, vec2(30, 0), 50);
    expect(get(sim, "f").dead).toBe(true);
    lasts(get(sim, "c").cast.rechargeRemaining.get(DJINN), 10);
  });

  it("no adjacent foe: the full 20 s", () => {
    const { sim, log } = djinn(R12, vec2(200, 0));
    expect(damage(log, DJINN).size).toBe(0);
    lasts(get(sim, "c").cast.rechargeRemaining.get(DJINN), 20);
  });

  it("reads as recharging faster only with a foe adjacent", () => {
    expect(
      describeSkill(skill(DJINN), R12, EN_WORDS, EN_NAMES).effects.map((effect) => effect.text),
    ).toContainEqual(expect.stringMatching(/^If any foe is adjacent: /));
  });
});
