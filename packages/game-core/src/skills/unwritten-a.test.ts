import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, RANGE_SPELL } from "../distances.js";
import { unarmedResolvedEquipment } from "../equipment/resolve.js";
import type { CombatLogEntry } from "../match/combat-log.js";
import type { MatchRules } from "../match-rules.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { resolveMagnitudeAtRanks, statAt } from "./scaling.js";
import { vec2, type Vec2 } from "../vec2.js";
import { getSkill } from "./catalog.js";
import { getStatusDefinition, NO_RANKS, type StatusId, type StatusTrigger } from "./status.js";
import type { Combatant, Magnitude, Skill, SkillEffect } from "./types.js";

/**
 * Fourteen corpus caster skills on mechanics that already exist (#2499):
 * their corpus numbers, their scaled numbers at rank 0 and rank 12, and
 * one behaviour each in a match.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const DP: MatchRules = {
  victory: "kill-count",
  scoreToWin: 99,
  timeLimitSeconds: 600,
  deathRule: "resurrection-only",
  respawnSeconds: 1,
  respawnOnWave: false,
  deathPenalty: true,
};

const MANTRA = "mesmer.mantra-of-persistence";
const SCOURGE = "monk.scourge-sacrifice";
const AMITY = "monk.amity";
const RESURRECT = "monk.resurrect";
const BOON = "monk.boon-signet";
const KITAH = "mesmer.kitahs-burden";
const DRAGON = "elementalist.double-dragon";
const TEINAI = "elementalist.teinais-heat";
const KAREI = "monk.kareis-healing-circle";
const SANDSTORM = "elementalist.sandstorm";
const SUPPORTIVE = "monk.supportive-spirit";
const POSTURE = "mesmer.symbolic-posture";
const IMMOLATION = "elementalist.glyph-of-immolation";
const GAZE = "necromancer.angorodons-gaze";
const ORISON = "monk.orison-of-healing";
const FLARE = "elementalist.flare";
const SIGNET = "mesmer.signet-of-humility";

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

describe("the fourteen are the corpus's (#2499)", () => {
  it.each([
    [MANTRA, 14, "stance", false, "mesmer.inspiration-magic", 5, 0, 15, "self"],
    [SCOURGE, 253, "hex", false, "monk.smiting-prayers", 5, 1, 5, "single-enemy"],
    [AMITY, 265, "hex", true, "monk.protection-prayers", 5, 0.25, 20, "self"],
    [RESURRECT, 305, "spell", false, undefined, 10, 5, 8, "single-dead-ally"],
    [BOON, 847, "signet", true, "monk.divine-favor", 0, 1, 6, "single-ally"],
    [KITAH, 1056, "hex", false, "mesmer.illusion-magic", 15, 1.5, 30, "single-enemy"],
    [DRAGON, 1091, "enchantment", true, "elementalist.fire-magic", 10, 1, 15, "single-ally"],
    [TEINAI, 1093, "ward", false, "elementalist.fire-magic", 15, 1, 20, "self"],
    [KAREI, 1119, "spell", false, "monk.healing-prayers", 10, 1, 5, "self"],
    [SANDSTORM, 1372, "spell", true, "elementalist.earth-magic", 15, 2, 20, "single-enemy"],
    [SUPPORTIVE, 1391, "enchantment", false, "monk.healing-prayers", 10, 0.75, 8, "single-ally"],
    [POSTURE, 1658, "stance", false, "mesmer.fast-casting", 10, 0, 20, "self"],
    [IMMOLATION, 2060, "glyph", false, "elementalist.fire-magic", 5, 1, 10, "self"],
    [GAZE, 2189, "spell", false, "necromancer.soul-reaping", 5, 1, 10, "single-enemy"],
  ] as const)(
    "%s: gwId %i, %s, elite %s, %s, %i energy, %d s, %i s recharge",
    (id, gwId, type, elite, attributeId, energy, activation, recharge, target) => {
      expect(skill(id)).toMatchObject({
        gwId,
        type,
        elite,
        attributeId,
        cost: energy === 0 ? undefined : { kind: "energy", amount: energy },
        overcast: 0,
        activationSeconds: activation,
        rechargeSeconds: recharge,
        range: RANGE_SPELL,
        target,
      });
    },
  );

  it("Teinai's Heat is disabled for 20 seconds", () => {
    expect(skill(TEINAI).disabledAfterUseSeconds).toBe(20);
  });
});

/** Every scaled magnitude in `effects`, nested ones and trigger ones too, in order. */
function magnitudes(effects: readonly SkillEffect[] | readonly unknown[]): Magnitude[] {
  const found: Magnitude[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (typeof value === "object" && value !== null) {
      if ("scaling" in value && "atZero" in (value as { scaling: object }).scaling) {
        found.push(value as Magnitude);
        return;
      }
      Object.values(value).forEach(walk);
    }
  };
  walk(effects);
  return found;
}

