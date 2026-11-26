import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** The language the player picked in Options (#2648), across reloads. */

const LANGUAGE_KEY = `${STORAGE_NAMESPACE}.language`;

export function loadLanguage(): string | undefined {
  try {
    return localStorage.getItem(LANGUAGE_KEY) ?? undefined;
  } catch {
    // Private browsing can throw on localStorage access; the browser's language is the default.
    return undefined;
  }
}

export function saveLanguage(code: string): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, code);
  } catch {
    // Nothing to keep it in: the reload falls back to the browser's language.
  }
}
