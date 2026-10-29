import { describe, expect, it } from "vitest";

import {
  energyLabel,
  overcastShare,
  renderOvercastBand,
  type OvercastBand,
} from "./overcast-band.js";

/** A band that logs every write, as the render loop must not make one for nothing (#1352). */
function band(): { writes: string[]; element: OvercastBand } {
  const writes: string[] = [];
  const properties = new Map<string, string>();
  const element = new Proxy<OvercastBand>(
    {
      hidden: true,
      style: {
        getPropertyValue: (name: string): string => properties.get(name) ?? "",
        setProperty: (name: string, value: string): void => {
          writes.push(name);
          properties.set(name, value);
        },
      },
    },
    {
      set(target, property, value: unknown) {
        writes.push(String(property));
        return Reflect.set(target, property, value);
      },
    },
  );
  return { writes, element };
}

describe("the overcast band (#461)", () => {
  it("greys overcast / maxEnergy of the bar, and nothing without overcast", () => {
    const { element } = band();
    renderOvercastBand(element, 10, 40);
    expect(element.hidden).toBe(false);
    expect(element.style.getPropertyValue("width")).toBe("25%");
    renderOvercastBand(element, 0, 40);
    expect(element.hidden).toBe(true);
  });

  it("writes nothing when the overcast is unchanged, and only what changed (#1352)", () => {
    const { writes, element } = band();
    renderOvercastBand(element, 10, 40);
    writes.length = 0;
    renderOvercastBand(element, 10, 40);
    expect(writes).toEqual([]);
    renderOvercastBand(element, 20, 40);
    expect(writes).toEqual(["width"]);
  });

  it("covers the whole bar at most, past a ceiling below 0", () => {
    expect(overcastShare(60, 40)).toBe(1);
    expect(overcastShare(5, 0)).toBe(0);
  });

  it("counts energy to the ceiling overcast leaves", () => {
    expect(energyLabel(20, 30, 10)).toBe("20 / 20");
    expect(energyLabel(0, 30, 40)).toBe("0 / -10");
    expect(energyLabel(29.6, 50, 0)).toBe("30 / 50");
  });
});
