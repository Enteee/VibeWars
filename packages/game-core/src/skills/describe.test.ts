import { describe, expect, it } from "vitest";

import { AREA_ADJACENT, AREA_IN_THE_AREA, AREA_NEARBY, RANGE_SPELL } from "../distances.js";

import { IMPLEMENTED_SKILLS, getSkill } from "./catalog.js";
import {
  chainRequirementText,
  describeSkill,
  describeStatus,
  formatScalingRange,
  secondPerson,
  TRIGGER_WHEN,
} from "./describe.js";
import { creatureDamageMultiplier } from "./damage.js";
import { makeCombatant, withAttackDuration } from "./testing.js";
import { resolveMagnitude, resolveMagnitudeAtRanks } from "./scaling.js";
import { STATUS_DEFINITIONS } from "./status.js";
import { blowRuleOf, isEasilyInterrupted, type SkillEffect } from "./types.js";

/**
 * Descriptions are generated from the effect data, never authored, so
 * the thing most worth testing is that they agree with what the
 * simulation will actually do. A tooltip promising 91 damage while
 * combat deals 70 is the exact failure these tests exist to prevent.
 */

function skill(id: string) {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`${id} is not in the catalog`);
  }
  return found;
}

describe("describeSkill", () => {
  it("reports the number the simulation would actually produce", () => {
    // The anti-drift assertion: compare the description against
    // `resolveMagnitude`, which is what `applyEffects` calls.
    const ranks = new Map([["elementalist.fire-magic", 9]]);
    const fireball = skill("elementalist.fireball");
    const described = describeSkill(fireball, ranks);

    const damage = fireball.effects.find((effect) => effect.kind === "damage");
    expect(damage).toBeDefined();
    if (damage?.kind !== "damage") {
      return;
    }
    const simulated = resolveMagnitude(
      damage.amount,
      makeCombatant({ id: "c", team: 0, attributeRanks: ranks }),
    );

    expect(described.effects[0]?.magnitude?.current).toBe(simulated);
    expect(described.effects[0]?.text).toContain(String(simulated));
  });

  it("changes with the attribute rank", () => {
    const fireball = skill("elementalist.fireball");
    const weak = describeSkill(fireball, new Map([["elementalist.fire-magic", 0]]));
    const strong = describeSkill(fireball, new Map([["elementalist.fire-magic", 12]]));

    expect(strong.effects[0]?.magnitude?.current).toBeGreaterThan(
      weak.effects[0]?.magnitude?.current ?? Infinity,
    );
  });

  it("describes an unallocated character at rank 0, not at some typical rank", () => {
    const atZero = describeSkill(skill("elementalist.fireball"), new Map());
    const explicitZero = describeSkill(
      skill("elementalist.fireball"),
      new Map([["elementalist.fire-magic", 0]]),
    );

    expect(atZero.effects[0]?.text).toBe(explicitZero.effects[0]?.text);
  });

  it("says how much armor a damage effect ignores, when it ignores any (#761)", () => {
    const orb = describeSkill(
      skill("elementalist.lightning-orb"),
      new Map([["elementalist.air-magic", 12]]),
    );
    expect(orb.effects[0]?.text).toBe("Deals 82 lightning damage (25% armor penetration)");
    expect(describeSkill(skill("elementalist.fireball")).effects[0]?.text).not.toContain("armor");
  });

  it("names a damage type in the line and the headline, and leaves typeless unnamed (#1724)", () => {
    const fireball = describeSkill(
      skill("elementalist.fireball"),
      new Map([["elementalist.fire-magic", 12]]),
    );
    expect(fireball.effects[0]?.text).toBe("Deals 91 fire damage");
    expect(fireball.headline).toBe("91 fire damage");
    const shadow = describeSkill(skill("necromancer.shadow-strike"));
    expect(shadow.effects.map(({ text }) => text)).toContain("Deals 12 shadow damage");
    const vile = describeSkill(skill("necromancer.vile-touch"));
    expect(vile.effects[0]?.text).toMatch(/^Deals \d+ damage$/);
    expect(vile.headline).toMatch(/^\d+ damage$/);
  });

  it("names the attribute in readable form", () => {
    expect(describeSkill(skill("elementalist.fireball")).attributeName).toBe("Fire Magic");
  });

  it("formats cost, cast, recharge and target for display", () => {
    const described = describeSkill(skill("elementalist.fireball"));

    expect(described.cost).toBe("10 energy");
    expect(described.castTime).toBe("1s");
    expect(described.targetText).toBe("One foe, and foes nearby it");
    expect(described.rangeText).toBe(`${String(RANGE_SPELL)} range, ${String(AREA_NEARBY)} radius`);
  });

  it("words Monk staples 2 (#1013)", () => {
    const ranks = new Map([
      ["monk.healing-prayers", 12],
      ["monk.protection-prayers", 12],
    ]);
    const party = describeSkill(skill("monk.heal-party"), ranks);
    expect(party.targetText).toBe("Your whole party");
    expect(party.rangeText).toBeUndefined();
    expect(party.effects.map((line) => line.text)).toEqual(["Heals for 66"]);
    expect(
      describeSkill(skill("monk.dismiss-condition"), ranks).effects.map((line) => line.text),
    ).toEqual(["Removes 1 condition", "If target has an enchantment: heals for 63"]);
    expect(describeSkill(skill("monk.healing-breeze"), ranks).effects[0]?.text).toBe(
      "Applies Healing Breeze for 15s (+8 Health regeneration)",
    );
    expect(describeSkill(skill("monk.remove-hex")).effects[0]?.text).toBe("Removes 1 hex");
  });

  it("names the foes round its target a target-centred area also hits (#998)", () => {
    const lines = (id: string): readonly [string, string | undefined] => {
      const described = describeSkill(skill(id));
      return [described.targetText, described.rangeText];
    };
    const range = (radius: number): string =>
      `${String(RANGE_SPELL)} range, ${String(radius)} radius`;
    expect(lines("elementalist.chain-lightning")).toEqual([
      "One foe, and up to 2 foes nearby it",
      range(AREA_NEARBY),
    ]);
    expect(lines("elementalist.ice-spikes")).toEqual([
      "One foe, and foes adjacent to it",
      range(AREA_ADJACENT),
    ]);
    expect(lines("elementalist.meteor")).toEqual([
      "One foe, and foes adjacent to it",
      range(AREA_ADJACENT),
    ]);
    expect(lines("elementalist.deep-freeze")).toEqual([
      "One foe, and foes in the area around it",
      range(AREA_IN_THE_AREA),
    ]);
    // No area, and a shout round its caster: as before.
    const orison = describeSkill(skill("monk.orison-of-healing"));
    expect(orison.targetText).toBe("One ally");
    expect(orison.rangeText).toBe(`${String(skill("monk.orison-of-healing").range)} range`);
    expect(lines("warrior.watch-yourself")).toEqual(["Allies in earshot", "350 radius"]);
  });

  it("says a flying spell can be dodged (#535)", () => {
    expect(describeSkill(skill("elementalist.fireball")).effects.map((e) => e.text)).toContain(
      "Projectile: can be dodged",
    );
    expect(describeSkill(skill("monk.orison-of-healing")).effects.map((e) => e.text)).not.toContain(
      "Projectile: can be dodged",
    );
  });

  it("says Comfort Animal acts on your pet, and Charm Animal brings one (#1046)", () => {
    const comfort = describeSkill(
      skill("ranger.comfort-animal"),
      new Map([["ranger.beast-mastery", 12]]),
    );
    expect(comfort.targetText).toBe("Your pet");
    expect(comfort.effects.map((e) => e.text)).toEqual([
      "Heals for 87",
      "Returns the target to life with 48% health and 0% energy",
    ]);
    expect(describeSkill(skill("ranger.charm-animal")).effects.map((e) => e.text)).toEqual([
      "While on your bar, a Wolf (480 Health) fights beside you",
    ]);
  });

  it("says a call acts on your living pet, and Revive Animal on every dead pet nearby (#1108)", () => {
    const ranks = new Map([["ranger.beast-mastery", 12]]);
    const described = (id: string) => describeSkill(skill(id), ranks);
    expect(described("ranger.call-of-haste").targetText).toBe("Your living pet");
    expect(described("ranger.revive-animal").effects.map((e) => e.text)).toEqual([
      "Returns every dead allied pet nearby to life with 77% health",
    ]);
  });

  it("says what a summon makes, how tough and for how long (#1052)", () => {
    const summon = (durationSeconds?: number): SkillEffect => ({
      kind: "summon",
      count: 2,
      creature: {
        kind: "minion",
        look: "bone-minion",
        name: "Bone Minion",
        maxHealth: {
          scaling: { attributeId: "necromancer.death-magic", atZero: 50, atTwelve: 290 },
        },
        armor: { flat: 20 },
        attack: undefined,
        ...(durationSeconds === undefined ? {} : { durationSeconds: { flat: durationSeconds } }),
        behaviour: { kind: "idle" },
        aura: undefined,
        replacedBy: undefined,
        leavesCorpses: undefined,
        onePerOwner: false,
        onDeath: "vanish",
        ownerDisableOnDeath: undefined,
        deathBurst: undefined,
        onDeathInRange: undefined,
      },
    });
    const lines = (effect: SkillEffect) =>
      describeSkill(
        { ...skill("monk.orison-of-healing"), effects: [effect] },
        new Map([["necromancer.death-magic", 12]]),
      ).effects.map((e) => e.text);
    expect(lines(summon(30))).toContain("Summons 2 Bone Minion (290 Health, lasts 30 seconds)");
    expect(lines(summon())).toContain("Summons 2 Bone Minion (290 Health)");
  });

  it("says Instant rather than 0s", () => {
    const instant = IMPLEMENTED_SKILLS.find((s) => s.activationSeconds === 0);
    expect(instant).toBeDefined();
    if (instant === undefined) {
      return;
    }
    expect(describeSkill(instant).castTime).toBe("Instant");
  });

  it("reports an adrenaline cost as adrenaline", () => {
    expect(describeSkill(skill("warrior.sever-artery")).cost).toContain("adrenaline");
  });

  it("says Self once for a self-cast, with no range of its own", () => {
    const described = describeSkill(skill("elementalist.armor-of-earth"));

    expect(described.targetText).toBe("Self");
    expect(described.rangeText).toBeUndefined();
  });

  it("says Another ally for a skill that cannot target its caster (#503)", () => {
    expect(describeSkill(skill("necromancer.blood-ritual")).targetText).toBe("Another ally");
  });

  it("explains what an applied status does, not just its name", () => {
    const described = describeSkill(skill("warrior.sever-artery"));
    const line = described.effects.map((effect) => effect.text).join(" ");

    expect(line).toContain("Bleeding");
    expect(line).toContain("−3 Health degeneration");
  });

  it("says what Swift Chop does when blocked, after what it does on a hit (#534)", () => {
    const ranks = new Map([["warrior.axe-mastery", 12]]);
    const lines = describeSkill(skill("warrior.swift-chop"), ranks).effects.map((e) => e.text);
    expect(lines).toEqual([
      "+16 damage",
      "If blocked: deals 16 damage",
      expect.stringContaining("If blocked: applies Deep Wound for 20s"),
    ]);
  });

  it("leads what depends on an earlier effect with its condition (#521)", () => {
    const ranks = new Map([
      ["mesmer.domination-magic", 12],
      ["mesmer.inspiration-magic", 12],
    ]);
    const lines = (id: string) => describeSkill(skill(id), ranks).effects.map((e) => e.text);
    expect(lines("mesmer.power-spike")).toEqual([
      "Interrupts the target's spell or chant, if they are casting one",
      "If it interrupts a skill: deals 102 damage",
    ]);
    expect(lines("mesmer.drain-enchantment")).toEqual([
      "Removes 1 enchantment",
      "If it removes an enchantment: gain 15 energy",
      "If it removes an enchantment: you gain 104 health",
    ]);
    expect(describeSkill(skill("mesmer.power-spike"), ranks).headline).toBe("102 damage");
  });

  it("words Concussion Shot's spell-only interrupt and its daze (#1008)", () => {
    const ranks = new Map([["ranger.marksmanship", 12]]);
    expect(
      describeSkill(skill("ranger.concussion-shot"), ranks).effects.map((e) => e.text),
    ).toEqual([
      "Deals only 13 damage",
      "Interrupts the target's spell, if they are casting one",
      "If that action was a spell: applies Dazed for 17s (spells take 2× as long to cast, spells are interrupted by attacks)",
    ]);
  });

  it("says what a disable locks out, and for how long (#914)", () => {
    const ranks = new Map([
      ["mesmer.domination-magic", 12],
      ["ranger.expertise", 12],
    ]);
    const lines = (id: string) => describeSkill(skill(id), ranks).effects.map((e) => e.text);
    expect(lines("mesmer.power-block")).toEqual([
      "Interrupts the target's spell or chant, if they are casting one",
      "That skill and all skills of the same attribute are disabled for 10 seconds",
    ]);
    expect(lines("ranger.distracting-shot")).toEqual([
      "Deals only 13 damage",
      "Interrupts the target's action: a skill or an attack",
      "The interrupted skill is disabled for 20 seconds",
    ]);
  });

  it("leads what depends on how things stand with its condition (#794)", () => {
    const ranks = new Map([
      ["monk.healing-prayers", 12],
      ["dervish.mysticism", 12],
      ["ranger.marksmanship", 12],
      ["ritualist.restoration-magic", 12],
    ]);
    const lines = (id: string) => describeSkill(skill(id), ranks).effects.map((e) => e.text);
    expect(lines("monk.word-of-healing")).toEqual([
      "Heals for 81",
      "If target is below 50% Health: heals for 98",
    ]);
    expect(lines("dervish.mystic-sweep")).toEqual([
      "+10 damage",
      "If you have an enchantment: +10 damage",
    ]);
    expect(lines("ranger.savage-shot")).toEqual([
      "If target is casting a spell: +25 damage",
      "Interrupts the target's action: a skill or an attack",
    ]);
    expect(lines("ritualist.wielders-boon")).toEqual([
      "Heals for 51",
      "If target has a weapon spell: heals for 63",
    ]);
  });

  it("says how much a resurrection brings back, and whom it is for (#812)", () => {
    const ranks = new Map([["monk.healing-prayers", 12]]);
    const card = describeSkill(skill("monk.restore-life"), ranks);
    expect(card.effects.map((e) => e.text)).toEqual([
      "Returns the target to life with 56% health and 80% energy",
    ]);
    expect(card.headline).toBe("resurrects, 56% health");
    expect(card.targetText).toBe("A dead ally");
  });

  it("words the four resurrection skills at rank 0 and 12 (#474)", () => {
    const at = (rank: number) =>
      new Map([
        ["monk.protection-prayers", rank],
        ["paragon.leadership", rank],
        ["ritualist.restoration-magic", rank],
      ]);
    const lines = (id: string, rank: number) =>
      describeSkill(skill(id), at(rank)).effects.map((e) => e.text);
    expect(lines("common.resurrection-signet", 0)).toEqual([
      "Returns the target to life with 100% health and 25% energy",
    ]);
    expect(lines("monk.rebirth", 12)).toEqual([
      "Returns the target to life with 25% health and 0% energy, and teleports the target to you",
      "If it resurrects: all of the target's skills are disabled for 4 seconds",
      "You lose all your remaining energy",
    ]);
    expect(lines("monk.rebirth", 0)[1]).toBe(
      "If it resurrects: all of the target's skills are disabled for 10 seconds",
    );
    expect(lines("paragon.signet-of-return", 12)).toEqual([
      "Returns the target to life with 13% health and 3% energy per party member in earshot",
    ]);
    expect(lines("paragon.signet-of-return", 0)).toEqual([
      "Returns the target to life with 5% health and 1% energy per party member in earshot",
    ]);
    expect(lines("ritualist.flesh-of-my-flesh", 12)).toEqual([
      "Returns the target to life with your health after losing half and 17% energy",
    ]);
    expect(lines("ritualist.flesh-of-my-flesh", 0)).toEqual([
      "Returns the target to life with your health after losing half and 5% energy",
    ]);
    expect(describeSkill(skill("ritualist.flesh-of-my-flesh"), at(12)).headline).toBe(
      "resurrects, 17% energy",
    );
  });

  it("says a skill spent until a morale boost recharges on one (#474)", () => {
    expect(describeSkill(skill("common.resurrection-signet"), new Map()).recharge).toBe(
      "Morale boost",
    );
    expect(describeSkill(skill("monk.restore-life"), new Map()).recharge).toBe("8s");
  });

  it("says what is taken, and what comes per point of it (#793)", () => {
    const ranks = new Map([
      ["mesmer.domination-magic", 12],
      ["mesmer.inspiration-magic", 12],
    ]);
    const lines = (id: string) => describeSkill(skill(id), ranks).effects.map((e) => e.text);
    expect(lines("mesmer.energy-burn")).toEqual([
      "Target loses 8 energy",
      "Deals 9 damage per point lost",
    ]);
    expect(lines("mesmer.energy-tap")).toEqual([
      "Target loses 6 energy",
      "Gain 2 energy per point lost",
    ]);
    expect(describeSkill(skill("mesmer.energy-burn"), ranks).headline).toBe("drains 8 energy");
  });

  it("words Energy Surge's splash, Leech Signet's spell and Dwayna's Kiss's count (#920)", () => {
    const ranks = new Map([
      ["mesmer.domination-magic", 12],
      ["mesmer.inspiration-magic", 12],
      ["monk.healing-prayers", 12],
    ]);
    const lines = (id: string) => describeSkill(skill(id), ranks).effects.map((e) => e.text);
    expect(lines("mesmer.energy-surge")).toEqual([
      "Target loses 8 energy",
      "Deals 7 damage per point lost",
      "Nearby foes take 5.25 damage for each point of energy lost",
    ]);
    expect(lines("mesmer.leech-signet")).toEqual([
      "Interrupts the target's action: a skill or an attack",
      "If that action was a spell: gain 13 energy",
    ]);
    expect(lines("monk.dwaynas-kiss")).toEqual([
      "Heals for 51, +30 Health for each enchantment or hex on them",
    ]);
  });

  it("says Guardian blocks half of all attacks (#534)", () => {
    expect(describeStatus("guardian")).toBe("50% chance to block attacks");
  });

  it("says a bow-only rider's damage once, with its type and its splash (#1629)", () => {
    expect(describeStatus("kindle-arrows")).toBe(
      "bow attacks deal fire damage, foes your bow attacks hit take 20 fire damage",
    );
    expect(describeStatus("ignite-arrows")).toBe(
      "foes your bow attacks hit take 15 fire damage, and so do foes adjacent to them",
    );
  });

  it("says what the calls and the bond do to a pet (#1108)", () => {
    expect(describeStatus("call-of-protection")).toBe("−17 damage taken");
    expect(describeStatus("symbiotic-bond")).toContain(
      "half its physical damage goes to its caster",
    );
  });

  it("says when an echo renews or fires, and how often (#1423)", () => {
    expect(describeStatus("purifying-finale")).toBe(
      "whenever a chant or shout ends on it: removes 1 condition",
    );
    expect(describeStatus("hasty-refrain")).toBe(
      "moves at 125% speed, renewed whenever a chant or shout ends on it",
    );
    expect(describeStatus("enduring-harmony")).toBe("chants and shouts last 50% longer on it");
    expect(describeStatus("finale-of-restoration")).toContain("ends after it takes effect 5 times");
  });

  it("says what Paragon echoes 2 do (#1485)", () => {
    expect(describeStatus("bladeturn-refrain")).toBe(
      "+34 slashing armor, renewed whenever a chant or shout ends on it",
    );
    expect(describeStatus("energizing-finale")).toBe(
      "whenever a chant or shout ends on it: it gains 2 energy",
    );
    expect(describeStatus("soldiers-fury")).toBe(
      "-20 armor, while under a shout or chant: attacks 33% faster, gain adrenaline 33% faster",
    );
  });

  it("says weakness cuts the weapon and every attribute (#762)", () => {
    expect(describeStatus("weakness")).toBe("−66% weapon damage, −1 to all attributes");
  });

  it("says which attributes a boost raises, and for what (#1941)", () => {
    expect(describeStatus("glyph-of-elemental-power")).toBe(
      "+2 to elemental attributes, for your next 10 spells",
    );
    expect(describeStatus("glyph-of-energy")).toBe(
      "+2 to elemental attributes, your next 3 spells cost 22 less energy, no Overcast",
    );
    expect(describeStatus("ritual-lord")).toBe(
      "+4 to Ritualist attributes, for your next skill, if it is a binding ritual, " +
        "it recharges 50% faster and Ritual Lord recharges instantly",
    );
    expect(describeStatus("experts-dexterity")).toBe("+1 to Marksmanship, attacks 15% faster");
  });

  it("gives a glyph with no end of its own no duration (#1941)", () => {
    expect(describeSkill(skill("elementalist.glyph-of-energy")).effects[0]?.text).toBe(
      "+2 to elemental attributes, your next 3 spells cost 22 less energy, no Overcast",
    );
    expect(describeSkill(skill("elementalist.glyph-of-elemental-power")).effects[0]?.text).toMatch(
      /^For 25s, /,
    );
  });

  it("words what a pet attack gives its owner (#1957)", () => {
    const ranks = new Map([["ranger.beast-mastery", 12]]);
    const lines = (id: string): string[] =>
      describeSkill(skill(id), ranks).effects.map((line) => line.text);
    expect(lines("ranger.predators-pounce")).toEqual(["+29 damage", "Your pet gains 41 health"]);
    expect(lines("ranger.ferocious-strike")).toEqual([
      "+25 damage",
      "You gain 9 energy",
      "You gain 1 strike of adrenaline",
    ]);
    expect(lines("ranger.enraged-lunge")).toEqual([
      "+19 damage for each of your recharging Beast Mastery skills (maximum 60)",
    ]);
  });

  it("words the mantras (#1964)", () => {
    expect(describeStatus("mantra-of-concentration")).toBe(
      "the next time you would be interrupted, you are not",
    );
    expect(describeStatus("mantra-of-resolve")).toBe(
      "you cannot be interrupted; each time you would be, lose 5 Energy or this ends",
    );
    expect(describeStatus("mantra-of-flame")).toBe(
      "45% less fire damage. Whenever it takes fire damage from a foe: gain 2 energy",
    );
  });

  it("words the PvP forms (#1951)", () => {
    expect(describeStatus("shadow-form")).toBe(
      "hostile spells targeting you fail, attacks against you miss. " +
        "When it ends: lose all but 41 Health",
    );
    expect(describeStatus("elemental-flame")).toBe(
      "whenever it applies an elemental hex to a foe: applies Burning for 2s (−7 Health degeneration)",
    );
    expect(describeStatus("mist-form")).toBe(
      "33% less damage from foes with a Water Magic hex. Whenever it casts an elemental spell: " +
        "you and non-spirit allies in earshot: heals for 210% of the spell's energy cost, under 80% Health",
    );
  });

  it("words a status's pips as GW1 does", () => {
    expect(describeStatus("bleeding")).toContain("−3 Health degeneration");
    expect(describeStatus("regeneration")).toContain("+4 Health regeneration");
    expect(describeStatus("malaise")).toContain("−1 Energy degeneration");
    expect(describeStatus("blood-ritual")).toContain("+3 Energy regeneration");
  });

  it("flags whether a skill scales at all", () => {
    expect(describeSkill(skill("elementalist.fireball")).scalesWithAttribute).toBe(true);
    // A pure interrupt has nothing to scale, and must not claim it does.
    expect(describeSkill(skill("ranger.broad-head-arrow")).scalesWithAttribute).toBe(false);
  });

  it("leads with the number that matters at these ranks (#567)", () => {
    const healing = skill("monk.orison-of-healing");
    expect(describeSkill(healing).headline).toBe("heals 20");
    expect(describeSkill(healing, new Map([["monk.healing-prayers", 12]])).headline).toBe(
      "heals 60",
    );
    expect(describeSkill(skill("elementalist.fireball")).headline).toMatch(/^\d+ fire damage$/);
    // Nothing to count: no headline rather than a made-up one.
    expect(describeSkill(skill("ranger.broad-head-arrow")).headline).toBeUndefined();
  });

  it("produces a line for every effect of every catalog skill", () => {
    // Guards the switch in `describeEffect`: a new effect kind that
    // nobody described would silently vanish from tooltips. An `if` is
    // a line per effect inside it (#521), a spirit's summon one more for
    // what it projects (#1064), and so does a ward (#1087); a trap is one
    // line, then one per effect of its spring (#1105), and one more if it
    // springs by itself; a pulse one, then one per effect (#1113); a
    // faster flight one, and one per on-crit or failed-to-hit rider
    // (#1486); a volley of arrows one (#1539). A spirit's on-hit effects
    // are a line each, and its death burst one more (#1550); a blow that
    // deals damage one more (#1631), and a minion's blows one (#1900).
    const linesOf = (effect: SkillEffect): number => {
      if (effect.kind === "if") {
        return effect.effects.length;
      }
      if (effect.kind === "create-ground-effect") {
        const { act } = effect;
        switch (act.kind) {
          case "aura":
            return 2;
          case "trap":
            return 1 + (act.trap.springsAtEnd ? 1 : 0) + act.trap.spring.effects.length;
          case "pulse":
            return 1 + act.pulse.effects.length;
        }
      }
      if (effect.kind === "summon") {
        const {
          kind,
          aura,
          attack,
          deathBurst,
          onDeathInRange,
          onePerOwner,
          leavesCorpses,
          replacedBy,
        } = effect.creature;
        return (
          1 +
          (aura === undefined ? 0 : 1) +
          (kind === "spirit" && (attack?.damageMax ?? 0) > 0 ? 1 : 0) +
          (kind !== "spirit" && attack?.scaling.kind === "level" ? 1 : 0) +
          (attack?.onHit ?? []).length +
          (deathBurst === undefined ? 0 : 1) +
          (onDeathInRange === undefined ? 0 : 1) +
          (onePerOwner ? 1 : 0) +
          (leavesCorpses === undefined ? 0 : 1) +
          (replacedBy === undefined ? 0 : 1)
        );
      }
      return 1;
    };
    const lines = (effects: readonly SkillEffect[]): number =>
      effects.reduce((sum, effect) => sum + linesOf(effect), 0);
    for (const entry of IMPLEMENTED_SKILLS) {
      const described = describeSkill(entry);
      const rule = blowRuleOf(entry);
      expect(described.effects, `${entry.id} lost an effect line`).toHaveLength(
        lines(entry.effects) +
          (entry.cost?.kind === "adrenaline" && entry.cost.losesAll === true ? 1 : 0) +
          (rule?.chain === undefined ? 0 : 1) +
          (rule?.bonusDamage === undefined && rule?.weaponDamage !== 0 ? 0 : 1) +
          (rule === undefined || rule.unblockable === false ? 0 : 1) +
          (entry.attack?.weapon === "scythe" && entry.area === undefined ? 1 : 0) +
          (entry.attack?.cleavesAllWhen === undefined ? 0 : 1) +
          (rule?.conditionalBonus === undefined ? 0 : 1) +
          (rule?.bonusPer === undefined ? 0 : 1) +
          (rule?.criticalWhen === undefined ? 0 : 1) +
          ((rule?.armorPenetration ?? 0) > 0 ? 1 : 0) +
          lines(rule?.onBlocked ?? []) +
          lines(rule?.onCritical ?? []) +
          lines(rule?.onFailedToHit ?? []) +
          (rule?.flightSpeed === undefined ? 0 : 1) +
          (rule?.removesPreparations === true ? 1 : 0) +
          (rule !== undefined && rule.strikes !== 1 ? 1 : 0) +
          (entry.whileActivating === undefined ? 0 : 1) +
          (entry.activationWhile === undefined ? 0 : 1) +
          (entry.divineFavorDoubled === true ? 1 : 0) +
          (entry.projectile === undefined ? 0 : 1) +
          (isEasilyInterrupted(entry) ? 1 : 0) +
          (entry.corpse === undefined ? 0 : 1) +
          (entry.target !== "self" && entry.range === RANGE_SPELL / 2 ? 1 : 0) +
          (entry.companion === undefined ? 0 : 1) +
          (entry.disabledAfterUseSeconds === undefined ? 0 : 1),
      );
      for (const line of described.effects) {
        expect(line.text.length, `${entry.id} has an empty description line`).toBeGreaterThan(0);
      }
    }
  });
});

