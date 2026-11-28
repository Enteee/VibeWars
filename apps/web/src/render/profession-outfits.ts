import type { ProfessionId } from "@vibewars/game-core";

/**
 * What a stacked figure wears (#4175): its outfit by its primary
 * profession, and one accent by its secondary, from the outfit study
 * (`docs/art/profession-outfit-study.svg`). Generic fantasy in the house's
 * gothic style, never a GW1 armour set. `stackSlices` builds each kind;
 * a new outfit adds its kinds here and a case to each of its builders.
 */

/**
 * The torso: a warrior's plate, a caster's robe, a short coat, a tight
 * wrap, a paragon's plate under a tabard.
 */
export type TorsoKind = "plate" | "robe" | "coat" | "wrap" | "tabard";
/** The legs: trousers, or a long robe skirt that hides them. */
export type LegKind = "trousers" | "robe";
/** Over the shoulders: pauldrons, a high cloth collar, a cloth mantle, bone spikes, or nothing. */
export type ShoulderKind = "pauldrons" | "collar" | "mantle" | "spikes" | "none";
/**
 * The head: a visored helm, a hood, a cowl that hides the face, a
 * wide-brimmed plumed hat, a turban, a feathered headdress, a bare head
 * with or without a circlet.
 */
export type HeadKind =
  "helm" | "hood" | "cowl" | "hat" | "turban" | "headdress" | "circlet" | "bare";
/** On the back, behind the torso: a quiver, two crossed blades, or a bundle of spears. */
export type BackKind = "quiver" | "blades" | "spears";

/**
 * An outfit: a kind per slot, and its `cloth`, the second fabric, a dark
 * or muted tone so that the team colour stays the loudest.
 */
export interface Outfit {
  readonly torso: TorsoKind;
  readonly legs: LegKind;
  readonly shoulders: ShoulderKind;
  readonly head: HeadKind;
  readonly back: BackKind | undefined;
  readonly cloth: number;
}

/** A secondary's mark on the outfit: a sash, a hem trim or a belt, in its tone. */
export interface Accent {
  readonly kind: "sash" | "trim" | "belt";
  readonly tone: number;
}

/** Plate, helm and pauldrons: the figure every body wore before #4175. */
export const WARRIOR_OUTFIT: Outfit = {
  torso: "plate",
  legs: "trousers",
  shoulders: "pauldrons",
  head: "helm",
  back: undefined,
  cloth: 0x4a4e58,
};

/** Each primary's outfit. */
export const PROFESSION_OUTFITS: Readonly<Record<ProfessionId, Outfit>> = {
  warrior: WARRIOR_OUTFIT,
  ranger: {
    torso: "coat",
    legs: "trousers",
    shoulders: "none",
    head: "hood",
    back: "quiver",
    cloth: 0x4c5a3a,
  },
  monk: {
    torso: "robe",
    legs: "robe",
    shoulders: "none",
    head: "bare",
    back: undefined,
    cloth: 0xd8cfb8,
  },
  elementalist: {
    torso: "robe",
    legs: "robe",
    shoulders: "collar",
    head: "circlet",
    back: undefined,
    cloth: 0x5a2a22,
  },
  necromancer: {
    torso: "robe",
    legs: "robe",
    shoulders: "spikes",
    head: "cowl",
    back: undefined,
    cloth: 0x2e2a38,
  },
  mesmer: {
    torso: "coat",
    legs: "trousers",
    shoulders: "mantle",
    head: "hat",
    back: undefined,
    cloth: 0x3a2a4a,
  },
  assassin: {
    torso: "wrap",
    legs: "trousers",
    shoulders: "none",
    head: "cowl",
    back: "blades",
    cloth: 0x22242c,
  },
  ritualist: {
    torso: "wrap",
    legs: "robe",
    shoulders: "mantle",
    head: "headdress",
    back: undefined,
    cloth: 0x2a5a52,
  },
  paragon: {
    torso: "tabard",
    legs: "trousers",
    shoulders: "pauldrons",
    head: "helm",
    back: "spears",
    cloth: 0xb89a4a,
  },
  dervish: {
    torso: "robe",
    legs: "robe",
    shoulders: "none",
    head: "turban",
    back: undefined,
    cloth: 0x7a4a2a,
  },
};

/** Each secondary's accent; one with none adds nothing. */
export const SECONDARY_ACCENTS: Readonly<Partial<Record<ProfessionId, Accent>>> = {
  warrior: { kind: "belt", tone: 0xc8ccd4 },
  ranger: { kind: "trim", tone: 0x6a9a48 },
  monk: { kind: "sash", tone: 0xf2ecdc },
  necromancer: { kind: "belt", tone: 0xd8d0b8 },
  mesmer: { kind: "sash", tone: 0xb06ae0 },
  elementalist: { kind: "trim", tone: 0xff9040 },
  assassin: { kind: "belt", tone: 0xc03040 },
  ritualist: { kind: "sash", tone: 0x40d0b8 },
  paragon: { kind: "trim", tone: 0xf0c850 },
  dervish: { kind: "sash", tone: 0xe0a040 },
};

/** What a body of `primary` wears: the warrior's outfit for none. */
export function outfitOf(primary: ProfessionId | undefined): Outfit {
  return primary === undefined ? WARRIOR_OUTFIT : PROFESSION_OUTFITS[primary];
}

/** The accent a `secondary` adds: none for no secondary. */
export function accentOf(secondary: ProfessionId | undefined): Accent | undefined {
  return secondary === undefined ? undefined : SECONDARY_ACCENTS[secondary];
}
