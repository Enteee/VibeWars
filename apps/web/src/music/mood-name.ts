import { t, type MessageKey } from "../i18n/index.js";
import type { Mood } from "./mood.js";

const MOOD_NAMES: Readonly<Record<Mood, MessageKey>> = {
  atmospheric: "mood.atmospheric",
  adventurous: "mood.adventurous",
  mysterious: "mood.mysterious",
  melancholy: "mood.melancholy",
  epic: "mood.epic",
  action: "mood.action",
  tense: "mood.tense",
  dark: "mood.dark",
  triumphant: "mood.triumphant",
};

/** What a mood is called in the player's language. */
export function moodName(mood: Mood): string {
  return t(MOOD_NAMES[mood]);
}
