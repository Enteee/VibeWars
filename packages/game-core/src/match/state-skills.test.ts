import { describe, expect, it } from "vitest";

import { unarmedResolvedEquipment, type ResolvedEquipment } from "../equipment/resolve.js";
import { WEAPONS, weaponDamageType, type Weapon } from "../equipment/weapons.js";
import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { payCost } from "../skills/activation.js";
import { getSkill } from "../skills/catalog.js";
import { applySkillEffects, type CombatEvent } from "../skills/effects.js";
import { makeCombatant } from "../skills/testing.js";
import type { Combatant, Skill } from "../skills/types.js";
import { resolveAttackSkill } from "../skills/weapon-attack.js";
import { vec2 } from "../vec2.js";
import type { CombatLogEntry } from "./combat-log.js";
import { MatchSimulation, type ParticipantSpec } from "./simulation.js";
import { NO_RANKS } from "../skills/status.js";

/**
 * The skills whose effects depend on how things stand (#794), each in a
 * scripted duel, with the state and without it.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function wielding(weapon: Weapon, attributeId: string): ResolvedEquipment {
  return {
    ...unarmedResolvedEquipment(RULES.combat.armorReferenceLevel),
    mainHand: {
      weapon,
      attributeId,
      damageType: weaponDamageType(weapon, attributeId),
      requirementMet: true,
      creatureDamageScale: undefined,
    },
  };
}

const damages = (events: readonly CombatEvent[]): number[] =>
  events.flatMap((event) => (event.kind === "damage" ? [event.amount] : []));

describe("Word of Healing (#794)", () => {
  const monk = (): Combatant =>
    makeCombatant({ id: "monk", attributeRanks: new Map([["monk.healing-prayers", 12]]) });

  function heal(health: number): number {
    const caster = monk();
    const ally = makeCombatant({ id: "ally", health, maxHealth: 500 });
    const word = skill("monk.word-of-healing");
    payCost(word, caster);
    applySkillEffects({
      surroundings: new Map(),
      skill: word,
      caster,
      targets: [ally],
      rng: createRng(1),
      rules: RULES.combat,
    });
    return ally.health - health;
  }

  it("heals 81, and 98 more for an ally below half health", () => {
    expect(heal(200)).toBe(81 + 98);
    expect(heal(249)).toBe(81 + 98);
  });

  it("heals 81 alone at half health or above", () => {
    expect(heal(250)).toBe(81);
    expect(heal(400)).toBe(81);
  });

  it("is an elite Monk spell", () => {
    expect(skill("monk.word-of-healing")).toMatchObject({
      elite: true,
      flash: false,
      disabledAfterUseSeconds: undefined,
      profession: "monk",
      type: "spell",
    });
  });
});

describe("Mystic Sweep (#794)", () => {
  /** Rolls 10, never crits, never blocks. */
  const fixed = (): SimulationRng =>
    Object.assign(createRng(1), { nextInt: () => 10, nextFloat: () => 0.99 });

  function sweep(enchanted: boolean): CombatEvent[] {
    const dervish = makeCombatant({
      id: "dervish",
      equipment: wielding(WEAPONS.scythe, "dervish.scythe-mastery"),
      attributeRanks: new Map([
        ["dervish.scythe-mastery", 12],
        ["dervish.mysticism", 12],
      ]),
    });
    if (enchanted) {
      dervish.statuses.apply("regeneration", 10, "dervish", NO_RANKS);
    }
    const victim = makeCombatant({ id: "foe", team: 1, health: 1e6, maxHealth: 1e6 });
    return resolveAttackSkill(
      {
        surroundings: new Map(),
        skill: skill("dervish.mystic-sweep"),
        caster: dervish,
        targets: [victim],
        rng: fixed(),
        rules: RULES.combat,
      },
      () => false,
      [],
    );
  }

  it("enchanted, its blow deals 10 more, in the one damage number", () => {
    const plain = damages(sweep(false));
    const enchanted = damages(sweep(true));
    expect(plain).toHaveLength(1);
    expect(enchanted).toHaveLength(1);
    expect((enchanted[0] ?? 0) - (plain[0] ?? 0)).toBe(10);
  });
});

