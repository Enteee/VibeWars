import { describe, expect, it } from "vitest";

import { STATUS_DEFINITIONS, type StatusCategory } from "@vibewars/game-core";

import {
  BODY_RING_WIDTH,
  ENCHANT_RING_OFFSET,
  HEX_RING_DASHES,
  HEX_RING_OFFSET,
  INVULNERABLE_MIN_ALPHA,
  INVULNERABLE_PULSE_SECONDS,
  bodyFlags,
  bodyRings,
  invulnerableAlpha,
  invulnerableRing,
} from "./body-rings.js";

/** Some status of `category`, so the test does not pin which. */
function anyOf(category: StatusCategory): string {
  const found = Object.values(STATUS_DEFINITIONS).find(
    (definition) => definition.category === category,
  );
  if (found === undefined) {
    throw new Error(`no ${category} status`);
  }
  return found.id;
}

describe("bodyFlags (#1117)", () => {
  it("an enchantment, maintained or not, makes a body enchanted", () => {
    expect(bodyFlags(["armor-boost"])).toEqual({ enchanted: true, hexed: false });
    expect(bodyFlags(["mending"])).toEqual({ enchanted: true, hexed: false });
  });

  it("a hex makes it hexed, and both together make it both", () => {
    expect(bodyFlags(["backfire"])).toEqual({ enchanted: false, hexed: true });
    expect(bodyFlags(["backfire", "armor-boost"])).toEqual({ enchanted: true, hexed: true });
  });

  it("no other category, and no unknown id, rings a body", () => {
    const others = (
      ["condition", "stance", "preparation", "weapon-spell", "skill-effect"] as const
    ).map(anyOf);
    expect(bodyFlags([...others, "no-such-status"])).toEqual({ enchanted: false, hexed: false });
  });
});

describe("bodyRings (#1117)", () => {
  const r = 14;

  it("draws none for neither", () => {
    expect(bodyRings(r, { enchanted: false, hexed: false })).toEqual([]);
  });

  it("an enchantment is one solid ring at r + 2.5", () => {
    const [ring, ...rest] = bodyRings(r, { enchanted: true, hexed: false });
    expect(rest).toEqual([]);
    expect(ring?.kind).toBe("enchantment");
    expect(ring?.radius).toBe(r + ENCHANT_RING_OFFSET);
    expect(ring?.arcs).toEqual([{ from: 0, to: 2 * Math.PI }]);
  });

  it("a hex is eight dashes at r + 5, each π/8 long, the first centred on 12 o'clock", () => {
    const [ring, ...rest] = bodyRings(r, { enchanted: false, hexed: true });
    expect(rest).toEqual([]);
    expect(ring?.kind).toBe("hex");
    expect(ring?.radius).toBe(r + HEX_RING_OFFSET);
    const arcs = ring?.arcs ?? [];
    expect(arcs).toHaveLength(HEX_RING_DASHES);
    for (const arc of arcs) {
      expect(arc.to - arc.from).toBeCloseTo(Math.PI / 8);
    }
    const first = arcs[0];
    expect(((first?.from ?? 0) + (first?.to ?? 0)) / 2).toBeCloseTo(-Math.PI / 2);
  });

  it("both: the enchantment first, inside, the hex outside", () => {
    const rings = bodyRings(r, { enchanted: true, hexed: true });
    expect(rings.map((ring) => ring.kind)).toEqual(["enchantment", "hex"]);
  });

  it("every ring stays inside r + 6, clear of the status row and the target ring", () => {
    for (const ring of bodyRings(r, { enchanted: true, hexed: true })) {
      expect(ring.width).toBe(BODY_RING_WIDTH);
      expect(ring.radius + ring.width / 2).toBeLessThanOrEqual(r + 6);
    }
  });
});

describe("the invulnerable shimmer (#1233)", () => {
  it("is a solid ring where the hex ring goes", () => {
    const ring = invulnerableRing(14);
    expect(ring).toMatchObject({
      kind: "invulnerable",
      radius: 14 + HEX_RING_OFFSET,
      width: BODY_RING_WIDTH,
      arcs: [{ from: 0, to: 2 * Math.PI }],
    });
    expect(invulnerableRing(14)).toBe(ring);
  });

  it("pulses between its floor and 1, and holds at 1 under reduced motion", () => {
    expect(invulnerableAlpha(0, false)).toBe(1);
    expect(invulnerableAlpha(INVULNERABLE_PULSE_SECONDS / 2, false)).toBeCloseTo(
      INVULNERABLE_MIN_ALPHA,
    );
    expect(invulnerableAlpha(INVULNERABLE_PULSE_SECONDS / 2, true)).toBe(1);
  });
});
