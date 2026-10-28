import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { armedSweep, createPartyWindow, partyRows, type PartyWindow } from "./party-window.js";

/**
 * The party window (#1055): who it lists, in what order, and the rows it
 * paints. The unit tests run in Node, so the DOM here is a small fake.
 */

function player(sessionId: string, overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    sessionId,
    name: sessionId,
    x: 0,
    y: 0,
    facing: 0,
    targetSessionId: undefined,
    attackTargetSessionId: undefined,
    walking: false,
    health: 480,
    maxHealth: 480,
    energy: 20,
    maxEnergy: 50,
    overcast: 0,
    morale: 0,
    armor: 60,
    weaponId: undefined,
    offhandId: undefined,
    primaryProfession: undefined,
    secondaryProfession: undefined,
    team: 0,
    dead: false,
    castingSkillId: undefined,
    castRemaining: 0,
    castTotal: 0,
    swingElapsed: 0,
    swingTotal: 0,
    knockdownRemaining: 0,
    corpseExploited: false,
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    statuses: [],
    ...overrides,
  };
}

function match(
  players: readonly PlayerSnapshot[],
  selfSessionId = "me",
  elapsedSeconds = 0,
): MatchSnapshot {
  return {
    selfSessionId,
    players,
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
    groundEffects: [],
    traps: [],
    summary: undefined,
  };
}

const ME = player("me", { targetSessionId: "kaja", primaryProfession: "monk" });
const FOE = player("foe", { team: 1 });
const KAJA = player("kaja", { health: 120 });
const ODO = player("odo", { dead: true, health: 0 });
const BLEEDER = player("bleeder", {
  statuses: [{ id: "bleeding", endsAt: 10, durationSeconds: 10, casterId: "foe" }],
  healthPips: -3,
});
const WOLF = player("me/c1", {
  name: "Wolf",
  creature: { ownerId: "me", kind: "pet", look: "beast", mode: "fight", armedAttack: null },
});

/** WOLF, its next blow armed with Brutal Strike until 12 s on the match clock (#1167). */
const ARMED_WOLF = player("me/c1", {
  name: "Wolf",
  creature: {
    ownerId: "me",
    kind: "pet",
    look: "beast",
    mode: "fight",
    armedAttack: { skillId: "ranger.brutal-strike", endsAt: 12 },
  },
});

describe("partyRows (#1055)", () => {
  it("lists you first, then your team in seat order, and never a foe", () => {
    const rows = partyRows(match([KAJA, FOE, ME, ODO]));
    expect(rows.map((row) => row.id)).toEqual(["me", "kaja", "odo"]);
    expect(rows.map((row) => row.self)).toEqual([true, false, false]);
  });

  it("marks your target, the dead and the bleeding", () => {
    const [me, kaja, odo, bleeder] = partyRows(match([ME, KAJA, ODO, BLEEDER]));
    expect(kaja?.targeted).toBe(true);
    expect(me?.targeted).toBe(false);
    expect(odo).toMatchObject({ dead: true, healthPercent: undefined, healthPoints: undefined });
    expect(bleeder).toMatchObject({ tint: "bleeding", pips: -3 });
    expect(me?.tint).toBeNull();
  });

  it("labels health with the percentage and the points, as the target frame does for an ally", () => {
    const [, kaja] = partyRows(match([ME, KAJA]));
    expect(kaja).toMatchObject({ healthPercent: 25, healthPoints: "120 / 480" });
  });

  it("carries the professions as the target frame shows them", () => {
    const [me, kaja] = partyRows(match([ME, KAJA]));
    expect(me?.professions.map((icon) => icon.name)).toEqual(["Monk"]);
    expect(kaja?.professions).toEqual([]);
  });

  it("is empty when you are alone on your team, or spectating", () => {
    expect(partyRows(match([ME, FOE]))).toEqual([]);
    expect(partyRows(match([ME, KAJA], "spectator"))).toEqual([]);
  });

  it("never lists a minion, even your own", () => {
    const minion = player("minion", {
      creature: {
        ownerId: "me",
        kind: "minion",
        look: "bone-minion",
        mode: null,
        armedAttack: null,
      },
    });
    expect(partyRows(match([ME, minion]))).toEqual([]);
    expect(partyRows(match([ME, minion, KAJA])).map((row) => row.id)).toEqual(["me", "kaja"]);
  });

  it("lists your own pet under you, in its mode, but not a teammate's (#1110)", () => {
    const kajaWolf = player("kaja/c1", {
      creature: { ownerId: "kaja", kind: "pet", look: "beast", mode: "guard", armedAttack: null },
    });
    const rows = partyRows(match([KAJA, kajaWolf, ME, WOLF]));
    expect(rows.map((row) => row.id)).toEqual(["me", "me/c1", "kaja"]);
    expect(rows.map((row) => row.companionMode)).toEqual([undefined, "fight", undefined]);
    expect(partyRows(match([ME, WOLF])).map((row) => row.id)).toEqual(["me", "me/c1"]);
  });

  it("carries the pet attack your pet's next blow is armed with, by name (#1167)", () => {
    const rows = partyRows(match([ME, ARMED_WOLF]));
    expect(rows.map((row) => row.armedAttack)).toEqual([
      undefined,
      { skillId: "ranger.brutal-strike", name: "Brutal Strike" },
    ]);
    expect(partyRows(match([ME, WOLF]))[1]?.armedAttack).toBeUndefined();
  });
});