function triggers(statusId: StatusId): readonly StatusTrigger[] {
  return getStatusDefinition(statusId).triggers;
}

/** Each scaled magnitude at rank 0 and rank 12 of its own attribute. */
function ranked(found: readonly Magnitude[]): [number, number][] {
  return found.map((magnitude) => {
    const attributeId = "scaling" in magnitude ? magnitude.scaling.attributeId : "";
    return [0, 12].map((rank) =>
      resolveMagnitudeAtRanks(magnitude, new Map([[attributeId, rank]])),
    ) as [number, number];
  });
}

describe("scaled numbers at rank 0 and rank 12 (#2499)", () => {
  it.each([
    [MANTRA, [[5, 21]]],
    [SCOURGE, [[8, 18]]],
    [AMITY, [[4, 10]]],
    [BOON, [[20, 68]]],
    [KITAH, [[6, 11]]],
    [TEINAI, [[10, 14]]],
    [KAREI, [[30, 150]]],
    [
      SANDSTORM,
      [
        [20, 36],
        [10, 26],
      ],
    ],
    [SUPPORTIVE, [[5, 19]]],
    [POSTURE, [[5, 17]]],
    [
      GAZE,
      [
        [10, 42],
        [3, 10],
      ],
    ],
  ] as const)("%s: %j", (id, expected) => {
    expect(ranked(magnitudes(skill(id).effects))).toEqual(expected);
  });

  it.each([
    ["boon-signet", [20, 84]],
    ["kitahs-burden", [10, 16]],
    ["supportive-spirit", [5, 41]],
    ["double-dragon", [1, 3]],
    ["glyph-of-immolation", [1, 3]],
  ] as const)("%s's trigger: %j", (statusId, expected) => {
    for (const pair of ranked(magnitudes(triggers(statusId)))) {
      expect(pair).toEqual(expected);
    }
  });

  it.each([
    ["mantra-of-persistence", "mesmer.inspiration-magic", 1.1, 1.34],
    ["symbolic-posture", "mesmer.fast-casting", 0.2, 0.68],
  ] as const)("%s's own-skill modifier, by %s: %d at 0, %d at 12", (id, attributeId, low, high) => {
    const [modifier] = getStatusDefinition(id).ownSkillModifiers;
    const stat =
      id === "mantra-of-persistence" ? modifier?.durationMultiplier : modifier?.rechargeFaster;
    expect(stat).toBeDefined();
    if (stat !== undefined) {
      expect(statAt(stat, new Map([[attributeId, 0]]))).toBeCloseTo(low);
      expect(statAt(stat, new Map([[attributeId, 12]]))).toBeCloseTo(high);
    }
  });

  it("Teinai's Heat degenerates 2 at rank 0, 4 at rank 12; Glyph of Immolation lasts 1 and 3 spells", () => {
    const heat = getStatusDefinition("teinais-heat").healthPips;
    const glyph = getStatusDefinition("glyph-of-immolation").endsAfterTriggers;
    const fire = (rank: number) => new Map([["elementalist.fire-magic", rank]]);
    expect(Math.round(statAt(heat, fire(0)))).toBe(-2);
    expect(Math.round(statAt(heat, fire(12)))).toBe(-4);
    expect(glyph).toBeDefined();
    if (glyph !== undefined) {
      expect(Math.round(statAt(glyph, fire(0)))).toBe(1);
      expect(Math.round(statAt(glyph, fire(12)))).toBe(3);
    }
  });

  it("Double Dragon burns adjacent foes for 34 a second, its rank-12 value", () => {
    expect(getStatusDefinition("double-dragon").damagePulse).toMatchObject({
      damage: 34,
      type: "fire",
      radius: AREA_ADJACENT,
      hitsBearer: false,
    });
  });
});

