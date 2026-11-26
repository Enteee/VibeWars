import { describe, expect, it } from "vitest";

import { createRng, type SimulationRng } from "../rng.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "../ruleset.js";
import { getSkill } from "../skills/catalog.js";
import type { Skill } from "../skills/types.js";
import { spellModComesUp } from "../skills/spell-mods.js";
import { vec2 } from "../vec2.js";
import { MatchSimulation, type ParticipantSpec } from "../match/simulation.js";
import { defaultEquipmentFor } from "./loadout.js";
import { NO_UPGRADES, type ItemUpgrades } from "./mods.js";
import { resolveLoadout, unarmedResolvedEquipment, type SpellMods } from "./resolve.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1;
const DT = 1 / RULES.tickRateHz;
const FIRE = "elementalist.fire-magic";
const HEALING = "monk.healing-prayers";
const FIREBALL = "elementalist.fireball";
const ORISON = "monk.orison-of-healing";
const SHIELD_OF_REGENERATION = "monk.shield-of-regeneration";

/** Set 1's spell mods: a staff of `attribute` with `staff`, or a wand and a focus of it with `focus`. */
function spellModsOf(
  attribute: string,
  mods: {
    staff?: Partial<ItemUpgrades>;
    wand?: Partial<ItemUpgrades>;
    focus?: Partial<ItemUpgrades>;
  },
): SpellMods {
  const staff = mods.staff !== undefined;
  return resolveLoadout(
    {
      primaryProfession: "elementalist",
      secondaryProfession: "monk",
      allocatedRanks: new Map([[FIRE, 12]]),
      equipment: {
        ...defaultEquipmentFor("elementalist"),
        weaponSets: [
          {
            mainHand: {
              weaponId: staff ? "staff" : "wand",
              requirementAttributeId: attribute,
              upgrades: { ...NO_UPGRADES, ...(staff ? mods.staff : mods.wand) },
            },
            offHand: staff
              ? null
              : {
                  offhandId: "focus",
                  requirementAttributeId: attribute,
                  upgrades: { ...NO_UPGRADES, ...mods.focus },
                },
          },
          null,
          null,
          null,
        ],
      },
    },
    RULES.combat,
  ).weaponSets[0].equipment.spellMods;
}

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

/** Floats in order, then 0.99 forever; `draws` counts them. */
function scripted(...floats: number[]): SimulationRng & { draws: number } {
  const rng = Object.assign(createRng(1), {
    draws: 0,
    nextFloat: () => {
      rng.draws += 1;
      return floats.shift() ?? 0.99;
    },
  });
  return rng;
}

/** A caster `c` whose set's spell mods are `spellMods`, an ally `a` at half Health, a foe `f`. */
function casting(spellMods: Partial<SpellMods>, ranks = 12): MatchSimulation {
  const unarmed = unarmedResolvedEquipment(RULES.combat.armorReferenceLevel);
  const body = (id: string, team: number, x: number): ParticipantSpec => ({
    id,
    team,
    skillBar: id === "c" ? [FIREBALL, ORISON, SHIELD_OF_REGENERATION] : [],
    attributeRanks: new Map([
      [FIRE, ranks],
      [HEALING, ranks],
      ["monk.protection-prayers", 12],
    ]),
    equipment:
      id === "c" ? { ...unarmed, spellMods: { ...unarmed.spellMods, ...spellMods } } : unarmed,
    maxHealth: 500,
    startHealthFraction: id === "a" ? 0.5 : 1,
    maxEnergy: 1000,
    spawn: vec2(x, 0),
    facing: 0,
  });
  return new MatchSimulation({
    seed: "caster-mods",
    participants: [body("c", 0, 0), body("a", 0, 100), body("f", 1, 300)],
  });
}

function combatant(match: MatchSimulation, id: string) {
  const found = match.get(id);
  if (found === undefined) {
    throw new Error(`no participant ${id}`);
  }
  return found.combatant;
}

/** `c` uses bar slot `slot` at `targetId`, and the match runs `seconds`. */
function use(match: MatchSimulation, slot: number, targetId: string, seconds = 0): void {
  match.setTarget("c", targetId);
  expect(match.requestSkill("c", slot)?.check).toEqual({ ok: true });
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    match.step(DT);
  }
}

/** A source that always comes up: no mod's chance, so the test need not hunt for a seed. */
const ALWAYS = <A extends string | undefined>(attributeId: A) => ({ chance: 1, attributeId });

