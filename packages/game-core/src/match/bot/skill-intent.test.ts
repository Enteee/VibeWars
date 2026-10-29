import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, getSkill } from "../../skills/catalog.js";
import { botUses, onlyInterrupts, removedCategories } from "./skill-intent.js";

/**
 * Skills a bot never uses (#1189). A new skill is either given a use by
 * its effects or listed here, on purpose.
 */
const NO_BOT_USE = new Set([
  // Companion commands and pet attacks: out of scope for a bot.
  "ranger.brutal-strike",
  "ranger.call-of-haste",
  "ranger.call-of-protection",
  "ranger.charm-animal",
  "ranger.comfort-animal",
  "ranger.disrupting-lunge",
  "ranger.maiming-strike",
  "ranger.revive-animal",
  "ranger.symbiotic-bond",
  // Speed, energy, attack speed and other self-help no rule reaches for.
  "assassin.critical-eye",
  "assassin.dash",
  "dervish.enchanted-haste",
  "dervish.fleeting-stability",
  "dervish.harriers-haste",
  "dervish.heart-of-fury",
  "dervish.pious-haste",
  "dervish.vow-of-strength",
  "elementalist.glyph-of-lesser-energy",
  "mesmer.arcane-echo",
  "mesmer.echo",
  "mesmer.energy-tap",
  "mesmer.illusion-of-haste",
  "mesmer.mantra-of-recovery",
  "necromancer.blood-ritual",
  "necromancer.contagion",
  "necromancer.offering-of-blood",
  "paragon.fall-back",
  "paragon.incoming",
  "paragon.make-haste",
  "ranger.winnowing",
  "ritualist.signet-of-creation",
  "ritualist.signet-of-spirits",
  "ritualist.weapon-of-aggression",
  "ritualist.weapon-of-quickening",
  "warrior.balanced-stance",
  "warrior.endure-pain",
  "warrior.for-great-justice",
  "warrior.frenzy",
  "warrior.rush",
  "warrior.sprint",
  // Minions, wells and enchantment strips: no rule for them yet.
  "necromancer.animate-bone-horror",
  "necromancer.animate-bone-minions",
  "necromancer.rend-enchantments",
  "necromancer.well-of-suffering",
  // What they do lands through a status trigger, not an effect a bot reads.
  "assassin.way-of-perfection",
  "warrior.hundred-blades",
  "warrior.warriors-endurance",
  "dervish.sand-shards",
  "ritualist.explosive-growth",
  "ritualist.splinter-weapon",
  "ritualist.vengeful-weapon",
  "ritualist.weapon-of-remedy",
]);

function skill(id: string) {
  const found = getSkill(id);
  if (found === undefined) throw new Error(`no skill ${id}`);
  return found;
}

describe("botUses (#1189)", () => {
  it("gives every catalog skill a use, or lists it as having none", () => {
    for (const each of IMPLEMENTED_SKILLS) {
      expect(botUses(each).length > 0, each.id).toBe(!NO_BOT_USE.has(each.id));
    }
  });

  it("lists only skills the catalog has", () => {
    for (const id of NO_BOT_USE) {
      expect(getSkill(id), id).toBeDefined();
    }
  });

  it("reads each use off the skill", () => {
    expect(botUses(skill("mesmer.power-drain"))).toEqual(["interrupt"]);
    expect(botUses(skill("monk.orison-of-healing"))).toEqual(["healing"]);
    expect(botUses(skill("monk.guardian"))).toEqual(["defence"]);
    expect(botUses(skill("monk.mend-condition"))).toEqual(["healing", "removal"]);
    expect(botUses(skill("monk.restore-life"))).toContain("resurrect");
    expect(botUses(skill("elementalist.fireball"))).toEqual(["offence"]);
    // An attack skill is offence, whatever else it does.
    expect(botUses(skill("warrior.distracting-blow"))).toEqual(["interrupt", "offence"]);
  });

  it("holds a skill whose only role is interrupting", () => {
    expect(onlyInterrupts(skill("warrior.distracting-blow"))).toBe(true);
    expect(onlyInterrupts(skill("ranger.broad-head-arrow"))).toBe(false);
  });

  it("knows what a removal takes off", () => {
    expect(removedCategories(skill("monk.mend-condition"))).toEqual(["condition"]);
    expect(removedCategories(skill("monk.smite-hex"))).toEqual(["hex"]);
    expect(removedCategories(skill("necromancer.plague-touch"))).toEqual(["condition"]);
  });
});