function spec(
  id: string,
  team: number,
  spawn: Vec2,
  skillBar: readonly string[] = [],
  ranks: ReadonlyMap<string, number> = new Map(),
): ParticipantSpec {
  return {
    id,
    team,
    skillBar: [...skillBar],
    attributeRanks: ranks,
    equipment: unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    maxHealth: 500,
    maxEnergy: 100,
    spawn,
    facing: 0,
  };
}

function match(...participants: ParticipantSpec[]): MatchSimulation {
  const sim = new MatchSimulation({ seed: "unwritten-a", matchRules: DP, participants });
  for (const participant of sim.participants()) {
    participant.combatant.energy = participant.combatant.maxEnergy;
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

/** `casterId` uses the skill in `slot` on `targetId`, then steps `seconds`. */
function use(
  sim: MatchSimulation,
  casterId: string,
  slot: number,
  targetId: string,
  seconds: number,
): CombatLogEntry[] {
  sim.setTarget(casterId, targetId);
  expect(sim.requestSkill(casterId, slot)?.check).toEqual({ ok: true });
  return stepFor(sim, seconds);
}

/** `id`'s Health healed in `log`. */
function healed(log: readonly CombatLogEntry[], id: string): number[] {
  return log.flatMap((entry) =>
    entry.events.flatMap((event) =>
      event.kind === "heal" && event.targetId === id ? [event.amount] : [],
    ),
  );
}

const ranks = (...pairs: [string, number][]) => new Map(pairs);

describe("Mantra of Persistence (#2499)", () => {
  it("makes an Illusion Magic hex last 34% longer at Inspiration 12", () => {
    const burden = (withMantra: boolean) => {
      const sim = match(
        spec(
          "m",
          0,
          vec2(0, 0),
          [MANTRA, KITAH],
          ranks(["mesmer.inspiration-magic", 12], ["mesmer.illusion-magic", 12]),
        ),
        spec("x", 1, vec2(200, 0)),
      );
      if (withMantra) {
        use(sim, "m", 0, "m", 0.1);
      }
      use(sim, "m", 1, "x", skill(KITAH).activationSeconds + 0.1);
      return get(sim, "x").statuses.get("kitahs-burden")?.remainingSeconds ?? 0;
    };
    expect(burden(true) / burden(false)).toBeCloseTo(1.34, 1);
  });
});

describe("Scourge Sacrifice (#2499)", () => {
  it("hexes the target and its adjacent foes, who sacrifice twice the Health", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [SCOURGE]),
      spec("x", 1, vec2(200, 0)),
      spec("y", 1, vec2(220, 0)),
      spec("z", 1, vec2(600, 0)),
    );
    use(sim, "m", 0, "x", skill(SCOURGE).activationSeconds + 0.1);
    expect(get(sim, "x").statuses.has("scourge-sacrifice")).toBe(true);
    expect(get(sim, "y").statuses.has("scourge-sacrifice")).toBe(true);
    expect(get(sim, "z").statuses.has("scourge-sacrifice")).toBe(false);
    expect(getStatusDefinition("scourge-sacrifice").sacrificeMultiplier).toBe(2);
  });
});

