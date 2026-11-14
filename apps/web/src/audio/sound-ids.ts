/**
 * Every sound effect the client plays, combat (#104) and objectives (#1387) and the
 * world's levers, gates and walls (#3139).
 * This is the single list: each id has exactly one file at
 * `public/sfx/<id>.mp3`, rendered from `audio/sfx/<id>.strudel.js` by
 * `scripts/assets/render-sfx.mjs`, and `sfx-files.test.ts` holds the two together.
 *
 * A cast plays two at once (#3298): its profession's `cast-base-*` and its
 * skill type's `cast-motif-*`, pitched per skill.
 */
export const SOUND_IDS = [
  "cast-target",
  "hit-dealt",
  "hit-taken",
  "heal",
  "interrupt",
  "interrupt-missed",
  "death",
  "refused",
  "weapon-swing",
  "bow-release",
  "objective-ours",
  "objective-theirs",
  "lever",
  "gate-stone",
  "barrier",
  "wall-crumble",
  "enchant-on",
  "hex-on",
  "stance-on",
  "shout",
  "area-warn",
  "spirit-up",
  "form-on",
  "cast-base-warrior",
  "cast-base-ranger",
  "cast-base-monk",
  "cast-base-necromancer",
  "cast-base-mesmer",
  "cast-base-elementalist",
  "cast-base-assassin",
  "cast-base-ritualist",
  "cast-base-paragon",
  "cast-base-dervish",
  "cast-base-common",
  "cast-motif-spell",
  "cast-motif-hex",
  "cast-motif-enchantment",
  "cast-motif-signet",
  "cast-motif-shout",
  "cast-motif-attack",
  "cast-motif-ritual",
  "cast-motif-ward",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];
