import { describe, expect, it } from "vitest";

import { C } from "./icon-kit.mjs";
import { inkOutsidePlate } from "./plate-check.mjs";
import { PLATE_CHECK_OFFENDERS } from "./plate-check-offenders.mjs";
import { STATUS_ICON_TABLES } from "./status-icon-table.mjs";
import { PLATES } from "./status-plates.mjs";

describe("inkOutsidePlate (#2404)", () => {
  it("passes a glyph well inside the condition circle", () => {
    expect(
      inkOutsidePlate(PLATES.condition, `<circle cx="12" cy="12" r="6" fill="${C.plate}"/>`),
    ).toBe(0);
  });

  it("fails a stroke that crosses the condition circle's edge", () => {
    const ring = `<circle cx="12" cy="12" r="11.5" fill="none" stroke="${C.plate}" stroke-width="2"/>`;
    expect(inkOutsidePlate(PLATES.condition, ring)).toBeGreaterThan(0);
  });

  it("fails a dot inside the hex plate's bounding box but outside its diamond", () => {
    expect(
      inkOutsidePlate(PLATES.hex, `<circle cx="3" cy="3" r="1" fill="${C.plate}"/>`),
    ).toBeGreaterThan(0);
  });
});

describe("PLATE_CHECK_OFFENDERS (#2404)", () => {
  it("files each id once, under the profession whose table has its row", () => {
    const misfiled = Object.entries(PLATE_CHECK_OFFENDERS).flatMap(([profession, ids]) =>
      ids.filter((id) => !(id in (STATUS_ICON_TABLES[profession] ?? {}))),
    );
    expect(misfiled).toEqual([]);
    const ids = Object.values(PLATE_CHECK_OFFENDERS).flat();
    expect(new Set(ids).size).toBe(ids.length);
  });
});
