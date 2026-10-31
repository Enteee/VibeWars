import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, getSkill } from "../../skills/catalog.js";
import { botUses, onlyInterrupts, removedCategories } from "./skill-intent.js";

/**
 * Skills a bot never uses (#1189). A new skill is either given a use by
 * its effects or listed here, on purpose.
 */
const NO_BOT_USE = new Set([
  // Spell Breaker (#1511): a foe's spells refused is not a defence the
  // bot weighs.
  "monk.spell-breaker",
  // Companion commands and pet attacks: out of scope for a bot.
  "ranger.bestial-pounce",
  "ranger.brutal-strike",
  "ranger.call-of-haste",
  "ranger.call-of-protection",
  "ranger.charm-animal",
  "ranger.comfort-animal",
  "ranger.disrupting-lunge",
  "ranger.feral-lunge",
  "ranger.maiming-strike",
  "ranger.poisonous-bite",
  "ranger.pounce",
  "ranger.revive-animal",
  "ranger.symbiotic-bond",
  // Speed, energy, attack speed and other self-help no rule reaches for.
  "assassin.critical-eye",
  "assassin.dash",
  "dervish.avatar-of-balthazar",
  "dervish.avatar-of-dwayna",
  "dervish.avatar-of-grenth",
  "dervish.avatar-of-lyssa",
  "dervish.avatar-of-melandru",
  "dervish.enchanted-haste",
  "dervish.featherfoot-grace",
  "dervish.fleeting-stability",
  "dervish.harriers-haste",
  "dervish.heart-of-fury",
  "dervish.onslaught",
  "dervish.pious-fury",
  "dervish.pious-haste",
  "dervish.vow-of-strength",
  "dervish.zealous-vow",
  "elementalist.glyph-of-lesser-energy",
  "elementalist.windborne-speed",
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
  "ranger.serpents-quickness",
  "ranger.winnowing",
  "ritualist.cruel-was-daoshen",
  "ritualist.destructive-was-glaive",
  "ritualist.energetic-was-lee-sa",
  "ritualist.pure-was-li-ming",
  "ritualist.signet-of-creation",
  "ritualist.signet-of-spirits",
  "ritualist.vengeful-was-khanhei",
  "ritualist.weapon-of-aggression",
  "ritualist.weapon-of-quickening",
  "warrior.balanced-stance",
  "warrior.endure-pain",
  "warrior.enraging-charge",
  "warrior.flail",
  "warrior.for-great-justice",
  "warrior.frenzy",
  "warrior.rage-of-the-ntouka",
  "warrior.rush",
  "warrior.sprint",
  // Minions, wells and enchantment strips: no rule for them yet.
  "necromancer.animate-bone-horror",
  "necromancer.animate-bone-minions",
  "necromancer.gaze-of-contempt",
  "necromancer.rend-enchantments",
  // An enchantment strip whose payoff is Health loss, not damage (#1648).
  "necromancer.pain-of-disenchantment",
  // An enchantment strip only on a knocked-down foe (#1643).
  "assassin.lift-enchantment",
  "necromancer.well-of-suffering",
  // A disable of a foe's elite and nothing else: no rule for it (#1473).
  "mesmer.signet-of-humility",
  // Nor of a foe's whole bar at the price of one's own (#1570).
  "mesmer.blackout",
  // A heal that waits for its spirit's death (#1550): no rule for it.
  "ritualist.life",
  // An ally's weapon spell that only bends its attacks (#1654): no rule for it.
  "ritualist.ghostly-weapon",
  "ritualist.guided-weapon",
  "ritualist.nightmare-weapon",
  "ritualist.weapon-of-fury",
  "ritualist.weapon-of-renewal",
  // What they do lands through a status trigger, not an effect a bot reads.
  "assassin.way-of-perfection",
  "warrior.hundred-blades",
  "warrior.warriors-endurance",
  "dervish.sand-shards",
  "dervish.whirling-charge",
  "ritualist.explosive-growth",
  "ritualist.splinter-weapon",
  "ritualist.vengeful-weapon",
  "ritualist.weapon-of-remedy",
  "ranger.kindle-arrows",
  "ranger.ignite-arrows",
  // Energy engine (#1614): energy back for spells still to be cast.
  "elementalist.fire-attunement",
  "elementalist.water-attunement",
  "elementalist.air-attunement",
  "elementalist.earth-attunement",
  // Echoes (#1423): what they do waits for a chant or a shout to end.
  "paragon.aggressive-refrain",
  "paragon.blazing-finale",
  "paragon.enduring-harmony",
  "paragon.finale-of-restoration",
  "paragon.hasty-refrain",
  "paragon.purifying-finale",
  // Echoes 2 (#1485): an armor bonus against one damage type is not one
  // the bot weighs, and the rest waits for a chant or a shout.
  "paragon.bladeturn-refrain",
  "paragon.energizing-finale",
  "paragon.soldiers-fury",
  // Chants (#1483) whose energy, adrenaline or cleanse waits for the
  // bearer's next skill of a kind.
  "paragon.zealous-anthem",
  "paragon.aria-of-zeal",
  "paragon.lyric-of-zeal",
  "paragon.lyric-of-purification",
  "paragon.song-of-purification",
  "paragon.hexbreaker-aria",
  "paragon.anthem-of-fury",
  // An ally's attacks made holy and penetrating (#1519): no rule weighs it.
  "monk.judges-insight",
  // Necromancer and Elementalist staples (#1540): an ally's energy, a
  // party's blows through an enchantment's rider, armor against one kind
  // of damage, and a spirit's adrenaline aura are none the bot weighs.
  "necromancer.blood-is-power",
  "necromancer.order-of-pain",
  "elementalist.ward-against-elements",
  "ranger.infuriating-heat",
  // Chants (#1505) on how the next skill goes: nothing the bot weighs.
  "paragon.song-of-concentration",
  "paragon.anthem-of-guidance",
  "paragon.energizing-chorus",
  "paragon.anthem-of-envy",
  // Elementalist staples 2 (#1575): a ward that slows foes or keeps allies
  // standing is no rule the bot weighs.
  "elementalist.ward-against-foes",
  "elementalist.ward-of-stability",
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
