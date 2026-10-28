import type { MatchSnapshot, PlayerSnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPartyWindow, partyRows, type PartyWindow } from "./party-window.js";

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
    healthPips: 0,
    energyPips: 0,
    creature: undefined,
    statuses: [],
    ...overrides,
  };
}

function match(players: readonly PlayerSnapshot[], selfSessionId = "me"): MatchSnapshot {
  return {
    selfSessionId,
    players,
    scoreTeam0: 0,
    scoreTeam1: 0,
    elapsedSeconds: 0,
    phase: "active",
    winningTeam: undefined,
    endReason: undefined,
    projectiles: [],
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
    expect(odo).toMatchObject({ dead: true, healthPercent: undefined, healthLabel: "dead" });
    expect(bleeder).toMatchObject({ tint: "bleeding", pips: -3 });
    expect(me?.tint).toBeNull();
  });

  it("labels health as the target frame does for an ally", () => {
    const [, kaja] = partyRows(match([ME, KAJA]));
    expect(kaja).toMatchObject({ healthPercent: 25, healthLabel: "25% · 120 / 480" });
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

  it("never lists a creature, even your own", () => {
    const minion = player("minion", { creature: { ownerId: "me", kind: "minion" } });
    expect(partyRows(match([ME, minion]))).toEqual([]);
    expect(partyRows(match([ME, minion, KAJA])).map((row) => row.id)).toEqual(["me", "kaja"]);
  });
});

/** Just enough of an element for the window, without jsdom. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  type = "";
  hidden = false;
  src = "";
  alt = "";
  parent: FakeElement | undefined;
  readonly dataset: Record<string, string> = {};
  readonly style = { width: "" };
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
  readonly listeners = new Map<string, () => void>();

  readonly setAttribute = (): void => undefined;

  readonly addEventListener = (type: string, listener: () => void): void => {
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
  let party: PartyWindow;

  const panel = (): FakeElement => {
    const found = parent.children[0];
    if (found === undefined) {
      throw new Error("no panel");
    }
    return found;
  };
  const memberIds = (): (string | undefined)[] => panel().children.map((row) => row.dataset.member);

  beforeEach(() => {
    parent = new FakeElement();
    targeted = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
    party = createPartyWindow(parent as unknown as HTMLElement, (id) => targeted.push(id));
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
      row.listeners.get("click")?.();
    }
    expect(targeted).toEqual(["me", "kaja"]);
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

  it("is gone once disposed", () => {
    party.update(match([ME, KAJA]));
    party.dispose();
    expect(parent.children).toEqual([]);
  });
});
