import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_NAMESPACE } from "../storage/namespace.js";
import {
  HOST_PICKS_MODE,
  HOST_SETS_TEAM_SIZE,
  LEAVE_QUEUE_FOR_TEAM_SIZE,
  NO_TEAM_SIZE_HERE,
  RAIL,
  defaultTeamSize,
  loadRail,
  loadTeamBuildSize,
  loadTeamSize,
  onTeamSizeChange,
  modeRail,
  redrawModeRail,
  redrawsOnLobbyChange,
  railScreen,
  saveRail,
  saveTeamSize,
  setRailParty,
  type RailEntry,
  type TeamSize,
} from "./rail.js";

/** Just enough DOM to render the rail; the unit tests run in Node. */
/** A key event, as far as the stepper reads one. */
interface FakeKey {
  readonly key: string;
  readonly preventDefault: () => void;
}

class FakeElement {
  className = "";
  textContent = "";
  title = "";
  value = "";
  disabled = false;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (event: FakeKey) => void>();
  focused = false;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  focus(): void {
    this.focused = true;
  }

  /** `key` pressed while this has the focus. */
  press(key: string): void {
    this.listeners.get("keydown")?.({ key, preventDefault: () => undefined });
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: (event: FakeKey) => void): void => {
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
    this.listeners.get("click")?.({ key: "", preventDefault: () => undefined });
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

  it("has the five modes, then Character Builder, Team Builder and Matches (#2532)", () => {
    expect(RAIL.map(({ label }) => label)).toEqual([
      "Random Arena",
      "Team Arena",
      "Heroes' Ascent",
      "GvG",
      "Hosted Game",
      "Character Builder",
      "Team Builder",
      "Matches",
    ]);
  });

  it("presses the shown entry alone, with a divider above the builders", () => {
    const rail = modeRail("gvg", () => undefined) as unknown as FakeElement;
    expect(rail.children.map((child) => child.tagName)).toEqual([
      ...Array<string>(5).fill("button"),
      "div",
      "hr",
      "button",
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
      teamSize: 4,
    });
    saveRail("hosted-game");
    const switched: RailEntry[] = [];
    const rail = modeRail("teams", (entry) => switched.push(entry)) as unknown as FakeElement;
    const entry = (name: RailEntry): FakeElement | undefined =>
      rail.children.find((child) => child.attributes.get("data-entry") === name);
    expect(
      RAIL.map((item) => entry(item.entry)?.attributes.get("aria-disabled") ?? "false"),
    ).toEqual(["true", "true", "true", "false", "true", "false", "false", "false"]);
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

  it("lists nobody on a mode screen, and no queue line: the top bar's icon has it (#2385, #2743)", () => {
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
      queuedMs: 5_000,
      teamSize: 4,
    } as const;
    const parts = (): string[] => {
      const root = new FakeElement("div");
      const body = railScreen(root as unknown as HTMLElement, "gvg", () => undefined);
      return (body as unknown as FakeElement).children.map((child) => child.className);
    };
    const members = [member("me", true), member("Friend", false)];
    // Who is in it is the top bar's Lobby window's, queued or not.
    setRailParty({ ...party, members, queuedMs: null });
    expect(parts()).toEqual(["rail-title"]);
    setRailParty({ ...party, members });
    expect(parts()).toEqual(["rail-title"]);
  });

  it("opens on Random Arena first, and for anything else stored", () => {
    expect(loadRail()).toBe("random-arena");
    saveRail("hosted-game");
    expect(loadRail()).toBe("hosted-game");
    stored.set(`${STORAGE_NAMESPACE}.rail`, "team");
    expect(loadRail()).toBe("random-arena");
  });

  /** The team size field of `entry`'s rail. */
  const sizeField = (entry: RailEntry): FakeElement => {
    const rail = modeRail(entry, () => undefined) as unknown as FakeElement;
    const field = rail.children.find((child) => child.className === "mode-rail-size");
    if (field === undefined) {
      throw new Error("no team size field");
    }
    return field;
  };

  /** The team size stepper of `entry`'s rail: ‹, the size, ›. */
  const stepper = (
    entry: RailEntry,
  ): { smaller: FakeElement; size: FakeElement; larger: FakeElement } => {
    const [smaller, size, larger] =
      sizeField(entry).children.find((child) => child.className === "mode-rail-stepper")
        ?.children ?? [];
    if (smaller === undefined || size === undefined || larger === undefined) {
      throw new Error("no team size stepper");
    }
    return { smaller, size, larger };
  };

  /** What `entry`'s stepper shows, and which arrows are off. */
  const shown = (entry: RailEntry): string => {
    const { smaller, size, larger } = stepper(entry);
    return `${smaller.disabled ? "-" : "‹"} ${size.textContent} ${larger.disabled ? "-" : "›"}`;
  };

  it("puts the team size stepper after the modes, above the divider (#2022, #2141)", () => {
    const rail = modeRail("random-arena", () => undefined) as unknown as FakeElement;
    const tags = rail.children.map((child) => child.className);
    expect(tags.indexOf("mode-rail-size")).toBe(5);
    expect(tags.indexOf("mode-rail-divider")).toBe(6);
    const { smaller, size, larger } = stepper("random-arena");
    expect(smaller.attributes.get("aria-label")).toBe("Smaller team");
    expect(larger.attributes.get("aria-label")).toBe("Larger team");
    expect(size.attributes.get("aria-live")).toBe("polite");
  });

  it("opens every screen at a size it plays: 4v4, else the closest to it (#2141)", () => {
    expect(shown("random-arena")).toBe("‹ 4v4 -");
    expect(shown("team-arena")).toBe("‹ 4v4 ›");
    expect(shown("hosted-game")).toBe("‹ 4v4 ›");
    expect(shown("gvg")).toBe("- 8v8 -");
    expect(shown("heroes-ascent")).toBe("- 8v8 -");
    expect(defaultTeamSize("gvg")).toBe(8);
    expect(defaultTeamSize("teams")).toBe(4);
  });

  it("steps Team Builder through 2v2, 4v4 and 8v8 only, stopping at the ends (#2141)", () => {
    const { smaller, size, larger } = stepper("teams");
    smaller.click();
    expect(size.textContent).toBe("2v2");
    expect([smaller.disabled, larger.disabled]).toEqual([true, false]);
    // A disabled end steps nowhere, and never wraps.
    smaller.click();
    expect(size.textContent).toBe("2v2");
    larger.click();
    larger.click();
    expect(size.textContent).toBe("8v8");
    expect([smaller.disabled, larger.disabled]).toEqual([false, true]);
    expect(loadTeamSize("teams")).toBe(8);
    expect(loadTeamBuildSize()).toBe(8);
  });

  it("steps with Left and Right on a focused arrow (#2141)", () => {
    const { smaller, size, larger } = stepper("hosted-game");
    smaller.press("ArrowLeft");
    expect(size.textContent).toBe("2v2");
    smaller.press("ArrowRight");
    larger.press("ArrowRight");
    expect(size.textContent).toBe("8v8");
    larger.press("Enter");
    expect(size.textContent).toBe("8v8");
    // The arrow that reached its end hands the keys to the other one.
    expect(smaller.focused).toBe(true);
  });

  it("remembers each screen's own pick (#2141)", () => {
    stepper("random-arena").smaller.click();
    expect(shown("gvg")).toBe("- 8v8 -");
    expect(shown("random-arena")).toBe("‹ 2v2 ›");
    expect(shown("team-arena")).toBe("‹ 4v4 ›");
    expect(JSON.parse(stored.get(`${STORAGE_NAMESPACE}.teamSizeByEntry`) ?? "")).toEqual({
      "random-arena": 2,
    });
    saveTeamSize("team-arena", 8);
    expect(loadTeamSize("random-arena")).toBe(2);
    expect(loadTeamSize("team-arena")).toBe(8);
  });

  it("reads a screen's default for anything stored it does not play, or cannot read (#2141)", () => {
    stored.set(
      `${STORAGE_NAMESPACE}.teamSizeByEntry`,
      JSON.stringify({ "random-arena": 8, teams: 1, gvg: "8", "team-arena": 2 }),
    );
    expect(loadTeamSize("random-arena")).toBe(4);
    expect(loadTeamSize("teams")).toBe(4);
    expect(loadTeamSize("gvg")).toBe(8);
    expect(loadTeamSize("team-arena")).toBe(2);
    for (const bad of ["{", "[2]", "4", "null"]) {
      stored.set(`${STORAGE_NAMESPACE}.teamSizeByEntry`, bad);
      expect(loadTeamSize("team-arena")).toBe(4);
    }
  });

  it("shows no size on Character Builder, both arrows off, with why (#2022)", () => {
    expect(shown("characters")).toBe("- — -");
    expect(sizeField("characters").title).toBe(NO_TEAM_SIZE_HERE);
    expect(shown("teams")).toBe("‹ 4v4 ›");
  });

  it("locks a guest's stepper at the host's size (#2022)", () => {
    setRailParty({
      code: "ACDEFG",
      mode: "hosted-game",
      isHost: false,
      open: false,
      members: [],
      queuedMs: null,
      teamSize: 2,
    });
    expect(sizeField("hosted-game").title).toBe(HOST_SETS_TEAM_SIZE);
    expect(shown("hosted-game")).toBe("- 2v2 -");
  });

  it("locks a queued leader's stepper: the queue is for the size it has (#2107)", () => {
    const party = {
      code: "ACDEFG",
      mode: "team-arena",
      isHost: true,
      open: false,
      members: [],
      queuedMs: null,
      teamSize: 2,
    } as const;
    setRailParty(party);
    expect(shown("team-arena")).toBe("- 2v2 ›");

    setRailParty({ ...party, queuedMs: 5_000 });
    expect(sizeField("team-arena").title).toBe(LEAVE_QUEUE_FOR_TEAM_SIZE);
    expect(shown("team-arena")).toBe("- 2v2 -");
    // A builder's size is its own filter, queued or not.
    expect(shown("teams")).toBe("‹ 4v4 ›");
  });

  it("shows a Hosted Game lobby's team size, the host's pick, not your own (#2104)", () => {
    saveTeamSize("hosted-game", 1);
    const party = {
      code: "ACDEFG",
      mode: "hosted-game",
      isHost: true,
      open: false,
      members: [],
      queuedMs: null,
      teamSize: 2,
    } as const;
    setRailParty(party);
    expect(shown("hosted-game")).toBe("‹ 2v2 ›");
    // In a lobby of another mode, it is your own.
    setRailParty({ ...party, mode: "random-arena" });
    expect(shown("hosted-game")).toBe("- 1v1 ›");
  });

  it("tells the shown screen of a step, not of opening it (#2022)", () => {
    const heard: TeamSize[] = [];
    railScreen(new FakeElement("div") as unknown as HTMLElement, "random-arena", () => undefined);
    onTeamSizeChange((size) => heard.push(size));
    const { smaller } = stepper("random-arena");
    expect(heard).toEqual([]);
    smaller.click();
    expect(heard).toEqual([2]);

    // Another screen drawn: the last one hears nothing more.
    railScreen(new FakeElement("div") as unknown as HTMLElement, "teams", () => undefined);
    smaller.click();
    expect(heard).toEqual([2]);
  });
});
