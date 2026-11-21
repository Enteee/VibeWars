/**
 * Every cosmetic this build knows (ADR-0056): what each looks like and
 * what earns it. Purely visual: nothing here reaches the simulation, and
 * an id another build knows and this one does not is drawn as nothing.
 * Every entry passes `checkCosmetic` (`check.ts`), in a test.
 */

import type { MessageKey } from "../i18n/index.js";

import { FLAME_STREAK, TIERS, TOP_RANK } from "./unlocks.js";

/** The slots so far (#3577, #3578); the others come with #3579–#3581. */
export const COSMETIC_SLOTS = ["frame", "title", "flame", "aura", "trail"] as const;

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
  /**
   * A ground or trail effect's size and strength; `null` for a name-plate
   * look. An aura's `radiusOfBody` is how far it reaches past the body's
   * rim, a trail's how big each mote is, both as a share of the body's radius.
   */
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
    | {
        /** A soft ring at the feet (#3578), `sparks` sparks turning on it. */
        readonly kind: "aura";
        readonly colour: number;
        readonly sparks: number;
      }
    | {
        /** Motes left where the body walks (#3578), fading in `TRAIL_SECONDS`. */
        readonly kind: "trail";
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
const TIER_3 = { wins: TIERS[3] } as const;
const TIER_4 = { wins: TIERS[4] } as const;
const TIER_5 = { wins: TIERS[5] } as const;
const TOP = { rankAtMost: TOP_RANK } as const;
/** The streak the flame is lit by (ADR-0056 §5). */
const STREAK = { streakAtLeast: FLAME_STREAK } as const;
const PLATE = { layer: "nameplate", motion: "still", ground: null, sound: null } as const;
/** A ground aura's reach past the rim, and its strength (#3578): inside ADR-0056 §4. */
const AURA = {
  layer: "under-body",
  motion: "flicker",
  ground: { radiusOfBody: 0.5, alpha: 0.35 },
  sound: null,
} as const;
/** A trail mote's size and strength (#3578). */
const TRAIL = {
  layer: "under-body",
  motion: "flicker",
  ground: { radiusOfBody: 0.25, alpha: 0.35 },
  sound: null,
} as const;

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
 * The streak flame's gold: as warm as a flame gets a hand's width from
 * the burning condition's orange and every other cue (`check.ts`).
 */
const STREAK_GOLD = 0xffea00;
/**
 * The ground looks (#3578): moss, ember, frost and starlight. Vivid, each
 * a hand's width from every cue (`check.ts`): a dull dust or a pale
 * spark sits too near the zones' earth and stone to pass.
 */
const MOSS = 0x66ff33;
const EMBER = 0xff1f5a;
const FROST = 0x00ccff;
const STARLIGHT = 0xf080ff;

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
    id: "aura-moss",
    slot: "aura",
    requires: TIER_1,
    look: { ...AURA, kind: "aura", colour: MOSS, sparks: 0 },
    name: "cosmetics.item.auraMoss",
  },
  {
    id: "aura-ember",
    slot: "aura",
    requires: TIER_2,
    look: { ...AURA, kind: "aura", colour: EMBER, sparks: 3 },
    name: "cosmetics.item.auraEmber",
  },
  {
    id: "aura-frost",
    slot: "aura",
    requires: TIER_3,
    look: { ...AURA, kind: "aura", colour: FROST, sparks: 4 },
    name: "cosmetics.item.auraFrost",
  },
  {
    id: "aura-starlight",
    slot: "aura",
    requires: TIER_5,
    look: { ...AURA, kind: "aura", colour: STARLIGHT, sparks: 6 },
    name: "cosmetics.item.auraStarlight",
  },
  {
    id: "trail-moss",
    slot: "trail",
    requires: TIER_1,
    look: { ...TRAIL, kind: "trail", colour: MOSS },
    name: "cosmetics.item.trailMoss",
  },
  {
    id: "trail-ember",
    slot: "trail",
    requires: TIER_2,
    look: { ...TRAIL, kind: "trail", colour: EMBER },
    name: "cosmetics.item.trailEmber",
  },
  {
    id: "trail-frost",
    slot: "trail",
    requires: TIER_3,
    look: { ...TRAIL, kind: "trail", colour: FROST },
    name: "cosmetics.item.trailFrost",
  },
  {
    id: "trail-starlight",
    slot: "trail",
    requires: TIER_5,
    look: { ...TRAIL, kind: "trail", colour: STARLIGHT },
    name: "cosmetics.item.trailStarlight",
  },
  {
    id: "flame-streak",
    slot: "flame",
    requires: STREAK,
    look: { ...PLATE, motion: "flicker", kind: "flame", colour: STREAK_GOLD },
    name: "cosmetics.item.flame",
  },
];

const BY_ID = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry]));

/** The entry `id` names, or `undefined` for one this build does not know. */
export function cosmeticById(id: string): CosmeticEntry | undefined {
  return BY_ID.get(id);
}
