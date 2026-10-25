/**
 * What a track feels like (#366 §3.2). A track lists one or more, its
 * primary mood first; the director matches them against the moods of
 * where the player is (`map-moods.ts`).
 */
export type Mood =
  | "atmospheric"
  | "adventurous"
  | "mysterious"
  | "melancholy"
  | "epic"
  | "action"
  | "tense"
  | "dark"
  | "triumphant";