describe("Amity (#2499)", () => {
  it("hexes each adjacent foe; one that takes damage, degeneration too, loses only its own", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [AMITY]),
      spec("x", 1, vec2(20, 0)),
      spec("y", 1, vec2(-20, 0)),
      spec("z", 1, vec2(300, 0)),
    );
    use(sim, "m", 0, "m", skill(AMITY).activationSeconds + 0.1);
    expect(get(sim, "x").statuses.has("amity")).toBe(true);
    expect(get(sim, "y").statuses.has("amity")).toBe(true);
    expect(get(sim, "z").statuses.has("amity")).toBe(false);
    expect(sim.requestAttack("x", "m")?.ok).toBe(false);
    get(sim, "x").statuses.apply("bleeding", 10, "q", NO_RANKS);
    stepFor(sim, 1);
    expect(get(sim, "x").statuses.has("amity")).toBe(false);
    expect(get(sim, "y").statuses.has("amity")).toBe(true);
  });
});

describe("Resurrect (#2499)", () => {
  it("raises the ally where it fell, with 25% Health and no Energy", () => {
    const sim = match(
      spec("a", 0, vec2(300, 0)),
      spec("r", 0, vec2(0, 0), [RESURRECT]),
      spec("x", 1, vec2(900, 0)),
    );
    const ally = get(sim, "a");
    ally.statuses.apply("burning", 10, "x", NO_RANKS);
    ally.health = 0.2;
    sim.step(DT);
    expect(ally.dead).toBe(true);
    use(sim, "r", 0, "a", skill(RESURRECT).activationSeconds + 0.1);
    expect(ally.dead).toBe(false);
    expect(ally.health).toBe(Math.floor(ally.maxHealth * 0.25));
    expect(ally.energy).toBeLessThan(1);
    expect(sim.get("a")?.position.x).toBeCloseTo(300);
  });
});

describe("Boon Signet (#2499)", () => {
  function signet() {
    const sim = match(
      spec(
        "m",
        0,
        vec2(0, 0),
        [BOON, ORISON],
        ranks(["monk.divine-favor", 12], ["monk.healing-prayers", 12]),
      ),
      spec("a", 0, vec2(200, 0)),
      spec("x", 1, vec2(900, 0)),
    );
    get(sim, "a").health = 100;
    get(sim, "m").health = 100;
    const log = use(sim, "m", 0, "a", skill(BOON).activationSeconds + 0.1);
    return { sim, log };
  }

  it("heals the ally 68, then the next Healing Prayer on an ally heals 84 more, once", () => {
    const { sim, log } = signet();
    expect(healed(log, "a")).toContain(68);
    expect(get(sim, "m").statuses.has("boon-signet")).toBe(true);
    const orison = use(sim, "m", 1, "a", skill(ORISON).activationSeconds + 1.5);
    expect(healed(orison, "a")).toContain(84);
    expect(get(sim, "m").statuses.has("boon-signet")).toBe(false);
  });

  it("is not used up by a spell on yourself", () => {
    const { sim } = signet();
    const orison = use(sim, "m", 1, "m", skill(ORISON).activationSeconds + 1.5);
    expect(healed(orison, "m")).not.toContain(84);
    expect(get(sim, "m").statuses.has("boon-signet")).toBe(true);
  });
});

describe("Kitah's Burden (#2499)", () => {
  it("slows the foe by half and gives its caster 16 Energy when it ends", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [KITAH], ranks(["mesmer.illusion-magic", 12])),
      spec("x", 1, vec2(200, 0)),
    );
    use(sim, "m", 0, "x", skill(KITAH).activationSeconds + 0.1);
    expect(getStatusDefinition("kitahs-burden").moveSpeedMultiplier).toBe(0.5);
    const mesmer = get(sim, "m");
    mesmer.energy = 10;
    const status = get(sim, "x").statuses.get("kitahs-burden");
    expect(status).toBeDefined();
    stepFor(sim, (status?.remainingSeconds ?? 0) + 0.1);
    expect(get(sim, "x").statuses.has("kitahs-burden")).toBe(false);
    expect(mesmer.energy).toBeGreaterThanOrEqual(26);
  });
});

