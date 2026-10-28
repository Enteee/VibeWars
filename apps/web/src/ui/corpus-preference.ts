import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/**
 * Whether the skill library lists the GW1 skills not in the game yet
 * (#1220), across reloads. Off until the player turns it on.
 */

const SHOW_CORPUS_KEY = `${STORAGE_NAMESPACE}.showCorpus`;

export function loadShowCorpus(): boolean {
  try {
    return localStorage.getItem(SHOW_CORPUS_KEY) === "true";
  } catch {
    // Private browsing can throw on localStorage access; off is the default.
    return false;
  }
}

export function saveShowCorpus(show: boolean): void {
  try {
    localStorage.setItem(SHOW_CORPUS_KEY, String(show));
  } catch {
    // The toggle still works for this session; it just is not remembered.
  }
}
