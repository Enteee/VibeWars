import { getSkill, type Skill } from "@vibewars/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSlotTooltips, SLOT_TOOLTIP_DELAY_MS, slotDescription } from "./slot-tooltip.js";

// The tooltip itself is DOM; these tests watch whether it is shown and hidden.
const tip = vi.hoisted(() => ({ shown: false }));
vi.mock("./skill-tooltip.js", () => ({
  createSkillTooltip: () => ({
    show: () => {
      tip.shown = true;
    },
    hide: () => {
      tip.shown = false;
    },
    dispose: () => {
      tip.shown = false;
    },
  }),
}));

function skill(id: string): Skill {
  const found = getSkill(id);
  if (found === undefined) {
    throw new Error(`no skill ${id}`);
  }
  return found;
}

function slot(id: string, energyCost: number, adrenalineCost = 0) {
  return {
    id,
    name: id,
    energyCost,
    adrenalineCost,
    activationSeconds: 1,
    rechargeSeconds: 7,
    copyEndsAt: null,
  };
}

describe("slotDescription (#719)", () => {
  it("prices the slot as the host sent it, the base in brackets when they differ (#637)", () => {
    const armor = skill("elementalist.armor-of-earth");
    expect(slotDescription(armor, slot(armor.id, 10), new Map(), 0).cost).toBe("10 energy");
    expect(slotDescription(armor, slot(armor.id, 0), new Map(), 0).cost).toBe("0 energy (10)");
  });

  it("leaves an adrenaline skill's cost as the description says it", () => {
    const backbreaker = skill("warrior.backbreaker");
    expect(slotDescription(backbreaker, slot(backbreaker.id, 0, 9), new Map(), 0).cost).toBe(
      "9 adrenaline",
    );
  });

  it("ends an echo's copy with how long it has left, in whole seconds rounded up (#1154)", () => {
    const fireball = skill("elementalist.fireball");
    const copy = { ...slot(fireball.id, 10), copyEndsAt: 32.5 };
    expect(slotDescription(fireball, copy, new Map(), 20.6).effects.at(-1)?.text).toBe(
      "Echoed: 12 s left",
    );
    expect(
      slotDescription(fireball, slot(fireball.id, 10), new Map(), 20.6).effects.map(
        (effect) => effect.text,
      ),
    ).not.toContain("Echoed: 12 s left");
  });
});

describe("createSlotTooltips (#469)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A slot button on the page, and a way to hover it. */
  function button() {
    const listeners = new Map<string, () => void>();
    const element = {
      isConnected: true,
      addEventListener: (type: string, listener: () => void) => {
        listeners.set(type, listener);
      },
    };
    return {
      element: element as unknown as HTMLElement,
      hover: () => listeners.get("mouseenter")?.(),
    };
  }

  /** Slot 0's tooltip up over `fireball`. */
  function shown() {
    vi.useFakeTimers();
    const tips = createSlotTooltips();
    const fireball = skill("elementalist.fireball");
    const slot0 = button();
    tips.bind(
      slot0.element,
      0,
      () => slot(fireball.id, 10),
      () => new Map(),
      () => 0,
    );
    slot0.hover();
    vi.advanceTimersByTime(SLOT_TOOLTIP_DELAY_MS);
    expect(tip.shown).toBe(true);
    return tips;
  }

  it("hides a shown tooltip when its slot is repainted under it", () => {
    shown().repainted([0]);
    expect(tip.shown).toBe(false);
  });

  it("keeps it when another slot is repainted", () => {
    const tips = shown();
    tips.repainted([1, 2]);
    expect(tip.shown).toBe(true);
    tips.dispose();
  });
});
