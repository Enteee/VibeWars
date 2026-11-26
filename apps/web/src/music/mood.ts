export const MOODS = [
  "atmospheric",
  "adventurous",
  "mysterious",
  "melancholy",
  "epic",
  "action",
  "tense",
  "dark",
  "triumphant",
] as const;

export type Mood = (typeof MOODS)[number];