describe("attack skills (#417)", () => {
  it("names the weapon each attack skill needs", () => {
    const lines = Object.fromEntries(
      IMPLEMENTED_SKILLS.filter((entry) => entry.attack !== undefined).map((entry) => [
        entry.attack?.weapon,
        describeSkill(entry).weaponText,
      ]),
    );
    expect(lines).toEqual({
      axe: "Axe attack",
      bow: "Bow attack",
      daggers: "Dagger attack",
      hammer: "Hammer attack",
      melee: "Melee attack",
      sword: "Sword attack",
      spear: "Spear attack",
      scythe: "Scythe attack",
    });
    expect(describeSkill(skill("elementalist.fireball")).weaponText).toBeUndefined();
  });

  it("leads with a chain attack's place in its chain, as GW1 prints it (#831)", () => {
    const first = (id: string) => describeSkill(skill(id)).effects[0]?.text;
    expect(first("assassin.jagged-strike")).toBe("Lead attack.");
    expect(first("assassin.fox-fangs")).toBe("Off-hand attack. Must follow a lead attack.");
    expect(first("warrior.swift-chop")).not.toMatch(/attack\./);
  });

  it("says an unblockable attack cannot be blocked, right after its damage (#1038)", () => {
    const texts = (id: string) => describeSkill(skill(id)).effects.map(({ text }) => text);
    for (const id of ["assassin.fox-fangs", "assassin.wild-strike", "paragon.wild-throw"]) {
      const lines = texts(id);
      const damage = lines.findIndex((text) => /^\+\d+ damage$/.test(text));
      expect(damage, id).toBeGreaterThanOrEqual(0);
      expect(lines[damage + 1], id).toBe("Cannot be blocked");
    }
    // Crippling Shot has no bonus damage: the line leads.
    expect(texts("ranger.crippling-shot")[0]).toBe("Cannot be blocked");
    expect(texts("assassin.jagged-strike")).not.toContain("Cannot be blocked");
  });

  it("words an attack whose weapon deals nothing as 'deals only' or 'no damage' (#1038)", () => {
    const ranks = new Map([
      ["ranger.expertise", 12],
      ["ranger.marksmanship", 12],
      ["warrior.tactics", 12],
      ["warrior.axe-mastery", 12],
    ]);
    const shot = describeSkill(skill("ranger.distracting-shot"), ranks);
    expect(shot.effects[0]?.text).toBe("Deals only 13 damage");
    expect(shot.headline).toBe("Deals only 13 damage");
    expect(shot.effects.map(({ text }) => text)).not.toContain("+13 damage");
    expect(describeSkill(skill("ranger.concussion-shot"), ranks).headline).toBe(
      "Deals only 13 damage",
    );
    const blow = describeSkill(skill("warrior.distracting-blow"), ranks);
    expect(blow.effects[0]?.text).toBe("Deals no damage");
    expect(blow.headline).not.toBe("Deals no damage");
    expect(describeSkill(skill("warrior.swift-chop"), ranks).effects[0]?.text).toBe("+16 damage");
  });

  it("starts a skill that loses all adrenaline with it; its cost stays its strikes (#1097)", () => {
    const bash = describeSkill(skill("warrior.hammer-bash"));
    expect(bash.effects.map(({ text }) => text)).toEqual([
      "Lose all adrenaline",
      "Knocks down for 2s",
    ]);
    expect(bash.cost).toBe("6 adrenaline");
    expect(describeSkill(skill("warrior.backbreaker")).effects[0]?.text).not.toBe(
      "Lose all adrenaline",
    );
  });

  it("words a splash, a lone target and a recharge of the others as GW1 does (#885)", () => {
    const texts = (id: string) => describeSkill(skill(id)).effects.map(({ text }) => text);
    expect(texts("assassin.death-blossom")).toContain("Adjacent foes take 20 piercing damage");
    expect(texts("assassin.horns-of-the-ox")).toContain(
      "If target is not adjacent to any allies: knocks down for 2s",
    );
    expect(texts("assassin.moebius-strike")).toContain(
      "If target is below 50% Health: recharges all your other attack skills",
    );
    expect(texts("assassin.moebius-strike")[0]).toBe("Off-hand attack. Must follow a dual attack.");
  });

  it("says how often a melee attack strikes and how many a capped splash hits (#1618)", () => {
    const texts = (id: string) => describeSkill(skill(id)).effects.map(({ text }) => text);
    expect(texts("warrior.sun-and-moon-slash")).toContain("Strikes twice");
    expect(texts("ranger.dual-shot").join("\n")).toContain("Shoots 2 arrows at once");
    expect(texts("ranger.dual-shot").join("\n")).not.toContain("Strikes");
    expect(texts("warrior.cleave").some((text) => text.startsWith("Up to 2 adjacent foes"))).toBe(
      true,
    );
    expect(texts("assassin.death-blossom")).toContain("Adjacent foes take 20 piercing damage");
  });

  it("words the crippling knockdown chain, and a state its attack requires (#1041)", () => {
    const texts = (id: string) => describeSkill(skill(id)).effects.map(({ text }) => text);
    expect(texts("assassin.falling-spider")[0]).toBe(
      "Off-hand attack. Only if target is knocked down.",
    );
    expect(texts("assassin.leaping-mantis-sting")).toContain(
      "If target is moving: applies Crippled for 13s (moves at 50% speed)",
    );
    expect(texts("assassin.trampling-ox")).toContain("If target has Crippled: knocks down for 2s");
    expect(texts("assassin.jungle-strike")[0]).toBe("Off-hand attack. Must follow a lead attack.");
    expect(chainRequirementText(skill("assassin.falling-spider"))).toBe(
      "only if target is knocked down",
    );
    expect(chainRequirementText(skill("assassin.fox-fangs"))).toBe("must follow a lead attack");
    expect(chainRequirementText(skill("assassin.jagged-strike"))).toBeUndefined();
    const spider = skill("assassin.falling-spider");
    const both = {
      ...spider,
      attack: spider.attack && {
        ...spider.attack,
        chain: { ...spider.attack.chain, role: "off-hand", follows: "lead" } as const,
      },
    };
    expect(chainRequirementText(both)).toBe(
      "must follow a lead attack; only if target is knocked down",
    );
  });

  it("words Mind Shock's energy comparison as GW1 does (#918)", () => {
    expect(
      describeSkill(skill("elementalist.mind-shock")).effects.map(({ text }) => text),
    ).toContain("If you have more Energy than target: knocks down for 2s");
  });

  it("words the #997 conditions: moving, has a status, lacks it", () => {
    const ranks = new Map([
      ["elementalist.water-magic", 12],
      ["elementalist.earth-magic", 12],
      ["elementalist.fire-magic", 12],
    ]);
    const texts = (id: string): string[] =>
      describeSkill(skill(id), ranks).effects.map(({ text }) => text);
    expect(texts("elementalist.water-trident")).toContain(
      "If target is moving: knocks down for 2s",
    );
    expect(texts("elementalist.stoning")).toContain("If target has Weakness: knocks down for 2s");
    expect(texts("elementalist.searing-flames")).toEqual([
      "If target has Burning: deals 82 fire damage",
      "If target does not have Burning: applies Burning for 6s (−7 Health degeneration)",
    ]);
  });

  it("words Aftershock's bonus on a foe that is down (#985)", () => {
    const ranks = new Map([["elementalist.earth-magic", 12]]);
    const texts = describeSkill(skill("elementalist.aftershock"), ranks).effects.map(
      ({ text }) => text,
    );
    expect(texts.at(-1)).toBe("If target is knocked down: deals 56 earth damage");
  });

  it("words Cry of Frustration's splash and Mantra of Recovery's faster spells (#938)", () => {
    expect(
      describeSkill(skill("mesmer.cry-of-frustration")).effects.map(({ text }) => text),
    ).toContain("If it interrupts a skill: foes in the area are interrupted and take 11 damage");
    expect(describeStatus("mantra-of-recovery")).toBe("spells recharge 33% faster");
  });

  it("words the Ritualist's weapon spells (#975, #1064)", () => {
    expect(describeStatus("spirit-light-weapon")).toBe(
      "+21 Health per second, +21 Health per second more in earshot of a spirit",
    );
    expect(describeStatus("weapon-of-quickening")).toBe(
      "spells and binding rituals recharge 33% faster",
    );
    expect(describeStatus("weapon-of-aggression")).toBe("attacks 25% faster");
  });

  it("words the Ritualist's Channeling staples (#1270)", () => {
    const lines = (id: string) =>
      describeSkill(skill(id), new Map([["ritualist.channeling-magic", 12]])).effects.map(
        ({ text }) => text,
      );
    expect(lines("ritualist.spirit-burn")).toContain(
      "If a spirit is in earshot of you: applies Burning for 4s (−7 Health degeneration)",
    );
    expect(lines("ritualist.lamentation")).toContain(
      "If a spirit or a corpse is in earshot of you: deals 42 damage",
    );
    expect(lines("ritualist.spirit-rift")).toContain(
      "After 3s, foes adjacent: deals 105 lightning damage",
    );
    expect(describeStatus("painful-bond")).toBe("take +18 from spirits' attacks");
  });

  it("words the Assassin's staples (#988)", () => {
    const lines = (id: string) =>
      describeSkill(skill(id), new Map([["assassin.shadow-arts", 12]])).effects.map(
        ({ text }) => text,
      );
    expect(lines("assassin.deaths-charge")).toEqual([
      "Shadow steps to the target",
      "If target has more Health than you: you gain 173 health",
    ]);
    expect(lines("assassin.shadow-refuge")).toEqual([
      "Applies Shadow Refuge for 6s (+9 Health regeneration. When it ends, if it is attacking: heals for 88)",
    ]);
    expect(describeStatus("shroud-of-distress")).toBe(
      "75% chance to block attacks while below 50% Health",
    );
    expect(describeStatus("critical-eye")).toBe(
      "+13% critical chance, gain 1 Energy per critical hit",
    );
  });

  it("words Endure Pain's maximum, Warrior's Endurance's cap and a weapon-bound trigger (#1359)", () => {
    // At the warrior's Strength (#1976); its range where that is not known.
    expect(describeStatus("endure-pain", new Map([["warrior.strength", 12]]))).toBe(
      "+258 maximum health",
    );
    expect(describeStatus("endure-pain", new Map([["warrior.strength", 0]]))).toBe(
      "+90 maximum health",
    );
    expect(describeStatus("endure-pain")).toBe("+90...258 maximum health");
    expect(describeStatus("warriors-endurance")).toBe(
      "whenever it hits with a melee attack: gain 3 energy, never above 55",
    );
    expect(describeStatus("hundred-blades")).toBe(
      "adjacent foes take 26 slashing damage whenever it attacks with a sword",
    );
  });

  it("words Spear of Lightning's type and penetration, and Leader's Comfort's per ally (#923)", () => {
    const at12 = (id: string, attributeId: string) =>
      describeSkill(skill(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);
    expect(at12("paragon.spear-of-lightning", "paragon.spear-mastery")).toEqual([
      "+18 lightning damage",
      "25% armor penetration",
    ]);
    expect(at12("paragon.leaders-comfort", "paragon.leadership")).toEqual([
      "Heals for 66, +18 Health for each ally in earshot (max 140)",
    ]);
  });

  it("words Patient Spirit's expiry, Holy Veil's hexes, Rend's price and Plague Touch (#944)", () => {
    const lines = (id: string) =>
      describeSkill(skill(id), new Map([["necromancer.curses", 12]])).effects.map(
        ({ text }) => text,
      );
    expect(lines("monk.patient-spirit")).toEqual([
      "Applies Patient Spirit for 2s (when it expires: heals for 30)",
    ]);
    expect(
      describeSkill(skill("monk.patient-spirit"), new Map([["monk.healing-prayers", 12]])).effects,
    ).toEqual([
      {
        text: "Applies Patient Spirit for 2s (when it expires: heals for 102)",
        magnitude: undefined,
      },
    ]);
    expect(lines("monk.holy-veil")).toEqual([
      "Maintained: −1 Energy regeneration while it lasts. " +
        "Hexes cast on the bearer take 2× as long to cast. When it ends: removes 1 hex.",
    ]);
    expect(lines("necromancer.rend-enchantments")).toEqual([
      "Removes up to 8 enchantments",
      "You lose 31 health for each Monk enchantment removed",
    ]);
    expect(lines("necromancer.plague-touch")).toEqual([
      "Moves up to 3 of your conditions to the target",
    ]);
  });

  it("chains only dagger attacks, so a chain blow never flies (#831)", () => {
    const chained = IMPLEMENTED_SKILLS.filter((entry) => entry.attack?.chain !== undefined);
    expect(chained.map((entry) => entry.attack?.weapon)).toEqual(chained.map(() => "daggers"));
  });

  it("words the bonus as +N damage at these ranks, and leads with it", () => {
    const chop = skill("warrior.swift-chop");
    const atTwelve = describeSkill(chop, new Map([["warrior.axe-mastery", 12]]));
    expect(atTwelve.effects[0]).toEqual({
      text: "+16 damage",
      magnitude: { current: 16, atZero: 1, atTwelve: 16.2, attributeId: "warrior.axe-mastery" },
    });
    expect(atTwelve.headline).toBe("+16 damage");
    expect(describeSkill(chop).headline).toBe("+1 damage");
  });

  it("gives Broad Head Arrow no damage line", () => {
    const lines = describeSkill(skill("ranger.broad-head-arrow")).effects.map((e) => e.text);
    expect(lines.some((line) => line.includes("damage"))).toBe(false);
  });
});

describe("describeStatus", () => {
  it("describes every defined status in terms of what it does", () => {
    for (const definition of Object.values(STATUS_DEFINITIONS)) {
      const text = describeStatus(definition.id);
      expect(text.length).toBeGreaterThan(0);
      // Falling back to the bare name means the definition has an effect
      // this function does not know how to explain.
      expect(text, `${definition.id} is only described by its own name`).not.toBe(definition.name);
    }
  });

  it("says an item spell's drop once, all it does after it (#1434)", () => {
    expect(describeStatus("protective-was-kaolai")).toBe(
      "+20 armor. Drop effect: you and all party members are healed for 80",
    );
    expect(describeStatus("grasping-was-kuurong")).toBe(
      "drop effect: foes in the area: deals 63 damage, knocks down for 2s",
    );
    expect(describeStatus("blind-was-mingson")).toContain(
      "drop effect: nearby foes suffer Blind for 7s",
    );
    const kaolai = getSkill("ritualist.protective-was-kaolai");
    expect(kaolai === undefined ? undefined : describeSkill(kaolai).typeText).toBe("Item Spell.");
  });

  it("explains dazed: slower spells, interrupted by attacks (#546)", () => {
    expect(describeStatus("dazed")).toContain("spells take 2× as long to cast");
    expect(describeStatus("dazed")).toContain("spells are interrupted by attacks");
  });

  it("words attack speed as GW1 does: 50% slower, 33% faster (#493)", () => {
    expect(describeStatus("faintheartedness")).toContain("attacks 50% slower");
    withAttackDuration({ bleeding: 0.67 }, () => {
      expect(describeStatus("bleeding")).toContain("attacks 33% faster");
    });
  });

  it("says the curses' triggers from the bearer's side, two alike once (#935)", () => {
    expect(describeStatus("spiteful-spirit")).toBe(
      "takes 39 shadow damage whenever it uses a skill or attacks, " +
        "its adjacent allies take 39 shadow damage whenever it uses a skill or attacks",
    );
    expect(describeStatus("mark-of-pain")).toBe(
      "its adjacent allies take 34 shadow damage whenever it takes physical damage",
    );
    expect(describeStatus("insidious-parasite")).toBe(
      "its caster steals 39 Health whenever it hits with an attack",
    );
    expect(
      describeSkill(
        skill("necromancer.vampiric-gaze"),
        new Map([["necromancer.blood-magic", 12]]),
      ).effects.map(({ text }) => text),
    ).toEqual(["Steals up to 52 Health"]);
  });

  it("says Soul Feast exploits the nearest corpse, then what it steals (#466)", () => {
    const feast = describeSkill(
      skill("necromancer.soul-feast"),
      new Map([["necromancer.death-magic", 12]]),
    );
    expect(feast.effects.map(({ text }) => text)).toEqual([
      "Exploits the nearest corpse",
      "You steal 234 Health",
    ]);
    expect(feast.headline).toBe("steals 234 health");
  });

  it("says the animate skills exploit a corpse, then what rises (#467)", () => {
    const ranks = new Map([["necromancer.death-magic", 12]]);
    const texts = (id: string) => describeSkill(skill(id), ranks).effects.map(({ text }) => text);
    expect(texts("necromancer.animate-bone-minions")).toEqual([
      "Exploits the nearest corpse",
      "Summons 2 Bone Minion (level 10, 280 Health)",
      "Its attacks deal 6–11 damage",
    ]);
    expect(texts("necromancer.animate-bone-horror")).toEqual([
      "Exploits the nearest corpse",
      "Summons 1 Bone Horror (level 14, 360 Health)",
      "Its attacks deal 12–24 damage",
    ]);
  });

  it("says what a minion's death leaves and that a golem stands alone (#1836)", () => {
    const ranks = new Map([["necromancer.death-magic", 12]]);
    const texts = (id: string) => describeSkill(skill(id), ranks).effects.map(({ text }) => text);
    expect(texts("necromancer.animate-flesh-golem")).toEqual([
      "Exploits the nearest corpse",
      "Summons 1 Flesh Golem (level 21, 500 Health)",
      "Its attacks deal 50–74 damage",
      "Only one at a time: a new one kills the old",
      "Leaves 3 corpses when it dies",
    ]);
    expect(texts("necromancer.animate-shambling-horror")).toEqual([
      "Exploits the nearest corpse",
      "Summons 1 Shambling Horror (level 14, 360 Health)",
      "Its attacks deal 11–21 damage",
      "When it dies, 1 Jagged Horror (level 12, 320 Health) stands up in its place; its attacks: applies Bleeding for 25s (−3 Health degeneration)",
    ]);
    // The corpse count scales with Death Magic, 1 at 0.
    expect(
      describeSkill(skill("necromancer.animate-flesh-golem"), new Map()).effects.at(-1)?.text,
    ).toBe("Leaves 1 corpse when it dies");
  });

  it("says a minion's level, health and damage at the live rank (#1900)", () => {
    const golem = skill("necromancer.animate-flesh-golem");
    const summon = golem.effects.find((effect) => effect.kind === "summon");
    const attack = summon?.creature.attack;
    if (summon === undefined || attack?.scaling.kind !== "level") {
      throw new Error("Flesh Golem summons a minion whose blows scale by level");
    }
    const { level } = attack.scaling;
    const expected = (rank: number): string[] => {
      const levelAt = level.atZero + ((level.atTwelve - level.atZero) * rank) / 12;
      const health = resolveMagnitudeAtRanks(
        summon.creature.maxHealth,
        new Map([["necromancer.death-magic", rank]]),
      );
      const scale = creatureDamageMultiplier(rank, level);
      return [
        `Summons 1 Flesh Golem (level ${String(Math.round(levelAt))}, ${String(health)} Health)`,
        `Its attacks deal ${String(Math.round(attack.damageMin * scale))}–${String(Math.round(attack.damageMax * scale))} damage`,
      ];
    };
    const texts = (rank: number) =>
      describeSkill(golem, new Map([["necromancer.death-magic", rank]]))
        .effects.map(({ text }) => text)
        .slice(1, 3);
    expect(texts(12)).toEqual(expected(12));
    expect(texts(16)).toEqual(expected(16));
    expect(texts(16)).not.toEqual(texts(12));
    expect(
      resolveMagnitudeAtRanks(
        summon.creature.maxHealth,
        new Map([["necromancer.death-magic", 16]]),
      ),
    ).toBeGreaterThan(
      resolveMagnitudeAtRanks(
        summon.creature.maxHealth,
        new Map([["necromancer.death-magic", 12]]),
      ),
    );
  });

  it("returns the id for an unknown status rather than throwing", () => {
    expect(describeStatus("not-a-status")).toBe("not-a-status");
  });
});

describe("formatScalingRange", () => {
  it("shows the span a scaled effect covers", () => {
    const described = describeSkill(skill("elementalist.fireball"));
    const magnitude = described.effects[0]?.magnitude;
    expect(magnitude).toBeDefined();
    if (magnitude === undefined) {
      return;
    }
    expect(formatScalingRange(magnitude)).toBe("7…91 at 12");
  });

  it("rounds the ends as the live value does, so rank 12 reads what it gives", () => {
    const scaling = { attributeId: "test", atZero: 1, atTwelve: 8.2 };
    const atTwelve = resolveMagnitudeAtRanks({ scaling }, new Map([["test", 12]]));
    expect(atTwelve).toBe(8);
    expect(
      formatScalingRange({
        current: atTwelve,
        atZero: scaling.atZero,
        atTwelve: scaling.atTwelve,
        attributeId: scaling.attributeId,
      }),
    ).toBe("1…8 at 12");
  });

  it("returns nothing for a flat magnitude, rather than a fake range", () => {
    expect(
      formatScalingRange({
        current: 5,
        atZero: undefined,
        atTwelve: undefined,
        attributeId: undefined,
      }),
    ).toBeUndefined();
  });
});

describe("elite skills (#459)", () => {
  it("says Elite before the type, as GW1 does, and only for an elite", () => {
    const barrage = describeSkill(skill("ranger.barrage"));
    expect(barrage.typeText).toBe("Elite Attack.");
    expect(barrage.elite).toBe(true);
    const fireball = describeSkill(skill("elementalist.fireball"));
    expect(fireball.typeText).toBe("Spell.");
    expect(fireball.elite).toBe(false);
  });
});

describe("signets and shouts (#524)", () => {
  it("names the type first, as GW1 does", () => {
    expect(describeSkill(skill("warrior.healing-signet")).typeText).toBe("Signet.");
    expect(describeSkill(skill("warrior.watch-yourself")).typeText).toBe("Shout.");
    expect(describeSkill(skill("necromancer.malaise")).typeText).toBe("Hex Spell.");
  });

  it("names a pet attack, and its bonus as an attack skill's (#1046)", () => {
    const brutal = describeSkill(
      skill("ranger.brutal-strike"),
      new Map([["ranger.beast-mastery", 12]]),
    );
    expect(brutal.typeText).toBe("Pet Attack.");
    expect(brutal.effects.map((effect) => effect.text)).toEqual([
      "+29 damage",
      "If target is below 50% Health: +29 damage",
    ]);
  });

  it("says Healing Signet is free and what it costs in armor while activating", () => {
    const description = describeSkill(skill("warrior.healing-signet"));
    expect(description.cost).toBe("Free");
    expect(description.effects.map((effect) => effect.text)).toEqual([
      "Heals for 82",
      "While activating: -40 armor",
    ]);
  });

  it("says a shout reaches allies in earshot, and when its effect ends", () => {
    const description = describeSkill(
      skill("warrior.watch-yourself"),
      new Map([["warrior.tactics", 12]]),
    );
    expect(description.targetText).toBe("Allies in earshot");
    expect(description.rangeText).toBe("350 radius");
    expect(description.castTime).toBe("Instant");
    expect(description.effects[0]?.text).toBe(
      "Applies Watch Yourself! for 10s (+21 armor, ends after 3 incoming attacks)",
    );
  });
});

describe("describeSkill at a primary attribute's rank (#531)", () => {
  it("shows Expertise's cost with the base in brackets", () => {
    const broadHead = skill("ranger.broad-head-arrow");
    expect(describeSkill(broadHead, new Map([["ranger.expertise", 12]])).cost).toBe(
      "5 energy (10)",
    );
  });

  it("shows Fast Casting's activation with the base in brackets", () => {
    const malaise = skill("necromancer.malaise");
    expect(describeSkill(malaise, new Map([["mesmer.fast-casting", 12]])).castTime).toBe(
      "1.1s (2s)",
    );
  });

  it("shows Fast Casting's signet activation too (#1100)", () => {
    const signet = skill("common.resurrection-signet");
    expect(describeSkill(signet, new Map([["mesmer.fast-casting", 12]])).castTime).toBe(
      "1.9s (3s)",
    );
  });

  it("shows the base alone when the rank changes nothing", () => {
    const broadHead = skill("ranger.broad-head-arrow");
    const fireball = skill("elementalist.fireball");
    expect(describeSkill(broadHead, new Map()).cost).toBe("10 energy");
    expect(describeSkill(fireball, new Map([["ranger.expertise", 12]])).cost).toBe("10 energy");
    expect(describeSkill(fireball, new Map([["mesmer.fast-casting", 12]])).castTime).toBe("1s");
  });
});

describe("Spawning Power in the tooltip (#1098)", () => {
  it("lengthens a weapon spell's duration, the base in brackets", () => {
    const quickening = skill("ritualist.weapon-of-quickening");
    const line = (rank: number) =>
      describeSkill(quickening, new Map([["ritualist.spawning-power", rank]])).effects[0]?.text;
    expect(line(12)).toMatch(/^Applies Weapon of Quickening for 31\.1s \(21s\) \(/);
    expect(line(0)).toMatch(/^Applies Weapon of Quickening for 21s \(/);
  });

  it("leaves a status that is no weapon spell alone", () => {
    const unguent = skill("ranger.troll-unguent");
    expect(
      describeSkill(unguent, new Map([["ritualist.spawning-power", 12]])).effects[0]?.text,
    ).toMatch(/^Applies Regeneration for 13s \(/);
  });
});

describe("an ender said to its holder (#1841)", () => {
  it("has a second person for every trigger phrase", () => {
    for (const phrase of Object.values(TRIGGER_WHEN)) {
      expect(() => secondPerson(phrase), phrase).not.toThrow();
    }
    expect(secondPerson("has its Health dropped below 25% by damage")).toBe(
      "have your Health dropped below 25% by damage",
    );
    expect(secondPerson("has a chant or shout end on it")).toBe("have a chant or shout end on you");
    expect(() => secondPerson("prevents a knockdown")).toThrow();
  });

  it("reads 'ends if you' on a self-buff and 'ends if it' on a hex", () => {
    expect(describeStatus("illusion-of-weakness")).toContain(
      "ends if you have your Health dropped below 25% by damage",
    );
    expect(describeStatus("pacifism")).toContain(
      "ends if it takes damage or life steal from a foe",
    );
  });
});

describe("Predatory Bond, said to the Ranger who casts it (#1865)", () => {
  it("heals you when your pet hits, not when you do", () => {
    const skill = getSkill("ranger.predatory-bond");
    expect(skill).toBeDefined();
    const text =
      skill === undefined
        ? ""
        : describeSkill(skill)
            .effects.map((effect) => effect.text)
            .join(" ");
    expect(text).toContain("your pet's attacks heal you for 25");
    expect(text).not.toContain("your physical attacks");
    expect(text).not.toContain("Heals its owner");
  });
});

describe("party-wide condition and hex moves (#1954)", () => {
  const texts = (id: string, attributeId: string): string[] =>
    describeSkill(skill(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);

  it("says what each moves, strips or gives, at rank 12", () => {
    expect(texts("monk.martyr", "")).toEqual([
      "Take all conditions from your allies, with the time each has left",
    ]);
    expect(texts("monk.divert-hexes", "monk.protection-prayers")).toEqual([
      "Removes up to 3 hexes",
      "Removes one condition for each hex removed (max 3)",
      "Heals 63 for each hex removed",
    ]);
    expect(texts("mesmer.mirror-of-disenchantment", "")).toEqual([
      "Removes 1 enchantment",
      "All its party members lose that same enchantment",
    ]);
    expect(texts("mesmer.extend-conditions", "mesmer.inspiration-magic")).toEqual([
      "Nearby foes get the target's conditions, with 81% more time (max 30s)",
    ]);
    expect(texts("mesmer.hex-eater-signet", "mesmer.inspiration-magic")).toEqual([
      "Removes 1 hex",
      "Up to 4 adjacent allies with a hex lose 1 hex",
      "Gain 3 energy for each hex removed",
    ]);
  });
});

describe("blocks that pay or pay off (#1974)", () => {
  const texts = (id: string, attributeId: string): string[] =>
    describeSkill(skill(id), new Map([[attributeId, 12]])).effects.map(({ text }) => text);

  it("says what each block costs or gives, at rank 12", () => {
    expect(texts("mesmer.distortion", "mesmer.illusion-magic")).toEqual([
      "For 4s, 75% chance to block attacks. Each block costs you 2 Energy or this ends",
    ]);
    expect(texts("monk.shield-guardian", "monk.protection-prayers")).toEqual([
      "Applies Shield Guardian for 3s (75% chance to block attacks, ends after it takes effect once. When you block, you and allies in earshot are healed for 30)",
    ]);
    expect(texts("ranger.glass-arrows", "ranger.expertise")).toEqual([
      "For 30s, bow attacks deal 16 more damage, foes that block your bow attacks get Bleeding for 18s",
    ]);
    expect(texts("warrior.furious-axe", "warrior.axe-mastery")).toEqual([
      "+29 damage",
      "If blocked: gain 3 strikes of adrenaline",
    ]);
    expect(texts("warrior.leviathans-sweep", "warrior.strength")).toEqual([
      "+17 damage",
      "If blocked: knocks down for 2s",
      "If blocked: deals 29 damage",
    ]);
  });
});
