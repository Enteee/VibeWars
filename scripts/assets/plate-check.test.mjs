import { describe, expect, it } from "vitest";

import { inkOutsidePlate, statusInkOutside } from "./plate-check.mjs";
import { STATUS_ICONS } from "./status-icon-table.mjs";
import { PLATE_OVERFLOW } from "./status-plate-baseline.mjs";
import { PLATES } from "./status-plates.mjs";

describe("inkOutsidePlate", () => {
  it("passes a small circle on the condition plate", () => {
    expect(inkOutsidePlate(PLATES.condition, `<circle cx="12" cy="12" r="6" fill="#000"/>`)).toBe(
      0,
    );
  });

  it("fails a stroked circle that crosses the condition plate's edge", () => {
    const ring = `<circle cx="12" cy="12" r="11.500" fill="none" stroke="#000" stroke-width="2"/>`;
    expect(inkOutsidePlate(PLATES.condition, ring)).toBeGreaterThan(0);
  });

  it("fails a dot inside the hex plate's bounding box but outside the diamond", () => {
    expect(
      inkOutsidePlate(PLATES.hex, `<circle cx="3" cy="3" r="1.500" fill="#000"/>`),
    ).toBeGreaterThan(0);
  });
});

describe("status icons stay inside their plates", () => {
  it("crosses only where the baseline lists it, and lists nothing that no longer crosses", () => {
    const overflow = new Set(PLATE_OVERFLOW);
    const crossing = Object.entries(STATUS_ICONS).flatMap(([id, [category, glyph]]) => {
      const outside = statusInkOutside(category, glyph);
      return outside > 0
        ? [{ id, text: `${id} (${category}): ${String(outside)} px outside` }]
        : [];
    });
    const crossingIds = new Set(crossing.map((row) => row.id));
    expect(crossing.filter((row) => !overflow.has(row.id)).map((row) => row.text)).toEqual([]);
    expect(PLATE_OVERFLOW.filter((id) => !crossingIds.has(id))).toEqual([]);
  });
});