describe("Double Dragon (#2499)", () => {
  it("enchants you and the ally; a skill at a foe sets it on fire, and adjacent foes burn", () => {
    const sim = match(
      spec("e", 0, vec2(0, 0), [DRAGON, FLARE], ranks(["elementalist.fire-magic", 12])),
      spec("a", 0, vec2(200, 0)),
      spec("x", 1, vec2(220, 0)),
      spec("y", 1, vec2(500, 0)),
    );
    use(sim, "e", 0, "a", skill(DRAGON).activationSeconds + 0.1);
    expect(get(sim, "e").statuses.has("double-dragon")).toBe(true);
    expect(get(sim, "a").statuses.has("double-dragon")).toBe(true);
    const before = get(sim, "x").health;
    stepFor(sim, 1.1);
    expect(get(sim, "x").health).toBeLessThan(before);
    use(sim, "e", 1, "y", skill(FLARE).activationSeconds + 1.5);
    expect(get(sim, "y").statuses.has("burning")).toBe(true);
  });
});

describe("Teinai's Heat (#2499)", () => {
  it("degenerates the foes inside it, and a Weakened one attacks 33% slower", () => {
    const sim = match(
      spec("e", 0, vec2(0, 0), [TEINAI], ranks(["elementalist.fire-magic", 12])),
      spec("x", 1, vec2(50, 0)),
      spec("y", 1, vec2(900, 0)),
    );
    use(sim, "e", 0, "e", skill(TEINAI).activationSeconds + 0.1);
    stepFor(sim, 0.5);
    expect(get(sim, "x").statuses.has("teinais-heat")).toBe(true);
    expect(get(sim, "y").statuses.has("teinais-heat")).toBe(false);
    expect(sim.pips(sim.get("x") ?? expect.fail()).health).toBe(-4);
    expect(getStatusDefinition("teinais-heat").whileUnder).toMatchObject({
      statusIds: ["weakness"],
      attackDurationMultiplier: 1.33,
    });
  });
});

describe("Karei's Healing Circle (#2499)", () => {
  it("heals you and every adjacent creature, foes too, 150 at Healing Prayers 12", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [KAREI], ranks(["monk.healing-prayers", 12])),
      spec("a", 0, vec2(20, 0)),
      spec("x", 1, vec2(-20, 0)),
      spec("y", 1, vec2(500, 0)),
    );
    for (const id of ["m", "a", "x", "y"]) {
      get(sim, id).health = 100;
    }
    const log = use(sim, "m", 0, "m", skill(KAREI).activationSeconds + 0.1);
    for (const id of ["m", "a", "x"]) {
      expect(healed(log, id)).toContain(150);
    }
    expect(healed(log, "y")).not.toContain(150);
  });
});

describe("Sandstorm (#2499)", () => {
  it("strikes nearby foes each second, and attacking foes harder", () => {
    const sim = match(
      spec("e", 0, vec2(0, 0), [SANDSTORM], ranks(["elementalist.earth-magic", 12])),
      spec("t", 0, vec2(330, 0)),
      spec("x", 1, vec2(300, 0)),
      spec("y", 1, vec2(300, 30)),
    );
    expect(sim.requestAttack("x", "t")?.ok).toBe(true);
    use(sim, "e", 0, "y", skill(SANDSTORM).activationSeconds + 0.1);
    const x0 = get(sim, "x").health;
    const y0 = get(sim, "y").health;
    stepFor(sim, 5);
    const xLost = x0 - get(sim, "x").health;
    const yLost = y0 - get(sim, "y").health;
    expect(yLost).toBeGreaterThan(0);
    expect(xLost).toBeGreaterThan(yLost);
  });
});