describe("armedSweep (#1167)", () => {
  it("runs from nothing when armed to whole when it lapses, and no further", () => {
    expect(armedSweep(12, 2)).toBe(0);
    expect(armedSweep(12, 7)).toBe(0.5);
    expect(armedSweep(12, 12)).toBe(1);
    expect(armedSweep(12, 13)).toBe(1);
    expect(armedSweep(12, 1)).toBe(0);
  });
});

/** Just enough of an event for the listeners. */
interface FakeEvent {
  preventDefault(): void;
}

/** Just enough of an element for the window, without jsdom. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  type = "";
  tabIndex = 0;
  hidden = false;
  src = "";
  alt = "";
  parent: FakeElement | undefined;
  readonly dataset: Record<string, string> = {};
  readonly style = {
    width: "",
    properties: new Map<string, string>(),
    setProperty(name: string, value: string): void {
      this.properties.set(name, value);
    },
    getPropertyValue(name: string): string {
      return this.properties.get(name) ?? "";
    },
  };
  readonly children: FakeElement[] = [];
  readonly classes = new Set<string>();
  readonly classList = {
    toggle: (name: string, on: boolean): void => {
      if (on) {
        this.classes.add(name);
      } else {
        this.classes.delete(name);
      }
    },
  };
  readonly listeners = new Map<string, (event: FakeEvent) => void>();

  readonly attributes = new Map<string, string>();

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: (event: FakeEvent) => void): void => {
    this.listeners.set(type, listener);
  };

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    this.children.push(child);
    child.parent = this;
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    for (const child of [...this.children]) {
      child.remove();
    }
    for (const child of children) {
      this.appendChild(child);
    }
  }

  remove(): void {
    if (this.parent !== undefined) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }
}

describe("createPartyWindow (#1055)", () => {
  let parent: FakeElement;
  let targeted: string[];
  let commanded: [string, string][];
  let party: PartyWindow;

  const panel = (): FakeElement => {
    const found = parent.children[0]?.children[0];
    if (found === undefined) {
      throw new Error("no panel");
    }
    return found;
  };
  const memberIds = (): (string | undefined)[] => panel().children.map((row) => row.dataset.member);

  beforeEach(() => {
    parent = new FakeElement();
    targeted = [];
    commanded = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    party = createPartyWindow(
      parent as unknown as HTMLElement,
      (id) => targeted.push(id),
      (id, mode) => commanded.push([id, mode]),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is hidden alone, and shows one row per member once you have a team", () => {
    party.update(match([ME, FOE]));
    expect(panel().hidden).toBe(true);
    party.update(match([ME, FOE, KAJA]));
    expect(panel().hidden).toBe(false);
    expect(memberIds()).toEqual(["me", "kaja"]);
  });

  it("targets a member when their row is clicked, yourself too", () => {
    party.update(match([ME, KAJA]));
    for (const row of panel().children) {
      row.listeners.get("click")?.({ preventDefault: () => undefined });
    }
    expect(targeted).toEqual(["me", "kaja"]);
  });

  it("never takes the keyboard from the arena: not tabbable, and a press keeps focus", () => {
    party.update(match([ME, KAJA]));
    for (const row of panel().children) {
      const preventDefault = vi.fn();
      row.listeners.get("mousedown")?.({ preventDefault });
      expect(preventDefault).toHaveBeenCalledOnce();
      expect(row.tabIndex).toBe(-1);
    }
  });

  it("reuses each row across updates, and drops the row of one who left", () => {
    party.update(match([ME, KAJA, ODO]));
    const [, kaja] = panel().children;
    party.update(match([ME, { ...KAJA, health: 60 }, ODO]));
    expect(panel().children[1]).toBe(kaja);
    party.update(match([ME, KAJA]));
    expect(memberIds()).toEqual(["me", "kaja"]);
    expect(panel().children[1]).toBe(kaja);
  });

  it("outlines your target's row, and shows a dead member's word, not a bar", () => {
    party.update(match([ME, KAJA, ODO]));
    const [, kaja, odo] = panel().children;
    expect(kaja?.classes.has("is-targeted")).toBe(true);
    expect(odo?.classes.has("is-dead")).toBe(true);
    const [, bar, dead] = odo?.children ?? [];
    expect(bar?.hidden).toBe(true);
    expect(dead?.hidden).toBe(false);
  });

  it("goes compact past 8 members", () => {
    const team = (size: number) => [
      ME,
      ...Array.from({ length: size - 1 }, (_, i) => player(`ally-${String(i)}`)),
    ];
    party.update(match(team(8)));
    expect(panel().classes.has("is-compact")).toBe(false);
    party.update(match(team(9)));
    expect(panel().classes.has("is-compact")).toBe(true);
    expect(panel().children).toHaveLength(9);
  });

  it("gives your pet a row under yours, its mode lit, its buttons ordering it (#1110)", () => {
    party.update(match([ME, WOLF]));
    expect(panel().hidden).toBe(false);
    const [, block] = panel().children;
    const [row, orders] = block?.children ?? [];
    expect(row?.dataset.member).toBe("me/c1");
    const buttons = orders?.children ?? [];
    expect(buttons.map((button) => button.textContent)).toEqual(["Guard", "Fight", "Heel"]);
    expect(buttons.map((button) => button.classes.has("is-lit"))).toEqual([false, true, false]);
    expect(buttons[1]?.attributes.get("aria-pressed")).toBe("true");
    buttons[2]?.listeners.get("click")?.({ preventDefault: () => undefined });
    expect(commanded).toEqual([["me/c1", "heel"]]);
    row?.listeners.get("click")?.({ preventDefault: () => undefined });
    expect(targeted).toEqual(["me/c1"]);
    party.update(
      match([
        ME,
        {
          ...WOLF,
          creature: { ownerId: "me", kind: "pet", look: "beast", mode: "heel", armedAttack: null },
        },
      ]),
    );
    expect(buttons.map((button) => button.classes.has("is-lit"))).toEqual([false, false, true]);
  });

  it("shows a dead pet's word, and its buttons still order it (#1110)", () => {
    party.update(match([ME, { ...WOLF, dead: true, health: 0 }]));
    const [, block] = panel().children;
    const [row, orders] = block?.children ?? [];
    const [, bar, dead] = row?.children ?? [];
    expect(bar?.hidden).toBe(true);
    expect(dead?.hidden).toBe(false);
    orders?.children[0]?.listeners.get("click")?.({ preventDefault: () => undefined });
    expect(commanded).toEqual([["me/c1", "guard"]]);
  });

  it("shows your pet's armed attack right of its bar, sweeping as it runs out, gone once used (#1167)", () => {
    const armed = (): FakeElement | undefined => {
      const [, block] = panel().children;
      return block?.children[0]?.children.find((child) => child.className === "party-armed");
    };
    party.update(match([ME, WOLF]));
    expect(armed()?.hidden).toBe(true);
    party.update(match([ME, ARMED_WOLF], "me", 4.5));
    expect(armed()?.hidden).toBe(false);
    expect(armed()?.title).toBe("Brutal Strike");
    expect(armed()?.children[0]?.src).toContain("ranger.brutal-strike");
    expect(armed()?.children[1]?.style.getPropertyValue("--armed")).toBe("0.25");
    party.update(match([ME, ARMED_WOLF], "me", 9.5));
    expect(armed()?.children[1]?.style.getPropertyValue("--armed")).toBe("0.75");
    party.update(match([ME, WOLF], "me", 10));
    expect(armed()?.hidden).toBe(true);
  });

  it("never gives a person's row an armed attack (#1167)", () => {
    party.update(match([ME, KAJA]));
    for (const row of panel().children) {
      expect(row.children.some((child) => child.className === "party-armed")).toBe(false);
    }
  });

  it("is gone once disposed", () => {
    party.update(match([ME, KAJA]));
    party.dispose();
    expect(parent.children).toEqual([]);
  });
});
