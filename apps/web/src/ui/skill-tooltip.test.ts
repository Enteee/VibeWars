import { describeSkill, getSkill, type SkillDescription } from "@vibewars/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSkillTooltip, renderSkillDescription } from "./skill-tooltip.js";

/**
 * Scaled numbers in skill text (#1932). The unit tests run in Node, so the
 * DOM here is a small fake; what the player sees is the e2e suite's.
 */

class FakeElement {
  className = "";
  readonly style: Record<string, string> = {};
  readonly children: (FakeElement | string)[] = [];
  readonly classList = { toggle: () => undefined };
  set textContent(text: string) {
    this.children.splice(0, this.children.length, text);
  }
  get textContent(): string {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.textContent))
      .join("");
  }
  append(...nodes: (FakeElement | string)[]): void {
    this.children.push(...nodes);
  }
  appendChild(node: FakeElement): void {
    this.children.push(node);
  }
  replaceChildren(): void {
    this.children.splice(0);
  }
  setAttribute(): void {
    // The fake keeps no attributes.
  }
  insertAdjacentHTML(): void {
    // Nor the icon's markup.
  }
  remove(): void {
    // Nor a parent to leave.
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 10, bottom: 10, width: 10, height: 10 };
  }
  /** Every element under this one with `className`, in document order. */
  all(className: string): FakeElement[] {
    return this.children.flatMap((child) =>
      typeof child === "string"
        ? []
        : [...(child.className === className ? [child] : []), ...child.all(className)],
    );
  }
}

function healingSignet(tactics: number): SkillDescription {
  const skill = getSkill("warrior.healing-signet");
  if (skill === undefined) {
    throw new Error("no Healing Signet");
  }
  return describeSkill(skill, new Map([["warrior.tactics", tactics]]));
}

describe("scaled numbers in skill text (#1932)", () => {
  let body: FakeElement;
  beforeEach(() => {
    body = new FakeElement();
    vi.stubGlobal("document", { createElement: () => new FakeElement(), body });
    vi.stubGlobal("window", { innerWidth: 800, innerHeight: 600 });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a scaled number as a span, and leaves a plain line without one", () => {
    const node = new FakeElement();
    const described = healingSignet(9);
    renderSkillDescription(node as unknown as HTMLElement, described);
    const [heal, armor] = node.all("tip-effect");
    expect(heal?.all("scaled-number").map((span) => span.textContent)).toEqual([
      String(described.effects[0]?.magnitude?.current),
    ]);
    expect(heal?.textContent).toBe(described.effects[0]?.text);
    expect(armor?.textContent).toBe(described.effects[1]?.text);
    expect(armor?.all("scaled-number")).toEqual([]);
  });

  it("redraws an open tooltip at the new number, and draws nothing while closed", () => {
    const tip = createSkillTooltip();
    const [node] = body.children;
    if (node === undefined || typeof node === "string") {
      throw new Error("no tooltip node");
    }
    const numbers = () => node.all("scaled-number").map((span) => span.textContent);

    tip.update(healingSignet(12));
    expect(node.children).toEqual([]);

    tip.show(new FakeElement() as unknown as HTMLElement, healingSignet(0));
    const atZero = numbers();
    tip.update(healingSignet(12));
    expect(numbers()).not.toEqual(atZero);
    expect(numbers()).toEqual([String(healingSignet(12).effects[0]?.magnitude?.current)]);
    expect(node.style.display).toBe("block");

    tip.hide();
    tip.update(healingSignet(0));
    expect(numbers()).toEqual([String(healingSignet(12).effects[0]?.magnitude?.current)]);
  });
});
