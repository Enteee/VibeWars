import { describe, expect, it } from "vitest";

import type { SkillSlot } from "@vibewars/game-session";

import {
  ECHO_SECONDS,
  echoSecondsLeft,
  echoStripFraction,
  echoStripHtml,
  paintEchoStrip,
} from "./echo-strip.js";

function slot(copyEndsAt: number | null): SkillSlot {
  return {
    id: "elementalist.fireball",
    name: "Fireball",
    energyCost: 10,
    adrenalineCost: 0,
    activationSeconds: 1,
    rechargeSeconds: 5,
    copyEndsAt,
  };
}

/** A slot button holding `strip`, or none. */
function button(strip: boolean) {
  const values = new Map<string, string>();
  const element = {
    style: {
      getPropertyValue: (name: string) => values.get(name) ?? "",
      setProperty: (name: string, value: string) => values.set(name, value),
    },
  };
  return {
    element: { querySelector: () => (strip ? element : null) } as unknown as HTMLElement,
    echo: () => values.get("--echo"),
  };
}

describe("the echo strip (#1154)", () => {
  it("lasts as long as an echo's copy: 20 s", () => {
    expect(ECHO_SECONDS).toBe(20);
  });

  it("is full with the copy fresh, half 10 s on, empty when due", () => {
    const strip = button(true);
    paintEchoStrip(strip.element, slot(30), 10, false);
    expect(strip.echo()).toBe("1");
    paintEchoStrip(strip.element, slot(30), 20, false);
    expect(strip.echo()).toBe("0.5");
    expect(echoStripFraction(30, 31, false)).toBe(0);
  });

  it("steps once a second under reduced motion", () => {
    expect(echoStripFraction(30, 20.3, true)).toBe(0.5);
    expect(echoStripFraction(30, 20.3, false)).toBeCloseTo(0.485, 5);
    expect(echoSecondsLeft(30, 20.3)).toBe(10);
  });

  it("is drawn for a copy, and not for a build slot", () => {
    expect(echoStripHtml(slot(30))).toContain("echo-strip");
    expect(echoStripHtml(slot(null))).toBe("");
    const none = button(false);
    paintEchoStrip(none.element, slot(null), 10, false);
    expect(none.echo()).toBeUndefined();
  });
});
