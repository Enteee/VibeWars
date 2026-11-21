/**
 * Every cosmetic this build knows (ADR-0056): what each looks like and
 * what earns it. Purely visual: nothing here reaches the simulation, and
 * an id another build knows and this one does not is drawn as nothing.
 * Every entry passes `checkCosmetic` (`check.ts`), in a test.
 */

import type { MessageKey } from "../i18n/index.js";

import { FLAME_STREAK, TIERS, TOP_RANK } from "./unlocks.js";

/** The slots of the first cut (#3577); the others come with #3578–#3581. */
export const COSMETIC_SLOTS = ["frame", "title", "flame"] as const;

export type CosmeticSlot = (typeof COSMETIC_SLOTS)[number];

/**
 * What earns an item, read off the key's leaderboard entry (ADR-0056):
 * verified ranked wins, a current rank, or a current win streak.
 */
export type CosmeticRequirement =
  { readonly wins: number } | { readonly rankAtMost: number } | { readonly streakAtLeast: number };

/**
 * Where a look is drawn (ADR-0056 §4): on the name plate, beside the
 * name, never over a body; or on the ground under the body, under its
 * rings, conditions, telegraphs and call marks.
 */
export const COSMETIC_LAYERS = ["nameplate", "under-body"] as const;

export type CosmeticLayer = (typeof COSMETIC_LAYERS)[number];

interface LookBase {
  readonly layer: CosmeticLayer;
  /** Whether it moves; under reduced motion it is drawn still. */
  readonly motion: "still" | "flicker";
  /** A ground or trail effect's size and strength; `null` for a name-plate look. */
  readonly ground: { readonly radiusOfBody: number; readonly alpha: number } | null;
  /** No cosmetic makes a sound (ADR-0056 §4). */
  readonly sound: null;
}

export type CosmeticLook = LookBase &
  (
    | {
        /** A rim round the name plate, `width` px. */
        readonly kind: "frame";
        readonly colour: number;
        readonly width: number;
      }
    | {
        /** A line under the name, in `colour`, glowing `glow`. */
        readonly kind: "title";
        readonly label: MessageKey;
        readonly colour: number;
        readonly glow: number;
      }
    | {
        /** A small flame beside the name, while the streak holds. */
        readonly kind: "flame";
        readonly colour: number;
      }
  );

export interface CosmeticEntry {
  /** Stable, at most `MAX_COSMETIC_ID_LENGTH`: it is signed and sent. */
  readonly id: string;
  readonly slot: CosmeticSlot;
  readonly requires: CosmeticRequirement;
  readonly look: CosmeticLook;
  /** Its name in the picker. */
  readonly name: MessageKey;
}

const TIER_1 = { wins: TIERS[1] } as const;
const TIER_2 = { wins: TIERS[2] } as const;
const TIER_4 = { wins: TIERS[4] } as const;
const TOP = { rankAtMost: TOP_RANK } as const;
/** The streak the flame is lit by (ADR-0056 §5). */
const STREAK = { streakAtLeast: FLAME_STREAK } as const;
const PLATE = { layer: "nameplate", motion: "still", ground: null, sound: null } as const;

/**
 * Four tiers, four hues: jade, rose, teal and orchid. Each is a hand's
 * width on the colour wheel from the team colours, the condition and
 * hex hues and every zone's (`check.ts`), so a frame never reads as a cue.
 */
const JADE = 0x38e070;
const ROSE = 0xe65ca1;
const TEAL = 0x33ffff;
const ORCHID = 0xe038e0;
/**
 * The streak flame's mint, a spirit fire: every warm hue is taken by
 * burning, the hazards' zones or the third team, so it burns cool.
 */
const STREAK_MINT = 0x33ffbb;

export const COSMETIC_CATALOG: readonly CosmeticEntry[] = [
  {
    id: "frame-jade",
    slot: "frame",
    requires: TIER_1,
    look: { ...PLATE, kind: "frame", colour: JADE, width: 1 },
    name: "cosmetics.item.frameJade",
  },
  {
    id: "frame-rose",
    slot: "frame",
    requires: TIER_2,
    look: { ...PLATE, kind: "frame", colour: ROSE, width: 1.5 },
    name: "cosmetics.item.frameRose",
  },
  {
    id: "frame-teal",
    slot: "frame",
    requires: TIER_4,
    look: { ...PLATE, kind: "frame", colour: TEAL, width: 2 },
    name: "cosmetics.item.frameTeal",
  },
  {
    id: "frame-orchid",
    slot: "frame",
    requires: TOP,
    look: { ...PLATE, kind: "frame", colour: ORCHID, width: 2 },
    name: "cosmetics.item.frameOrchid",
  },
  {
    id: "title-contender",
    slot: "title",
    requires: TIER_1,
    look: {
      ...PLATE,
      kind: "title",
      label: "cosmetics.title.contender",
      colour: JADE,
      glow: JADE,
    },
    name: "cosmetics.title.contender",
  },
  {
    id: "title-veteran",
    slot: "title",
    requires: TIER_2,
    look: { ...PLATE, kind: "title", label: "cosmetics.title.veteran", colour: ROSE, glow: ROSE },
    name: "cosmetics.title.veteran",
  },
  {
    id: "title-warlord",
    slot: "title",
    requires: TIER_4,
    look: { ...PLATE, kind: "title", label: "cosmetics.title.warlord", colour: TEAL, glow: TEAL },
    name: "cosmetics.title.warlord",
  },
  {
    id: "title-champion",
    slot: "title",
    requires: TOP,
    look: {
      ...PLATE,
      kind: "title",
      label: "cosmetics.title.champion",
      colour: ORCHID,
      glow: ORCHID,
    },
    name: "cosmetics.title.champion",
  },
  {
    id: "flame-streak",
    slot: "flame",
    requires: STREAK,
    look: { ...PLATE, motion: "flicker", kind: "flame", colour: STREAK_MINT },
    name: "cosmetics.item.flame",
  },
];

const BY_ID = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry]));

/** The entry `id` names, or `undefined` for one this build does not know. */
export function cosmeticById(id: string): CosmeticEntry | undefined {
  return BY_ID.get(id);
}
