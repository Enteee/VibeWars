import { describe, expect, it } from "vitest";

import { AREA_EARSHOT, RANGE_NATURE_RITUAL } from "../distances.js";
import { createRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { vec2, type Vec2 } from "../vec2.js";
import { payCost } from "./activation.js";
import { getSkill } from "./catalog.js";
import { describeSkill } from "./describe.js";
import { applySkillEffects, type CombatEvent } from "./effects.js";
import { makeCombatant } from "./testing.js";
import type { Combatant, Skill, SurroundingBody, Surroundings } from "./types.js";
import { NO_RANKS } from "./status.js";

/**
 * The Ritualist's heals (#955): Mend Body and Soul, Spirit Light and
 * Wielder's Boon, at Restoration Magic 12. Mend Body and Soul's and
 * Spirit Light's spirit clauses (#1064) count spirits of any team.
 */

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.combat;
const RANKS = new Map([["ritualist.restoration-magic", 12]]);

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`unknown skill ${id}`);
  }
  return found;
}

function ritualist(): Combatant {
  return makeCombatant({
    id: "caster",
    attributeRanks: RANKS,
    energy: 30,
    maxHealth: 500,
    health: 500,
  });
}

/** An ally well below its maximum, so no heal is cut short. */
function ally(): Combatant {
  return makeCombatant({ id: "ally", maxHealth: 500, health: 100 });
}

/**
 * The caster at the origin, the ally at `allyAt`, and a spirit, of the
 * foe's team, at each of `spirits`.
 */
function around(
  caster: Combatant,
  target: Combatant,
  allyAt: Vec2,
  spirits: readonly Vec2[],
): Surroundings {
  return new Map<string, SurroundingBody>([
    [
      caster.id,
      { combatant: caster, position: vec2(0, 0), creature: undefined, corpseExploited: false },
    ],
    [
      target.id,
      { combatant: target, position: allyAt, creature: undefined, corpseExploited: false },
    ],
    ...spirits.map((position, index) => {
      const id = `spirit${String(index)}`;
      const spirit = makeCombatant({ id, team: 1 });
      const candidate: SurroundingBody = {
        combatant: spirit,
        position,
        creature: {
          ownerId: "f",
          kind: "spirit",
          look: "spirit",
          name: "Winnowing",
          expiresInSeconds: Infinity,
          ageSeconds: 0,
          summonedAtTick: 0,
          skillId: "ranger.winnowing",
          aura: { statusId: "winnowing", affects: "all", radius: RANGE_NATURE_RITUAL },
          onDeath: "vanish",
          ownerDisableSeconds: 0,
          deathBurst: undefined,
          onDeathInRange: undefined,
          replacedBy: undefined,
          corpsesLeft: 0,
          companionSkillId: undefined,
          leaderId: undefined,
          mode: "guard",
        },
        corpseExploited: false,
      };
      return [id, candidate] as const;
    }),
  ]);
}

/** `user` pays for `skillId` and it lands on `target`. */
function use(
  user: Combatant,
  skillId: string,
  target: Combatant,
  surroundings: Surroundings = new Map(),
): CombatEvent[] {
  payCost(skill(skillId), user);
  return applySkillEffects({
    surroundings,
    skill: skill(skillId),
    caster: user,
    targets: [target],
    rng: createRng(1),
    rules: RULES,
  });
}

describe("Mend Body and Soul (#955)", () => {
  it("heals 96 and leaves the ally's conditions alone, with no spirit in earshot", () => {
    const target = ally();
    target.statuses.apply("bleeding", 10, "foe", NO_RANKS);
    target.statuses.apply("weakness", 10, "foe", NO_RANKS);
    const events = use(ritualist(), "ritualist.mend-body-and-soul", target);
    expect(events).toEqual([{ kind: "heal", targetId: "ally", amount: 96 }]);
    expect(target.health).toBe(196);
    expect(target.statuses.countByCategory("condition")).toBe(2);
  });

  it("removes one condition for each spirit in earshot of the ally, any team's (#1064)", () => {
    const conditions = (spirits: readonly Vec2[]): number => {
      const caster = ritualist();
      const target = ally();
      for (const id of ["bleeding", "weakness", "crippled"] as const) {
        target.statuses.apply(id, 10, "foe", NO_RANKS);
      }
      const at = vec2(300, 0);
      use(caster, "ritualist.mend-body-and-soul", target, around(caster, target, at, spirits));
      return target.statuses.countByCategory("condition");
    };
    // Two by the ally, beyond earshot of the caster: two go.
    expect(conditions([vec2(300 + AREA_EARSHOT, 0), vec2(300, 100)])).toBe(1);
    expect(conditions([])).toBe(3);
    // In earshot of the caster, not of the ally: none.
    expect(conditions([vec2(300 - AREA_EARSHOT - 1, 0)])).toBe(3);
  });

  it("says so on its card (#1064)", () => {
    expect(
      describeSkill(skill("ritualist.mend-body-and-soul"), RANKS).effects.map(({ text }) => text),
    ).toEqual(["Heals for 96", "Removes 1 condition for each spirit in earshot of it"]);
  });
});

describe("Spirit Light (#955)", () => {
  it("sacrifices 17% of the caster's health, then heals the ally 156", () => {
    const caster = ritualist();
    const target = ally();
    const events = use(caster, "ritualist.spirit-light", target);
    expect(events).toEqual([
      { kind: "sacrifice", targetId: "caster", amount: 85 },
      { kind: "heal", targetId: "ally", amount: 156 },
    ]);
    expect(caster.health).toBe(415);
    expect(target.health).toBe(256);
  });

  it("sacrifices nothing with a spirit, any team's, in earshot of the caster (#1064)", () => {
    const sacrificed = (spirit: Vec2): number => {
      const caster = ritualist();
      const target = ally();
      use(caster, "ritualist.spirit-light", target, around(caster, target, vec2(400, 0), [spirit]));
      return 500 - caster.health;
    };
    expect(sacrificed(vec2(0, AREA_EARSHOT))).toBe(0);
    // By the ally, out of the caster's earshot: paid.
    expect(sacrificed(vec2(AREA_EARSHOT + 1, 0))).toBe(85);
    expect(
      describeSkill(skill("ritualist.spirit-light"), RANKS).effects.map(({ text }) => text),
    ).toEqual([
      "If no spirit is in earshot of you: you sacrifice 17% of your maximum health",
      "Heals for 156",
    ]);
  });

  it("cast on yourself, sacrifices and then heals the caster", () => {
    const caster = ritualist();
    caster.health = 200;
    const events = use(caster, "ritualist.spirit-light", caster);
    expect(events).toEqual([
      { kind: "sacrifice", targetId: "caster", amount: 85 },
      { kind: "heal", targetId: "caster", amount: 156 },
    ]);
    expect(caster.health).toBe(271);
  });
});

describe("Wielder's Boon (#955)", () => {
  const BOON = "ritualist.wielders-boon";

  it("heals a bare ally 51", () => {
    const target = ally();
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
    ]);
    expect(target.health).toBe(151);
  });

  it("heals 63 more an ally under a weapon spell", () => {
    const target = ally();
    target.statuses.apply("weapon-of-warding", 7, "caster", NO_RANKS);
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
      { kind: "heal", targetId: "ally", amount: 63 },
    ]);
    expect(target.health).toBe(214);
  });

  it("gives no bonus for an enchantment", () => {
    const target = ally();
    target.statuses.apply("regeneration", 10, "caster", NO_RANKS);
    expect(use(ritualist(), BOON, target)).toEqual([
      { kind: "heal", targetId: "ally", amount: 51 },
    ]);
  });
});
