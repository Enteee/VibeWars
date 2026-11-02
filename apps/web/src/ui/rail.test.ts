import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  HOST_PICKS_MODE,
  HOST_SETS_TEAM_SIZE,
  NO_TEAM_SIZE_HERE,
  RAIL,
  loadRail,
  loadTeamSize,
  onTeamSizeChange,
  modeRail,
  redrawModeRail,
  redrawsOnLobbyChange,
  railScreen,
  saveRail,
  saveTeamSize,
  setRailParty,
  teamSizeProblem,
  type RailEntry,
  type TeamSize,
} from "./rail.js";

/** Just enough DOM to render the rail; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  value = "";
  disabled = false;
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

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.append(...children);
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
      "label",
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
    setRailParty({
      code: "ACDEFG",
      mode: "gvg",
      isHost: false,
      open: false,
      members: [],
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 4,
    });
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
    setRailParty({
      code: "ACDEFG",
      mode: "gvg",
      isHost: true,
      open: false,
      members: [],
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 4,
    });
    const rail = modeRail("gvg", () => undefined) as unknown as FakeElement;
    expect(rail.children.some((child) => child.attributes.has("aria-disabled"))).toBe(false);
  });

  it("draws a mode's screen again on a lobby change, and a builder's only when another entry is due (#1790)", () => {
    expect(redrawsOnLobbyChange("gvg", "gvg")).toBe(true);
    expect(redrawsOnLobbyChange("team-arena", "gvg")).toBe(true);
    expect(redrawsOnLobbyChange("random-arena", "random-arena")).toBe(true);
    expect(redrawsOnLobbyChange("teams", "teams")).toBe(false);
    expect(redrawsOnLobbyChange("characters", "characters")).toBe(false);
    expect(redrawsOnLobbyChange("teams", "gvg")).toBe(true);
  });

  it("swaps a builder's rail alone for the party's locks (#1790)", () => {
    const old = new FakeElement("nav");
    let replacement: FakeElement | undefined;
    const root = {
      querySelector: (selector: string) => (selector === ".mode-rail" ? old : null),
    };
    Object.assign(old, {
      contains: () => false,
      replaceWith: (next: FakeElement) => {
        replacement = next;
      },
    });
    setRailParty({
      code: "ACDEFG",
      mode: "gvg",
      isHost: false,
      open: false,
      members: [],
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 4,
    });
    redrawModeRail(root as unknown as HTMLElement, "teams", () => undefined);
    const locked = replacement?.children.filter((child) => child.attributes.has("aria-disabled"));
    expect(locked?.map((child) => child.attributes.get("data-entry"))).toEqual([
      "random-arena",
      "team-arena",
      "heroes-ascent",
      "hosted-game",
    ]);
  });

  it("shows no party strip while the player is alone, and the strip once someone joins (#1782)", () => {
    const member = (name: string, isHost: boolean) => ({
      name,
      isHost,
      self: isHost,
      away: false,
    });
    const party = {
      code: "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_aBcDE", // pragma: allowlist secret
      mode: "gvg",
      isHost: true,
      open: true,
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 4,
    } as const;
    const strip = (): FakeElement | undefined => {
      const root = new FakeElement("div");
      const body = railScreen(root as unknown as HTMLElement, "gvg", "", () => undefined);
      return (body as unknown as FakeElement).children.find(
        (child) => child.className === "party-strip",
      );
    };
    setRailParty({ ...party, members: [member("me", true)] });
    expect(strip()).toBeUndefined();
    // Queued alone, the strip still says so (#1766).
    setRailParty({ ...party, members: [member("me", true)], queuedMs: 5_000 });
    expect(strip()).toBeDefined();
    setRailParty({ ...party, members: [member("me", true), member("Friend", false)] });
    expect(strip()?.children[0]?.children.map((row) => row.children[0]?.textContent)).toEqual([
      "me",
      "Friend",
    ]);
  });

  it("opens on Random Arena first, and for anything else stored", () => {
    expect(loadRail()).toBe("random-arena");
    saveRail("hosted-game");
    expect(loadRail()).toBe("hosted-game");
    stored.set(`${STORAGE_NAMESPACE}.rail`, "team");
    expect(loadRail()).toBe("random-arena");
  });

  /** The team size dropdown of `entry`'s rail. */
  const sizeSelect = (entry: RailEntry): FakeElement => {
    const rail = modeRail(entry, () => undefined) as unknown as FakeElement;
    const select = rail.children
      .find((child) => child.className === "mode-rail-size")
      ?.children.find((child) => child.tagName === "select");
    if (select === undefined) {
      throw new Error("no team size dropdown");
    }
    return select;
  };

  it("puts the team size dropdown after the modes, above the divider (#2022)", () => {
    const rail = modeRail("random-arena", () => undefined) as unknown as FakeElement;
    const tags = rail.children.map((child) => child.className);
    expect(tags.indexOf("mode-rail-size")).toBe(5);
    expect(tags.indexOf("mode-rail-divider")).toBe(6);
  });

  it("offers every size, disabling those the screen does not play, with why (#2022)", () => {
    const options = (entry: RailEntry): string[] =>
      sizeSelect(entry).children.map(
        (option) => `${option.textContent}${option.disabled ? " (off)" : ""}`,
      );
    expect(options("random-arena")).toEqual([
      "1v1",
      "2v2",
      "4v4",
      "8v8 — not in Random Arena (off)",
    ]);
    expect(options("hosted-game")).toEqual(["1v1", "2v2", "4v4", "8v8"]);
    expect(options("gvg")).toEqual([
      "1v1 — not in GvG (off)",
      "2v2 — not in GvG (off)",
      "4v4 — not in GvG (off)",
      "8v8",
    ]);
    expect(teamSizeProblem("heroes-ascent", 4)).toBe("4v4 is not in Heroes' Ascent");
    expect(teamSizeProblem("teams", 8)).toBeUndefined();
  });

  it("keeps an unplayable size selected rather than changing it (#2022)", () => {
    stored.set(`${STORAGE_NAMESPACE}.teamSize`, "8");
    expect(sizeSelect("random-arena").value).toBe("8");
  });

  it("disables the dropdown on Character Builder, with why (#2022)", () => {
    const select = sizeSelect("characters");
    expect(select.disabled).toBe(true);
    const rail = modeRail("characters", () => undefined) as unknown as FakeElement;
    expect(rail.children.find((child) => child.className === "mode-rail-size")?.title).toBe(
      NO_TEAM_SIZE_HERE,
    );
    expect(sizeSelect("teams").disabled).toBe(false);
  });

  it("locks a guest's dropdown: the host sets the team size (#2022)", () => {
    setRailParty({
      code: "ACDEFG",
      mode: "hosted-game",
      isHost: false,
      open: false,
      members: [],
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 4,
    });
    const rail = modeRail("hosted-game", () => undefined) as unknown as FakeElement;
    const field = rail.children.find((child) => child.className === "mode-rail-size");
    expect(field?.title).toBe(HOST_SETS_TEAM_SIZE);
    expect(field?.children.find((child) => child.tagName === "select")?.disabled).toBe(true);
  });

  it("shows a Hosted Game lobby's team size, the host's pick, not your own (#2104)", () => {
    saveTeamSize(1);
    const party = {
      code: "ACDEFG",
      mode: "hosted-game",
      isHost: false,
      open: false,
      members: [],
      queuedMs: null,
      teams: undefined,
      ascentRound: null,
      teamSize: 2,
    } as const;
    setRailParty(party);
    expect(sizeSelect("hosted-game").value).toBe("2");
    // Elsewhere, and in a lobby of another mode, it is your own.
    expect(sizeSelect("teams").value).toBe("1");
    setRailParty({ ...party, mode: "random-arena" });
    expect(sizeSelect("hosted-game").value).toBe("1");
  });

  it("stores the size picked, tells the shown screen, and reads 4v4 for anything else (#2022)", () => {
    expect(loadTeamSize()).toBe(4);
    const heard: TeamSize[] = [];
    railScreen(
      new FakeElement("div") as unknown as HTMLElement,
      "random-arena",
      "",
      () => undefined,
    );
    onTeamSizeChange((size) => heard.push(size));
    const select = sizeSelect("random-arena");
    select.value = "2";
    select.listeners.get("change")?.();
    expect(stored.get(`${STORAGE_NAMESPACE}.teamSize`)).toBe("2");
    expect(loadTeamSize()).toBe(2);
    expect(heard).toEqual([2]);

    // Another screen drawn: the last one hears nothing more.
    railScreen(new FakeElement("div") as unknown as HTMLElement, "teams", "", () => undefined);
    select.value = "1";
    select.listeners.get("change")?.();
    expect(heard).toEqual([2]);

    stored.set(`${STORAGE_NAMESPACE}.teamSize`, "3");
    expect(loadTeamSize()).toBe(4);
    stored.set(`${STORAGE_NAMESPACE}.teamSize`, "eight");
    expect(loadTeamSize()).toBe(4);
  });
});
