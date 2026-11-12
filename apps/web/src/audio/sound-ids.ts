/**
 * Every sound effect the client plays, combat (#104) and objectives (#1387) and the
 * world's levers, gates and walls (#3139).
 * This is the single list: each id has exactly one file at
 * `public/sfx/<id>.mp3`, rendered from `audio/sfx/<id>.strudel.js` by
 * `scripts/assets/render-sfx.mjs`, and `sfx-files.test.ts` holds the two together.
 */
export const SOUND_IDS = [
  "cast-self",
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
] as const;

export type SoundId = (typeof SOUND_IDS)[number];
