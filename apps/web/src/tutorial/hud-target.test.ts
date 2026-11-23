import { describe, expect, it } from "vitest";

import { hudTarget, type HudNode } from "./hud-target.js";

/** A node as the tests build it: shown or not, and where it sits. */
interface FakeNode extends HudNode<FakeNode> {
  getClientRects(): { readonly length: number };
}

/** A node that is `shown` or not, inside `dock` if given. */
function node(shown: boolean, dock?: FakeNode): FakeNode {
  return {
    closest: (selector) => (selector === ".party-dock:not(.is-open)" ? (dock ?? null) : null),
    querySelector: () => null,
    getClientRects: () => ({ length: shown ? 1 : 0 }),
  };
}

/** A closed party dock whose toggle is `shown` or not. */
function closedDock(toggle: FakeNode): FakeNode {
  return {
    closest: () => null,
    querySelector: (selector) => (selector === ".party-toggle" ? toggle : null),
    getClientRects: () => ({ length: 1 }),
  };
}

describe("hudTarget", () => {
  it("is the element itself while it shows", () => {
    const row = node(true, closedDock(node(true)));
    expect(hudTarget(row)).toBe(row);
  });

  it("is the Party toggle while a phone keeps the party window closed (#3782)", () => {
    const toggle = node(true);
    expect(hudTarget(node(false, closedDock(toggle)))).toBe(toggle);
  });

  it("is the element itself when the closed dock shows no toggle", () => {
    const row = node(false, closedDock(node(false)));
    expect(hudTarget(row)).toBe(row);
  });

  it("is the element itself when hidden outside a closed party dock", () => {
    const slot = node(false);
    expect(hudTarget(slot)).toBe(slot);
  });
});