describe("Savage Shot (#794)", () => {
  const SAVAGE = "ranger.savage-shot";

  function archer(): ParticipantSpec {
    return {
      id: "archer",
      team: 0,
      skillBar: [SAVAGE],
      attributeRanks: new Map([["ranger.marksmanship", 12]]),
      equipment: wielding(WEAPONS.longbow, "ranger.marksmanship"),
      maxEnergy: 1000,
      spawn: vec2(0, 0),
      facing: 0,
    };
  }

  function foe(): ParticipantSpec {
    return {
      id: "foe",
      team: 1,
      skillBar: [],
      attributeRanks: new Map(),
      equipment: unarmedResolvedEquipment(60),
      maxHealth: 1e6,
      spawn: vec2(300, 0),
      facing: 0,
    };
  }

  function get(match: MatchSimulation, id: string) {
    const found = match.get(id);
    if (found === undefined) {
      throw new Error(`no participant ${id}`);
    }
    return found;
  }

  /**
   * Shoot Savage Shot at a foe that, while it flies, starts on
   * `busyWith` (or nothing), and return what the arrow did as it landed.
   */
  function shootAt(
    busyWith: string | undefined,
    prepare: (match: MatchSimulation) => void = () => undefined,
    seed = "savage",
  ): CombatLogEntry {
    const match = new MatchSimulation({ seed, participants: [archer(), foe()] });
    prepare(match);
    match.setTarget("archer", "foe");
    expect(match.requestSkill("archer", 0)?.check).toEqual({ ok: true });
    for (let i = 0; i < 400; i += 1) {
      match.step(DT);
      if (match.projectiles.length > 0) {
        break;
      }
    }
    if (busyWith !== undefined) {
      get(match, "foe").combatant.cast.beginCast(busyWith, "foe", 3, undefined);
    }
    for (let i = 0; i < 400; i += 1) {
      const entry = match
        .step(DT)
        .log.find((logged) => logged.skillId === SAVAGE && logged.events.length > 0);
      if (entry !== undefined) {
        return entry;
      }
    }
    throw new Error("nothing landed");
  }

  const kinds = (entry: CombatLogEntry) => entry.events.map((event) => event.kind);

  it("on a foe casting a spell: 25 more damage on the hit, and the spell is interrupted", () => {
    const casting = shootAt("elementalist.fireball");
    const attacking = shootAt("warrior.distracting-blow");
    expect(kinds(casting)).toEqual(["damage", "interrupted"]);
    expect(kinds(attacking)).toEqual(["damage", "interrupted"]);
    // The same seed rolls the same blow; the bonus ignores armor (#760).
    expect((damages(casting.events)[0] ?? 0) - (damages(attacking.events)[0] ?? 0)).toBe(25);
  });

  it("on a foe using an attack skill: no bonus, still interrupted", () => {
    const attacking = shootAt("warrior.distracting-blow");
    const idle = shootAt(undefined);
    expect(damages(attacking.events)).toEqual(damages(idle.events));
    expect(attacking.events).toContainEqual({
      kind: "interrupted",
      targetId: "foe",
      skillId: "warrior.distracting-blow",
    });
  });

  it("on a dazed foe casting a spell: the bonus, and one interrupt, not a miss too (#817)", () => {
    const dazed = shootAt("elementalist.fireball", (match) => {
      get(match, "foe").combatant.statuses.apply("dazed", 60, "archer", NO_RANKS);
    });
    // Daze interrupts as the blow lands; Savage Shot's own interrupt then
    // finds nothing, and says nothing of it.
    expect(kinds(dazed)).toEqual(["interrupted", "damage"]);
    expect(damages(dazed.events)).toEqual(damages(shootAt("elementalist.fireball").events));
  });

  it("blocked, it gives neither the bonus nor the interrupt", () => {
    const guarded = (match: MatchSimulation): void => {
      get(match, "foe").combatant.statuses.apply("guardian", 60, "monk", NO_RANKS);
    };
    // The first seed whose shot is blocked.
    for (let seed = 0; seed < 20; seed += 1) {
      const landed = shootAt("elementalist.fireball", guarded, `block-${String(seed)}`);
      if (kinds(landed).includes("attack-blocked")) {
        expect(kinds(landed)).toEqual(["attack-blocked"]);
        return;
      }
    }
    throw new Error("no seed blocked the shot");
  });

  it("blind, it misses at the release: neither the bonus nor the interrupt", () => {
    const match = new MatchSimulation({ seed: "savage", participants: [archer(), foe()] });
    get(match, "archer").combatant.statuses.apply("blind", 60, "foe", NO_RANKS);
    get(match, "foe").combatant.cast.beginCast("elementalist.fireball", "foe", 30, undefined);
    match.setTarget("archer", "foe");
    expect(match.requestSkill("archer", 0)?.check).toEqual({ ok: true });
    const events: CombatEvent[] = [];
    for (let i = 0; i < 200; i += 1) {
      for (const entry of match.step(DT).log) {
        events.push(...entry.events);
      }
    }
    expect(events.map((event) => event.kind)).toContain("attack-missed");
    expect(damages(events)).toEqual([]);
    expect(get(match, "foe").combatant.cast.isCasting).toBe(true);
  });
});
