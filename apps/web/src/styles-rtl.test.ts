import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Right to left (#2655): `styles.css` names sides logically, so a page
 * with `dir="rtl"` mirrors. jsdom lays nothing out, so this reads the
 * sheet: a physical side is a place left unmirrored by mistake.
 */

const CSS = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "styles.css"),
  "utf8",
);

/**
 * The places that keep their physical side: the arena's widgets, fitted
 * around the HUD the same way in every language, and offscreen hosts.
 */
const PINNED_PLACE =
  /\.hud-skill-row|\.weapon-set|\.compass|\.party-dock|^\.hud-controls|^\.hud-jukebox|#viewport > \.chat|\.music-host|\.skill-drag-image|\.recharge-seconds/;

/** Each declaration in the sheet, with the selector of its rule. */
function declarations(): { selector: string; property: string; value: string }[] {
  const found: { selector: string; property: string; value: string }[] = [];
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const rule of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (rule[1] ?? "").trim();
    for (const line of (rule[2] ?? "").split(";")) {
      const match = /^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(line);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        found.push({ selector, property: match[1], value: match[2] });
      }
    }
  }
  return found;
}

describe("styles.css right to left (#2655)", () => {
  it("reads the sheet", () => {
    expect(declarations().length).toBeGreaterThan(1000);
  });

  it("has no physical margin, padding, border side or text alignment", () => {
    const physical = declarations().filter(
      ({ property, value }) =>
        /^(margin|padding|border)-(left|right)/.test(property) ||
        (property === "text-align" && (value === "left" || value === "right")),
    );
    expect(physical).toEqual([]);
  });

  it("places on a physical side only what is pinned, or centred", () => {
    const physical = declarations().filter(
      ({ selector, property, value }) =>
        (property === "left" || property === "right") &&
        value !== "50%" &&
        !PINNED_PLACE.test(selector),
    );
    expect(physical).toEqual([]);
  });
});
