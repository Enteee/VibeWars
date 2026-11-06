import { isCompanionRule } from "../../skills/activation.js";
import type { Skill } from "../../skills/types.js";
import {
  botUses,
  guardsInterrupt,
  ownTrapBoost,
  renewsSpirit,
  wardedDamageType,
  wardsTouch,
} from "./skill-intent.js";

/**
 * Bot coverage (#2490), as `skills/coverage.ts` is the catalog's: every
 * skill a bot never casts, named with the reason, so a fix card can be cut
 * per gap. `bot-coverage.test.ts` fails on a never-cast skill missing here
 * and on one here a bot does cast: the list only shrinks.
 */

/** Why a bot never casts a skill. A closed union, so the report groups. */
export type BotGap =
  | "support-spirit"
  | "spirit-buff"
  | "minion"
  | "pet"
  | "ground-effect"
  | "item-spell"
  | "party-buff"
  | "echo"
  | "weapon-spell"
  | "ally-enchantment"
  | "ally-buff"
  | "self-enchantment"
  | "stance"
  | "form"
  | "glyph"
  | "self-buff"
  | "resource-gain"
  | "other";

/** What each gap is, in one line. */
export const BOT_GAP_DESCRIPTIONS: Readonly<Record<BotGap, string>> = Object.freeze({
  "support-spirit": "a nature or binding ritual whose spirit does not attack",
  "spirit-buff": "acts on the caster's own spirits or summoned creature",
  minion: "animates a minion from a corpse, or spends one",
  pet: "charms, revives or buffs the caster's animal companion",
  "ground-effect": "a well or a ward placed on the ground",
  "item-spell": "a Ritualist item spell: the caster holds an ashes item",
  "party-buff": "a chant or shout on the party or allies nearby",
  echo: "a Paragon echo, finale or refrain",
  "weapon-spell": "a weapon spell on one ally",
  "ally-enchantment": "an enchantment on one ally that is no heal, defence or removal",
  "ally-buff": "a shout or skill on one ally",
  "self-enchantment": "an enchantment on the caster",
  stance: "a stance",
  form: "a form",
  glyph: "a glyph",
  "self-buff": "a signet, skill, shout or preparation that buffs the caster",
  "resource-gain": "gains Energy or adrenaline for the caster under a condition",
  other: "a pattern of fewer than three skills",
});

/**
 * Whether a rule casts `skill` by a test of its own rather than by
 * `botUses`: Signet of Binding, Gaze of Fury's renewal, the trap boosts,
 * Arcane Mimicry, the mantras and the touch wards.
 */
function castByRule(skill: Skill): boolean {
  return (
    skill.target === "enemy-spirit" ||
    skill.target === "enemy-minion" ||
    skill.effects.some((effect) => effect.kind === "copy-elite") ||
    renewsSpirit(skill) ||
    wardsTouch(skill) ||
    guardsInterrupt(skill) ||
    wardedDamageType(skill) !== undefined ||
    ownTrapBoost(skill) !== undefined
  );
}

/** Whether a bot ever casts `skill`. */
export function botCasts(skill: Skill): boolean {
  return botUses(skill).length > 0 || castByRule(skill);
}

/**
 * The skills `BOT_UNUSED` answers for: all but a companion command, which
 * a bot never gives, by design (#1046).
 */
export function botCoverable(skill: Skill): boolean {
  return !isCompanionRule(skill.target);
}

