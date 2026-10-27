import { describe, expect, it } from "vitest";

import { healthTint, paintHealthTint } from "./health-tint.js";

describe("healthTint (#807)", () => {
  it("tints for each degeneration alone", () => {
    expect(healthTint(["faintheartedness"])).toBe("hex");
    expect(healthTint(["poison"])).toBe("poison");
    expect(healthTint(["bleeding"])).toBe("bleeding");
    expect(healthTint([])).toBeNull();
  });

  it("takes the worst, never a blend: hex, then poison, then bleeding", () => {
    expect(healthTint(["bleeding", "poison", "faintheartedness"])).toBe("hex");
    expect(healthTint(["bleeding", "poison"])).toBe("poison");
    expect(healthTint(["poison", "bleeding"])).toBe("poison");
  });

  it("counts disease as poison", () => {
    expect(healthTint(["disease"])).toBe("poison");
    expect(healthTint(["bleeding", "disease"])).toBe("poison");
  });

  it("gives burning, and a hex that drains only energy, no tint", () => {
    expect(healthTint(["burning"])).toBeNull();
    expect(healthTint(["malaise"])).toBeNull();
  });

  it("ignores a status id it does not know", () => {
    expect(healthTint(["no-such-status"])).toBeNull();
    expect(healthTint(["no-such-status", "bleeding"])).toBe("bleeding");
  });
});

/** Just enough of an element for `paintHealthTint`: the classes it holds. */
function bar(): { classList: Pick<DOMTokenList, "toggle">; classes: Set<string> } {
  const classes = new Set<string>();
  const classList = {
    toggle(token: string, force?: boolean): boolean {
      const on = force ?? !classes.has(token);
      if (on) {
        classes.add(token);
      } else {
        classes.delete(token);
      }
      return on;
    },
  };
  return { classList, classes };
}

describe("paintHealthTint (#807)", () => {
  it("puts the tint's class on the bar, and takes it off when the status is gone", () => {
    const health = bar();
    paintHealthTint(health, { dead: false, statuses: ["bleeding"] });
    expect([...health.classes]).toEqual(["is-tint-bleeding"]);
    paintHealthTint(health, { dead: false, statuses: ["bleeding", "faintheartedness"] });
    expect([...health.classes]).toEqual(["is-tint-hex"]);
    paintHealthTint(health, { dead: false, statuses: [] });
    expect([...health.classes]).toEqual([]);
  });

  it("leaves a corpse untinted", () => {
    const health = bar();
    paintHealthTint(health, { dead: false, statuses: ["poison"] });
    paintHealthTint(health, { dead: true, statuses: ["poison"] });
    expect([...health.classes]).toEqual([]);
  });
});