describe("caster chance mods (#2011)", () => {
  it("each takes its item's attribute, or acts on any spell", () => {
    expect(spellModsOf(FIRE, { staff: { prefix: "adept", suffix: "of-mastery" } })).toEqual({
      castHalves: [{ chance: 0.2, attributeId: FIRE }],
      rechargeHalves: [],
      attributePlusOne: [{ chance: 0.2, attributeId: FIRE }],
      enchantmentDurationScale: 1,
    });
    expect(
      spellModsOf(HEALING, {
        wand: { suffix: "of-quickening", inscription: "dont-think-twice" },
        focus: { suffix: "of-aptitude", inscription: "forget-me-not" },
      }),
    ).toEqual({
      castHalves: [
        { chance: 0.1, attributeId: undefined },
        { chance: 0.2, attributeId: HEALING },
      ],
      rechargeHalves: [
        { chance: 0.1, attributeId: undefined },
        { chance: 0.2, attributeId: HEALING },
      ],
      attributePlusOne: [],
      enchantmentDurationScale: 1,
    });
    expect(spellModsOf(FIRE, { staff: { suffix: "of-enchanting" } }).enchantmentDurationScale).toBe(
      1.2,
    );
  });

  it("rolls each source on its own, comes up once, and rolls nothing for a spell of another attribute", () => {
    const sources = [
      { chance: 0.2, attributeId: FIRE },
      { chance: 0.1, attributeId: undefined },
    ];
    const both = scripted(0.1, 0.05);
    expect(spellModComesUp(sources, skill(FIREBALL), both)).toBe(true);
    expect(both.draws).toBe(2);
    expect(spellModComesUp(sources, skill(FIREBALL), scripted(0.2, 0.1))).toBe(false);
    const healing = scripted(0);
    expect(spellModComesUp(sources.slice(0, 1), skill(ORISON), healing)).toBe(false);
    expect(healing.draws).toBe(0);
    // Spells only: a signet draws nothing.
    const signet = scripted(0);
    expect(spellModComesUp(sources, skill("common.resurrection-signet"), signet)).toBe(false);
    expect(signet.draws).toBe(0);
  });

  it("an Adept staff of Fire Magic halves Fireball's cast, once with two sources, and not Orison of Healing's", () => {
    const match = casting({ castHalves: [ALWAYS(FIRE), ALWAYS(undefined)] });
    use(match, 0, "f");
    expect(combatant(match, "c").cast.activeCast?.totalSeconds).toBeCloseTo(
      skill(FIREBALL).activationSeconds / 2,
      9,
    );
    const healer = casting({ castHalves: [ALWAYS(FIRE)] });
    use(healer, 1, "a");
    expect(combatant(healer, "c").cast.activeCast?.totalSeconds).toBeCloseTo(
      skill(ORISON).activationSeconds,
      9,
    );
  });

  it("of Memory halves the recharge it starts, once with two sources", () => {
    const match = casting({ rechargeHalves: [ALWAYS(HEALING), ALWAYS(undefined)] });
    use(match, 1, "a", skill(ORISON).activationSeconds + 2 * DT);
    const left = combatant(match, "c").cast.rechargeRemaining.get(ORISON) ?? 0;
    expect(left).toBeGreaterThan(skill(ORISON).rechargeSeconds / 2 - 3 * DT);
    expect(left).toBeLessThanOrEqual(skill(ORISON).rechargeSeconds / 2);
  });

  it("of Enchanting's Shield of Regeneration lasts 20% longer", () => {
    const lasting = (spellMods: Partial<SpellMods>): number => {
      const match = casting(spellMods);
      use(match, 2, "a", skill(SHIELD_OF_REGENERATION).activationSeconds + 2 * DT);
      const status = combatant(match, "a").statuses.active.find(
        ({ id }) => id === "shield-of-regeneration",
      );
      return status?.remainingSeconds ?? 0;
    };
    const plain = lasting({});
    expect(plain).toBeGreaterThan(0);
    // Both measured the same ticks after it landed, so 20% of the full 11 s apart.
    expect(lasting({ enchantmentDurationScale: 1.2 }) - plain).toBeCloseTo(11 * 0.2, 6);
  });

  it("Master of My Domain's +1 is read with the ranks: Orison heals as at rank 13", () => {
    const healed = (match: MatchSimulation): number => {
      const before = combatant(match, "a").health;
      use(match, 1, "a", skill(ORISON).activationSeconds + 2 * DT);
      return combatant(match, "a").health - before;
    };
    const mastered = healed(casting({ attributePlusOne: [ALWAYS(HEALING)] }));
    expect(mastered).toBe(healed(casting({}, 13)));
    expect(mastered).toBeGreaterThan(healed(casting({})));
  });
});