/** Every skill a bot never casts, by why. Fixing one deletes its row. */
export const BOT_UNUSED: Readonly<Record<string, BotGap>> = Object.freeze({
  "paragon.brace-yourself": "ally-buff",
  "paragon.inspirational-speech": "ally-buff",
  "paragon.lead-the-way": "ally-buff",
  "paragon.make-haste": "ally-buff",
  "ritualist.ancestors-rage": "ally-buff",
  "assassin.recall": "ally-enchantment",
  "assassin.shadow-meld": "ally-enchantment",
  "elementalist.windborne-speed": "ally-enchantment",
  "mesmer.ancestors-visage": "ally-enchantment",
  "mesmer.sympathetic-visage": "ally-enchantment",
  "monk.aura-of-stability": "ally-enchantment",
  "monk.balthazars-aura": "ally-enchantment",
  "monk.balthazars-spirit": "ally-enchantment",
  "monk.dwaynas-sorrow": "ally-enchantment",
  "monk.essence-bond": "ally-enchantment",
  "monk.judges-insight": "ally-enchantment",
  "monk.life-attunement": "ally-enchantment",
  "monk.life-bond": "ally-enchantment",
  "monk.live-vicariously": "ally-enchantment",
  "monk.spell-breaker": "ally-enchantment",
  "monk.strength-of-honor": "ally-enchantment",
  "necromancer.blood-is-power": "ally-enchantment",
  "necromancer.blood-ritual": "ally-enchantment",
  "necromancer.dark-aura": "ally-enchantment",
  "necromancer.death-nova": "ally-enchantment",
  "paragon.bladeturn-refrain": "echo",
  "paragon.blazing-finale": "echo",
  "paragon.enduring-harmony": "echo",
  "paragon.energizing-finale": "echo",
  "paragon.finale-of-restoration": "echo",
  "paragon.hasty-refrain": "echo",
  "paragon.purifying-finale": "echo",
  "paragon.soldiers-fury": "echo",
  "dervish.avatar-of-balthazar": "form",
  "dervish.avatar-of-dwayna": "form",
  "dervish.avatar-of-lyssa": "form",
  "elementalist.glyph-of-concentration": "glyph",
  "elementalist.glyph-of-elemental-power": "glyph",
  "elementalist.glyph-of-energy": "glyph",
  "elementalist.glyph-of-essence": "glyph",
  "elementalist.glyph-of-lesser-energy": "glyph",
  "elementalist.glyph-of-renewal": "glyph",
  "elementalist.glyph-of-sacrifice": "glyph",
  "elementalist.glyph-of-swiftness": "glyph",
  "elementalist.ward-against-elements": "ground-effect",
  "elementalist.ward-against-foes": "ground-effect",
  "elementalist.ward-of-stability": "ground-effect",
  "elementalist.ward-of-weakness": "ground-effect",
  "necromancer.well-of-darkness": "ground-effect",
  "necromancer.well-of-ruin": "ground-effect",
  "necromancer.well-of-silence": "ground-effect",
  "necromancer.well-of-suffering": "ground-effect",
  "necromancer.well-of-the-profane": "ground-effect",
  "necromancer.well-of-weariness": "ground-effect",
  "ritualist.cruel-was-daoshen": "item-spell",
  "ritualist.destructive-was-glaive": "item-spell",
  "ritualist.energetic-was-lee-sa": "item-spell",
  "ritualist.lively-was-naomei": "item-spell",
  "ritualist.resilient-was-xiko": "item-spell",
  "ritualist.vengeful-was-khanhei": "item-spell",
  "ritualist.attuned-was-songkai": "item-spell",
  "ritualist.vocal-was-sogolon": "item-spell",
  "necromancer.animate-bone-fiend": "minion",
  "necromancer.animate-bone-horror": "minion",
  "necromancer.animate-bone-minions": "minion",
  "necromancer.animate-flesh-golem": "minion",
  "necromancer.animate-shambling-horror": "minion",
  "necromancer.animate-vampiric-horror": "minion",
  "necromancer.taste-of-death": "minion",
  "assassin.aura-of-displacement": "other",
  "assassin.shadow-walk": "other",
  "mesmer.blackout": "other",
  "mesmer.signet-of-humility": "other",
  "monk.light-of-dwayna": "other",
  "paragon.anthem-of-envy": "party-buff",
  "paragon.anthem-of-fury": "party-buff",
  "paragon.anthem-of-guidance": "party-buff",
  "paragon.aria-of-zeal": "party-buff",
  "paragon.energizing-chorus": "party-buff",
  "paragon.fall-back": "party-buff",
  "paragon.godspeed": "party-buff",
  "paragon.hexbreaker-aria": "party-buff",
  "paragon.incoming": "party-buff",
  "paragon.lyric-of-purification": "party-buff",
  "paragon.lyric-of-zeal": "party-buff",
  "paragon.song-of-concentration": "party-buff",
  "paragon.song-of-power": "party-buff",
  "paragon.song-of-purification": "party-buff",
  "paragon.the-power-is-yours": "party-buff",
  "paragon.we-shall-return": "party-buff",
  "paragon.zealous-anthem": "party-buff",
  "warrior.shields-up": "party-buff",
  "ranger.charm-animal": "pet",
  "ranger.feral-aggression": "pet",
  "ranger.revive-animal": "pet",
  "monk.blessed-signet": "resource-gain",
  "necromancer.offering-of-blood": "resource-gain",
  "paragon.leaders-zeal": "resource-gain",
  "paragon.make-your-time": "resource-gain",
  "ritualist.offering-of-spirit": "resource-gain",
  "ritualist.signet-of-creation": "resource-gain",
  "warrior.flourish": "resource-gain",
  "dervish.extend-enchantments": "self-buff",
  "mesmer.signet-of-illusions": "self-buff",
  "mesmer.signet-of-recall": "self-buff",
  "necromancer.order-of-undeath": "self-buff",
  "necromancer.signet-of-suffering": "self-buff",
  "paragon.focused-anger": "self-buff",
  "paragon.natural-temper": "self-buff",
  "ranger.archers-signet": "self-buff",
  "ranger.read-the-wind": "self-buff",
  "ranger.seeking-arrows": "self-buff",
  "ritualist.ritual-lord": "self-buff",
  "ritualist.soul-twisting": "self-buff",
  "warrior.i-will-survive": "self-buff",
  "warrior.rage-of-the-ntouka": "self-buff",
  "warrior.warriors-cunning": "self-buff",
  "dervish.signet-of-mystic-speed": "self-buff",
  "assassin.assassins-remedy": "self-enchantment",
  "assassin.foxs-promise": "self-enchantment",
  "assassin.way-of-perfection": "self-enchantment",
  "assassin.way-of-the-fox": "self-enchantment",
  "dervish.enchanted-haste": "self-enchantment",
  "dervish.eremites-zeal": "self-enchantment",
  "dervish.fleeting-stability": "self-enchantment",
  "dervish.meditation": "self-enchantment",
  "dervish.vow-of-silence": "self-enchantment",
  "elementalist.air-attunement": "self-enchantment",
  "elementalist.armor-of-frost": "self-enchantment",
  "elementalist.earth-attunement": "self-enchantment",
  "elementalist.fire-attunement": "self-enchantment",
  "elementalist.frigid-armor": "self-enchantment",
  "elementalist.master-of-magic": "self-enchantment",
  "elementalist.storm-djinns-haste": "self-enchantment",
  "elementalist.water-attunement": "self-enchantment",
  "mesmer.arcane-echo": "self-enchantment",
  "mesmer.channeling": "self-enchantment",
  "mesmer.echo": "self-enchantment",
  "mesmer.illusion-of-haste": "self-enchantment",
  "mesmer.mantra-of-recall": "self-enchantment",
  "mesmer.symbolic-celerity": "self-enchantment",
  "monk.blessed-aura": "self-enchantment",
  "monk.divine-boon": "self-enchantment",
  "monk.divine-spirit": "self-enchantment",
  "monk.healers-boon": "self-enchantment",
  "monk.healers-covenant": "self-enchantment",
  "monk.holy-haste": "self-enchantment",
  "monk.scribes-insight": "self-enchantment",
  "monk.smiters-boon": "self-enchantment",
  "monk.spell-shield": "self-enchantment",
  "monk.zealots-fire": "self-enchantment",
  "necromancer.aura-of-the-lich": "self-enchantment",
  "necromancer.awaken-the-blood": "self-enchantment",
  "necromancer.contagion": "self-enchantment",
  "necromancer.cultists-fervor": "self-enchantment",
  "necromancer.demonic-flesh": "self-enchantment",
  "necromancer.masochism": "self-enchantment",
  "ritualist.explosive-growth": "self-enchantment",
  "ritualist.spirit-channeling": "self-enchantment",
  "assassin.deadly-haste": "self-enchantment",
  "ritualist.renewing-memories": "self-enchantment",
  "ritualist.spirits-strength": "self-enchantment",
  "ritualist.sight-beyond-sight": "self-enchantment",
  "ritualist.wielders-remedy": "self-enchantment",
  "ritualist.wielders-zeal": "self-enchantment",
  "ritualist.armor-of-unfeeling": "spirit-buff",
  "ritualist.draw-spirit": "spirit-buff",
  "ritualist.signet-of-ghostly-might": "spirit-buff",
  "ritualist.spiritleech-aura": "spirit-buff",
  "assassin.dash": "stance",
  "assassin.shadow-of-haste": "stance",
  "dervish.pious-fury": "stance",
  "dervish.pious-haste": "stance",
  "mesmer.elemental-resistance": "stance",
  "mesmer.mantra-of-inscriptions": "stance",
  "mesmer.mantra-of-recovery": "stance",
  "mesmer.physical-resistance": "stance",
  "ranger.melandrus-resilience": "stance",
  "ranger.practiced-stance": "stance",
  "ranger.run-as-one": "stance",
  "ranger.serpents-quickness": "stance",
  "warrior.balanced-stance": "stance",
  "warrior.battle-rage": "stance",
  "warrior.rush": "stance",
  "warrior.soldiers-stance": "stance",
  "warrior.sprint": "stance",
  "warrior.steady-stance": "stance",
  "ranger.storms-embrace": "stance",
  "warrior.soldiers-speed": "stance",
  "ranger.brambles": "support-spirit",
  "ranger.conflagration": "support-spirit",
  "ranger.edge-of-extinction": "support-spirit",
  "ranger.energizing-wind": "support-spirit",
  "ranger.equinox": "support-spirit",
  "ranger.famine": "support-spirit",
  "ranger.favorable-winds": "support-spirit",
  "ranger.frozen-soil": "support-spirit",
  "ranger.greater-conflagration": "support-spirit",
  "ranger.infuriating-heat": "support-spirit",
  "ranger.lacerate": "support-spirit",
  "ranger.muddy-terrain": "support-spirit",
  "ranger.natures-renewal": "support-spirit",
  "ranger.pestilence": "support-spirit",
  "ranger.primal-echoes": "support-spirit",
  "ranger.quickening-zephyr": "support-spirit",
  "ranger.quicksand": "support-spirit",
  "ranger.roaring-winds": "support-spirit",
  "ranger.symbiosis": "support-spirit",
  "ranger.toxicity": "support-spirit",
  "ranger.tranquility": "support-spirit",
  "ranger.winnowing": "support-spirit",
  "ranger.winter": "support-spirit",
  "ritualist.empowerment": "support-spirit",
  "ritualist.life": "support-spirit",
  "ritualist.restoration": "support-spirit",
  "ritualist.brutal-weapon": "weapon-spell",
  "ritualist.ghostly-weapon": "weapon-spell",
  "ritualist.guided-weapon": "weapon-spell",
  "ritualist.nightmare-weapon": "weapon-spell",
  "ritualist.splinter-weapon": "weapon-spell",
  "ritualist.vengeful-weapon": "weapon-spell",
  "ritualist.weapon-of-fury": "weapon-spell",
  "ritualist.weapon-of-quickening": "weapon-spell",
  "ritualist.weapon-of-remedy": "weapon-spell",
  "ritualist.weapon-of-renewal": "weapon-spell",
});
