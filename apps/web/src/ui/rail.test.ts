import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  HOST_PICKS_MODE,
  RAIL,
  loadRail,
  modeRail,
  saveRail,
  setRailParty,
  type RailEntry,
} from "./rail.js";

/** Just enough DOM to render the rail; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the mode rail (#1525)", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
    });
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeElement(tag) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setRailParty(undefined);
  });

  it("has the five modes, then Character Builder and Team Builder", () => {
    expect(RAIL.map(({ label }) => label)).toEqual([
      "Random Arena",
      "Team Arena",
      "Heroes' Ascent",
      "GvG",
      "Hosted Game",
      "Character Builder",
      "Team Builder",
    ]);
  });

  it("presses the shown entry alone, with a divider above the builders", () => {
    const rail = modeRail("gvg", () => undefined) as unknown as FakeElement;
    expect(rail.children.map((child) => child.tagName)).toEqual([
      ...Array<string>(5).fill("button"),
      "hr",
      "button",
      "button",
    ]);
    const entries = rail.children.filter((child) => child.tagName === "button");
    expect(entries.map((entry) => entry.attributes.get("aria-label"))).toEqual(
      RAIL.map(({ label }) => label),
    );
    expect(entries.map((entry) => entry.attributes.get("aria-pressed"))).toEqual(
      RAIL.map(({ entry }) => String(entry === "gvg")),
    );
  });

  it("stores an entry pressed and switches to it; the shown one does nothing", () => {
    const switched: RailEntry[] = [];
    const rail = modeRail("random-arena", (entry) =>
      switched.push(entry),
    ) as unknown as FakeElement;
    const press = (entry: RailEntry): void => {
      rail.children.find((child) => child.attributes.get("data-entry") === entry)?.click();
    };
    press("random-arena");
    expect(switched).toEqual([]);
    press("teams");
    expect(switched).toEqual(["teams"]);
    expect(stored.get(`${STORAGE_NAMESPACE}.rail`)).toBe("teams");
    expect(loadRail()).toBe("teams");
  });

  it("locks a guest's modes but its host's, stores none of them, and leaves the builders open (#1526)", () => {
    setRailParty({ code: "ACDEFG", mode: "gvg", isHost: false, open: false, members: [] });
    saveRail("hosted-game");
    const switched: RailEntry[] = [];
    const rail = modeRail("teams", (entry) => switched.push(entry)) as unknown as FakeElement;
    const entry = (name: RailEntry): FakeElement | undefined =>
      rail.children.find((child) => child.attributes.get("data-entry") === name);
    expect(
      RAIL.map((item) => entry(item.entry)?.attributes.get("aria-disabled") ?? "false"),
    ).toEqual(["true", "true", "true", "false", "true", "false", "false"]);
    expect(entry("team-arena")?.title).toBe(HOST_PICKS_MODE);
    entry("team-arena")?.click();
    entry("gvg")?.click();
    entry("characters")?.click();
    expect(switched).toEqual(["gvg", "characters"]);
    expect(loadRail()).toBe("characters");
  });

  it("leaves a host's every mode open", () => {
    setRailParty({ code: "ACDEFG", mode: "gvg", isHost: true, open: false, members: [] });
    const rail = modeRail("gvg", () => undefined) as unknown as FakeElement;
    expect(rail.children.some((child) => child.attributes.has("aria-disabled"))).toBe(false);
  });

  it("opens on Random Arena first, and for anything else stored", () => {
    expect(loadRail()).toBe("random-arena");
    saveRail("hosted-game");
    expect(loadRail()).toBe("hosted-game");
    stored.set(`${STORAGE_NAMESPACE}.rail`, "team");
    expect(loadRail()).toBe("random-arena");
  });
});
