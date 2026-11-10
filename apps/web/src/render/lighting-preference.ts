import { STORAGE_NAMESPACE } from "../storage/namespace.js";

/** Whether the arena is lit (#2987), across reloads; the scene reads it every frame. */

const LIGHTING_KEY = `${STORAGE_NAMESPACE}.lighting`;

function loadLightingOn(): boolean {
  try {
    return localStorage.getItem(LIGHTING_KEY) !== "false";
  } catch {
    // Private browsing can throw on localStorage access; lighting on is the default.
    return true;
  }
}

let on = loadLightingOn();

export function lightingOn(): boolean {
  return on;
}

export function setLightingOn(next: boolean): void {
  on = next;
  try {
    localStorage.setItem(LIGHTING_KEY, String(next));
  } catch {
    // The switch still works for this session; it just is not remembered.
  }
}
