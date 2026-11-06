import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, getSkill } from "../../skills/catalog.js";
import {
  botUses,
  onlyInterrupts,
  removedCategories,
  setupOf,
  takenOffFoe,
} from "./skill-intent.js";

/**
 * Skills a bot never uses (#1189). A new skill is either given a use by
 * its effects or listed here, on purpose.
 */
const NO_BOT_USE = new Set([
  // Own-skill modifiers (#1761): cheaper, faster or longer own skills are
  // no role the bot weighs.
  "monk.divine-spirit",
  "necromancer.cultists-fervor",
  "monk.blessed-aura",
  "monk.healers-covenant",
  "monk.holy-haste",
  "ranger.practiced-stance",
  // Trapper's Focus and Speed (#1966) go up before a trap, not for a use of
  // their own.
  "ranger.trappers-focus",
  "ranger.trappers-speed",
  "dervish.extend-enchantments",
  // Aura of Stability (#1870): knockdown kept off an ally is no defence
  // the bot weighs, as Balanced Stance on itself.
  "monk.aura-of-stability",
  // Elemental and Physical Resistance, Vital Blessing and Vital Weapon
  // (#1872): armor against one kind of damage and more maximum Health are
  // no defence the bot weighs, as Avatar of Melandru's.
  "mesmer.elemental-resistance",
  "mesmer.physical-resistance",
  "monk.vital-blessing",
  "ritualist.vital-weapon",
  // Signet of Stamina (#2316), the same: more maximum Health until a hit.
  "warrior.signet-of-stamina",
  // Warrior's Cunning (#2335): blocks made not to happen are no use the
  // bot weighs yet.
  "warrior.warriors-cunning",
  // Fox's Promise (#2368), the same, for dagger attacks.
  "assassin.foxs-promise",
  // Spell Breaker (#1511): a foe's spells refused is not a defence the
  // bot weighs.
  "monk.spell-breaker",
  // Dwayna's Sorrow (#1762): a heal that waits on an ally's death is
  // nothing the bot plans for.
  "monk.dwaynas-sorrow",
  // Death Nova (#1931), the same, a burst that waits on an ally's death.
  "necromancer.death-nova",
  // Dark Aura and Demonic Flesh (#2313), the same, damage that waits on
  // an ally's sacrifice or on the caster's foe-targeted skills.
  "necromancer.dark-aura",
  "necromancer.demonic-flesh",
  // Aura of Displacement, Shadow Meld and Shadow of Haste (#1826): a step
  // there and back is nothing the bot plans for yet.
  "assassin.aura-of-displacement",
  "assassin.shadow-meld",
  "assassin.shadow-of-haste",
  // Recall and Shadow Walk (#1930): a step that waits on an end, or
  // that disables its own attacks, is nothing the bot plans for yet.
  "assassin.recall",
  "assassin.shadow-walk",
  // Live Vicariously (#1748): Health to the caster when its ally hits is
  // no heal the bot weighs.
  "monk.live-vicariously",
  // Nor Purifying Veil's, whose removal waits for the enchantment to end.
  "monk.purifying-veil",
  // Companion commands and pet attacks: out of scope for a bot.
  "ranger.bestial-mauling",
  "ranger.bestial-pounce",
  "ranger.brutal-strike",
  "ranger.call-of-haste",
  "ranger.call-of-protection",
  "ranger.charm-animal",
  "ranger.comfort-animal",
  "ranger.disrupting-lunge",
  "ranger.enraged-lunge",
  "ranger.ferocious-strike",
  "ranger.feral-aggression",
  "ranger.feral-lunge",
  "ranger.heal-as-one",
  "ranger.maiming-strike",
  "ranger.melandrus-assault",
  "ranger.otyughs-cry",
  "ranger.poisonous-bite",
  "ranger.pounce",
  "ranger.predators-pounce",
  "ranger.predatory-bond",
  "ranger.rampage-as-one",
  "ranger.revive-animal",
  "ranger.run-as-one",
  "ranger.savage-pounce",
  "ranger.scavenger-strike",
  "ranger.symbiotic-bond",
  // Nature's Renewal's and Equinox's auras slow and tax every caster (#2321):
  // no role the bot weighs.
  "ranger.natures-renewal",
  "ranger.equinox",
  // Speed, energy, attack speed and other self-help no rule reaches for.
  "ranger.archers-signet",
  "assassin.dash",
  "dervish.avatar-of-balthazar",
  "dervish.avatar-of-dwayna",
  "dervish.avatar-of-lyssa",
  "dervish.avatar-of-melandru",
  "dervish.enchanted-haste",
  "dervish.featherfoot-grace",
  "dervish.fleeting-stability",
  "dervish.pious-fury",
  "dervish.eremites-zeal",
  "dervish.pious-haste",
  "dervish.vow-of-silence",
  "elementalist.glyph-of-lesser-energy",
  "elementalist.windborne-speed",
  "mesmer.arcane-echo",
  "mesmer.channeling",
  "mesmer.echo",
  "mesmer.illusion-of-haste",
  "mesmer.mantra-of-recovery",
  "mesmer.mantra-of-recall",
  "necromancer.blood-ritual",
  "necromancer.contagion",
  "necromancer.offering-of-blood",
  "paragon.fall-back",
  // Paragon staples (#2222): Song of Power's Energy regeneration, as Blood
  // Ritual's, and Leader's Zeal's Energy and "Make Your Time!"'s adrenaline
  // by allies near, as Channeling's by foes, are no rule the bot weighs.
  "paragon.leaders-zeal",
  "paragon.make-your-time",
  "paragon.song-of-power",
  // Godspeed, "Lead the Way!" and "Brace Yourself!" (#1955): cast by
  // play-build's rider rule, not an intent.
  "paragon.brace-yourself",
  "paragon.godspeed",
  "paragon.incoming",
  "paragon.lead-the-way",
  "paragon.make-haste",
  "ranger.serpents-quickness",
  "ranger.winnowing",
  "ritualist.cruel-was-daoshen",
  "ritualist.destructive-was-glaive",
  "ritualist.energetic-was-lee-sa",
  "ritualist.pure-was-li-ming",
  "ritualist.signet-of-creation",
  "ritualist.vengeful-was-khanhei",
  "ritualist.weapon-of-quickening",
  "warrior.balanced-stance",
  // Steady Stance (#2316), as Balanced Stance: a knockdown turned away.
  "warrior.steady-stance",
  "warrior.battle-rage",
  "warrior.endure-pain",
  "warrior.rage-of-the-ntouka",
  "warrior.rush",
  "warrior.shields-up",
  "warrior.sprint",
  // Minions, wells and enchantment strips: no rule for them yet.
  "necromancer.animate-bone-horror",
  "necromancer.animate-bone-minions",
  "necromancer.animate-vampiric-horror",
  "necromancer.animate-flesh-golem",
  "necromancer.animate-shambling-horror",
  "necromancer.animate-bone-fiend",
  // Minions 3 (#1915): no minion rule yet either. Infuse Condition is a
  // defence.
  "necromancer.order-of-undeath",
  "necromancer.aura-of-the-lich",
  "necromancer.taste-of-death",
  "necromancer.well-of-suffering",
  // A foe's Energy drained in an area (#1730): no rule for it.
  "necromancer.well-of-weariness",
  // Glyphs on the next spell (#1730): no rule times them.
  "elementalist.glyph-of-concentration",
  "elementalist.glyph-of-sacrifice",
  "elementalist.glyph-of-renewal",
  "elementalist.glyph-of-essence",
  // Wells 2 (#1732): no well has a use yet, as Well of Suffering.
  "necromancer.well-of-the-profane",
  "necromancer.well-of-silence",
  "necromancer.well-of-darkness",
  "necromancer.well-of-ruin",
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
  // A buff of your spirits, and a spirit pulled to you (#1777): no rule for either.
  "ritualist.spiritleech-aura",
  "ritualist.draw-spirit",
  // A buff only while casting a binding ritual, and a buff of an allied
  // summoned creature that destroys it (#1827): no rule for either.
  "ritualist.armor-of-unfeeling",
  "ritualist.signet-of-ghostly-might",
  // What they do lands through a status trigger, not an effect a bot reads.
  "assassin.way-of-perfection",
  "ritualist.explosive-growth",
  "ritualist.splinter-weapon",
  "ritualist.vengeful-weapon",
  "ritualist.weapon-of-remedy",
  // Ranger staples 4 (#1742): an arrow that cannot be blocked or flies faster.
  "ranger.seeking-arrows",
  "ranger.read-the-wind",
  // Energy engine (#1614): energy back for spells still to be cast.
  "elementalist.fire-attunement",
  "elementalist.water-attunement",
  "elementalist.air-attunement",
  "elementalist.earth-attunement",
  // Scribe's Insight (#1913), the same, for signets still to be used.
  "monk.scribes-insight",
  // Spirit Channeling (#2368): Energy regeneration, no use of its own.
  "ritualist.spirit-channeling",
  // Echoes (#1423): what they do waits for a chant or a shout to end.
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
  // Soldier's Stance (#2316), the same: its speed waits for a shout or chant.
  "warrior.soldiers-stance",
  // Chants (#1483) whose energy, adrenaline or cleanse waits for the
  // bearer's next skill of a kind.
  "paragon.zealous-anthem",
  "paragon.aria-of-zeal",
  "paragon.lyric-of-zeal",
  "paragon.lyric-of-purification",
  "paragon.song-of-purification",
  // Assassin's Remedy (#2428), the same: its cleanse waits for an attack skill.
  "assassin.assassins-remedy",
  "paragon.hexbreaker-aria",
  "paragon.anthem-of-fury",
  // An ally's attacks made holy and penetrating (#1519): no rule weighs it.
  "monk.judges-insight",
  // Necromancer and Elementalist staples (#1540): an ally's energy, armor
  // against one kind of damage, and a spirit's adrenaline aura are none
  // the bot weighs.
  "necromancer.blood-is-power",
  // Awaken the Blood (#1979) makes sacrifices larger: no attack status
  // for a boost (#2000) to weigh.
  "necromancer.awaken-the-blood",
  "elementalist.ward-against-elements",
  "ranger.infuriating-heat",
  // Nature rituals 1 (#1745): auras on both teams the bot does not weigh,
  // as Winnowing's.
  "ranger.quickening-zephyr",
  "ranger.frozen-soil",
  "ranger.muddy-terrain",
  "ranger.conflagration",
  "ranger.winter",
  // Nature rituals 2 (#1873): auras on both teams, as rituals 1's.
  "ranger.symbiosis",
  "ranger.favorable-winds",
  "ranger.brambles",
  "ranger.tranquility",
  "ranger.toxicity",
  "ranger.greater-conflagration",
  // Nature rituals 3 (#1886): a death in range, and costs on both teams,
  // nothing the bot weighs.
  "ranger.edge-of-extinction",
  "ranger.pestilence",
  "ranger.energizing-wind",
  "ranger.primal-echoes",
  "ranger.roaring-winds",
  // Chants (#1505) on how the next skill goes: nothing the bot weighs.
  "paragon.song-of-concentration",
  "paragon.anthem-of-guidance",
  "paragon.energizing-chorus",
  "paragon.anthem-of-envy",
  // Elementalist staples 2 (#1575): a ward that slows foes or keeps allies
  // standing is no rule the bot weighs.
  "elementalist.ward-against-foes",
  "elementalist.ward-of-stability",
  // Paragon staples 4 (#1677): energy and adrenaline on a condition the
  // skill does not check itself are no rules the bot weighs.
  "paragon.the-power-is-yours",
  "paragon.focused-anger",
  // Monk mechanics (#1754): a holy aura round an ally is no rule the bot
  // weighs.
  "monk.balthazars-aura",
  // Ancestors' Rage (#2212): the same, a lightning pulse round an ally.
  "ritualist.ancestors-rage",
  // Assassin staples 5 (#1757): unblockable next attacks are no rule the
  // bot weighs.
  "assassin.way-of-the-fox",
  // "Not enchanted" (#1916): an ally's weapon, and adrenaline gained
  // faster while not enchanted, are no rules the bot weighs.
  "ritualist.brutal-weapon",
  "paragon.natural-temper",
  // Attributes set or borrowed (#1929): a higher rank on its own spells is
  // no rule the bot weighs, as an attunement's energy.
  "elementalist.master-of-magic",
  "mesmer.signet-of-illusions",
  // Attributes raised (#1941): a boost timed before the next spell, binding
  // ritual has no use in the bot's vocabulary yet, as the glyphs on the
  // next spell.
  "elementalist.glyph-of-elemental-power",
  "elementalist.glyph-of-energy",
  "ritualist.ritual-lord",
  // Take what another has (#1965): an ally's elite borrowed and a foe's
  // spirit taken have steps of their own in `playBuild`, no use to weigh.
  "mesmer.arcane-mimicry",
  "ritualist.signet-of-binding",
  // Nature rituals 4 (#1956): an energy toll on everyone who attacks or
  // uses a skill, damage to whoever runs dry or a worse bleed, both sides
  // alike, is no rule the bot weighs, as Winnowing.
  "ranger.famine",
  "ranger.lacerate",
  "ranger.quicksand",
  // Pips for each condition and hex on the bearer (#2189): worth most when
  // it suffers, which no rule the bot has weighs.
  // Untargetable only while casting, then every skill disabled (#2189).
  "monk.spell-shield",
  "ranger.melandrus-resilience",
  // Energy only for each enchantment it maintains (#2260): no rule the bot
  // has counts its upkeep.
  "monk.blessed-signet",
  // Pips for each condition (and hex) on the bearer (#2259), as Melandru's
  // Resilience.
  "warrior.i-will-survive",
  "ritualist.resilient-was-xiko",
  // Burns only round the allies its bearer's later skills target (#2282).
  "monk.zealots-fire",
  // Energy for each sacrifice (#2275): worth only beside a sacrifice, which
  // no rule the bot has pairs.
  "necromancer.masochism",
  // Energy for its caster only when a foe hurts its bearer (#2286), and
  // heals only round its caster's later Protection and Divine Favor
  // spells: no role the bot weighs.
  "monk.essence-bond",
  "monk.divine-boon",
  // Armor against physical damage only (#2289), which no role counts yet:
  // Shields Up!'s goes unweighed the same way.
  "elementalist.armor-of-frost",
  // A bond on attacks, attack damage traded for healing, and faster expiry
  // (#2291): no role the bot weighs.
  "monk.life-bond",
  "monk.life-attunement",
  // Adrenaline and Energy for an ally that is being hit (#2302): no role
  // the bot weighs.
  "monk.balthazars-spirit",
  // Adrenaline by foes in earshot and a raised maximum (#2315), as
  // "Make Your Time!"'s and Endure Pain's: no rule the bot weighs.
  "warrior.to-the-limit",
  // A rider on the next Necromancer skill on a foe (#2333), its effect only
  // in a status trigger: no role the bot weighs.
  "necromancer.signet-of-suffering",
  // Energy later for Energy regeneration now (#2374), its gain only in a
  // status trigger: no role the bot weighs.
  "mesmer.signet-of-recall",
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
    // A step to a creature of its side is a way out (#1930); one to a foe is not.
    expect(botUses(skill("assassin.spirit-walk"))).toEqual(["escape"]);
    expect(botUses(skill("assassin.swap"))).toEqual(["escape"]);
    expect(botUses(skill("assassin.dark-prison"))).toEqual(["offence"]);
    // Taking foe minions is the take-minion rule's, not minion care's (#2092).
    expect(botUses(skill("necromancer.veratas-gaze"))).toEqual(["take-minion"]);
    expect(botUses(skill("necromancer.veratas-aura"))).toEqual(["take-minion"]);
    expect(botUses(skill("necromancer.malign-intervention"))).toEqual(["take-minion"]);
    expect(botUses(skill("necromancer.jagged-bones"))).toEqual(["minion-care"]);
    // Mesmer energy and utility (#2132).
    expect(botUses(skill("mesmer.ether-signet"))).toEqual(["energy"]);
    expect(botUses(skill("mesmer.lyssas-aura"))).toEqual(["energy"]);
    expect(botUses(skill("mesmer.persistence-of-memory"))).toEqual(["guard"]);
    expect(botUses(skill("mesmer.power-return"))).toEqual(["interrupt"]);
    expect(botUses(skill("mesmer.signet-of-midnight"))).toEqual(["offence"]);
  });

  it("boosts with a buff that only makes attacks hit harder (#2000)", () => {
    expect(botUses(skill("necromancer.order-of-pain"))).toEqual(["boost"]);
    expect(botUses(skill("warrior.for-great-justice"))).toEqual(["boost"]);
    expect(botUses(skill("warrior.frenzy"))).toEqual(["boost"]);
    // Blood Magic orders (#1979): a steal on each hit, a strike more of adrenaline.
    expect(botUses(skill("necromancer.order-of-the-vampire"))).toEqual(["boost"]);
    expect(botUses(skill("necromancer.dark-fury"))).toEqual(["boost"]);
    // A glyph, an attunement or a run acts on no blow.
    expect(botUses(skill("elementalist.glyph-of-energy"))).toEqual([]);
    expect(botUses(skill("elementalist.fire-attunement"))).toEqual([]);
    expect(botUses(skill("warrior.sprint"))).toEqual([]);
    expect(botUses(skill("monk.orison-of-healing"))).not.toContain("boost");
  });

  it("casts a pure enchantment strip at an enchanted foe (#1954)", () => {
    expect(botUses(skill("mesmer.mirror-of-disenchantment"))).toEqual(["offence"]);
    expect(takenOffFoe(skill("mesmer.mirror-of-disenchantment"))).toBe("enchantment");
    expect(takenOffFoe(skill("mesmer.inspired-enchantment"))).toBe("enchantment");
    // Its payoff, Health loss per Monk enchantment, needs one too (#1648).
    expect(takenOffFoe(skill("necromancer.pain-of-disenchantment"))).toBe("enchantment");
    // Anything else is cast at any foe.
    expect(takenOffFoe(skill("elementalist.fireball"))).toBeUndefined();
  });

  it("knows each setup and the status it puts on (#1975)", () => {
    expect(setupOf(skill("monk.air-of-enchantment"))).toEqual({
      setup: "cheaper-enchantments",
      statusId: "air-of-enchantment",
    });
    expect(setupOf(skill("necromancer.order-of-apostasy"))?.setup).toBe("party-strips");
    expect(setupOf(skill("assassin.dark-apostasy"))?.setup).toBe("critical-strips");
    expect(botUses(skill("assassin.dark-apostasy"))).toEqual(["setup"]);
    // The Ranger's (#2159).
    expect(setupOf(skill("ranger.disrupting-accuracy"))?.setup).toBe("critical-interrupts");
    expect(setupOf(skill("ranger.marksmans-wager"))?.setup).toBe("hit-wager");
    expect(botUses(skill("ranger.storm-chaser"))).toEqual(["setup"]);
    // Order of Pain's rider is no setup; Jaundiced Gaze is a strip at an
    // enchanted foe.
    expect(setupOf(skill("necromancer.order-of-pain"))).toBeUndefined();
    expect(botUses(skill("necromancer.jaundiced-gaze"))).toEqual(["offence"]);
    expect(takenOffFoe(skill("necromancer.jaundiced-gaze"))).toBe("enchantment");
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