describe("Supportive Spirit (#2499)", () => {
  it("heals the ally 41 when it takes damage while knocked down, never standing", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [SUPPORTIVE], ranks(["monk.healing-prayers", 12])),
      spec("a", 0, vec2(200, 0)),
      spec("x", 1, vec2(900, 0), [FLARE]),
    );
    use(sim, "m", 0, "a", skill(SUPPORTIVE).activationSeconds + 0.1);
    expect(get(sim, "a").statuses.has("supportive-spirit")).toBe(true);
    get(sim, "a").health = 200;
    const standing = use(sim, "x", 0, "a", skill(FLARE).activationSeconds + 1.5);
    expect(healed(standing, "a")).not.toContain(41);
    get(sim, "a").knockdownRemaining = 5;
    const down = use(sim, "x", 0, "a", skill(FLARE).activationSeconds + 1.5);
    expect(healed(down, "a")).toContain(41);
  });
});

describe("Symbolic Posture (#2499)", () => {
  it("makes the next signet recharge 68% faster at Fast Casting 12, once", () => {
    const sim = match(
      spec("m", 0, vec2(0, 0), [POSTURE, SIGNET], ranks(["mesmer.fast-casting", 12])),
      spec("x", 1, vec2(200, 0)),
    );
    use(sim, "m", 0, "m", 0.1);
    use(sim, "m", 1, "x", skill(SIGNET).activationSeconds + 0.1);
    const first = get(sim, "m").cast.rechargeRemaining.get(SIGNET) ?? 0;
    expect(first).toBeLessThan(skill(SIGNET).rechargeSeconds * 0.33);
    stepFor(sim, first + 0.1);
    use(sim, "m", 1, "x", skill(SIGNET).activationSeconds + 0.1);
    const second = get(sim, "m").cast.rechargeRemaining.get(SIGNET) ?? 0;
    expect(second).toBeGreaterThan(skill(SIGNET).rechargeSeconds * 0.9);
  });
});

describe("Glyph of Immolation (#2499)", () => {
  it("sets the foe of each of the next 3 spells on fire at Fire Magic 12, then ends", () => {
    const sim = match(
      spec("e", 0, vec2(0, 0), [IMMOLATION, FLARE], ranks(["elementalist.fire-magic", 12])),
      spec("x", 1, vec2(200, 0)),
    );
    use(sim, "e", 0, "e", skill(IMMOLATION).activationSeconds + 0.1);
    for (let n = 0; n < 3; n += 1) {
      expect(get(sim, "e").statuses.has("glyph-of-immolation")).toBe(true);
      get(sim, "x").statuses.remove("burning");
      use(sim, "e", 1, "x", skill(FLARE).activationSeconds + 1.5);
      expect(get(sim, "x").statuses.has("burning")).toBe(true);
    }
    expect(get(sim, "e").statuses.has("glyph-of-immolation")).toBe(false);
  });
});

describe("Angorodon's Gaze (#2499)", () => {
  function gaze(conditioned: boolean) {
    const sim = match(
      spec("n", 0, vec2(0, 0), [GAZE], ranks(["necromancer.soul-reaping", 12])),
      spec("x", 1, vec2(200, 0)),
    );
    const necro = get(sim, "n");
    necro.health = 200;
    necro.energy = 20;
    if (conditioned) {
      necro.statuses.apply("weakness", 10, "x", NO_RANKS);
    }
    const log = use(sim, "n", 0, "x", skill(GAZE).activationSeconds + 0.1);
    return { necro, log };
  }

  it("steals 42 Health; gives 10 Energy only to a caster with a condition", () => {
    const plain = gaze(false);
    const withCondition = gaze(true);
    expect(healed(plain.log, "n")).toContain(42);
    expect(withCondition.necro.energy - plain.necro.energy).toBeCloseTo(10, 0);
  });
});
