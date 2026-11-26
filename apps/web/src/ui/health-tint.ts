import { findStatusDefinition, statAtTwelve } from "@vibewars/game-core";
import type { PlayerSnapshot } from "@vibewars/game-session";

/** A health bar's tint for the worst degeneration on its combatant (#807). */
export type HealthTint = "hex" | "poison" | "bleeding";

const POISONS: ReadonlySet<string> = new Set(["poison", "disease"]);

/**
 * The tint a health bar takes for these statuses, by GW1's precedence; `null`
 * for none. A hex that drains health beats poison or disease, which beat
 * bleeding. Burning has no tint of its own, and a hex that drains only energy
 * (Malaise) none either. Unknown ids are ignored.
 */
export function healthTint(statusIds: readonly string[]): HealthTint | null {
  let tint: HealthTint | null = null;
  for (const id of statusIds) {
    const definition = findStatusDefinition(id);
    if (definition === undefined) {
      continue;
    }
    if (definition.category === "hex" && statAtTwelve(definition.healthPips) < 0) {
      return "hex";
    }
    if (POISONS.has(id)) {
      tint = "poison";
    } else if (id === "bleeding" && tint === null) {
      tint = "bleeding";
    }
  }
  return tint;
}

const TINT_CLASSES: Readonly<Record<HealthTint, string>> = {
  hex: "is-tint-hex",
  poison: "is-tint-poison",
  bleeding: "is-tint-bleeding",
};

/**
 * Put the tint's class on a health bar and take every other off, on every
 * render, so a status that leaves takes its tint with it. A corpse keeps its
 * corpse look: no tint.
 */
export function paintHealthTint(
  bar: { readonly classList: Pick<DOMTokenList, "toggle"> },
  player: Pick<PlayerSnapshot, "dead" | "statuses">,
): void {
  const tint = player.dead ? null : healthTint(player.statuses.map((status) => status.id));
  for (const [name, className] of Object.entries(TINT_CLASSES)) {
    bar.classList.toggle(className, name === tint);
  }
}
