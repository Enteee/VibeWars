import { STARTER_BUILDS } from "@vibewars/game-core";
import { recordTemplate, type MatchRecord, type MatchRecordTeam } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { arenaIds } from "../net/maps.js";
import type { MatchRecordWatchHandlers } from "../net/transport/match-records.js";
import {
  BUILD_UNREADABLE,
  HOST_REPORTED,
  MATCHES_KEPT,
  MATCHES_OFFLINE,
  NO_MATCHES,
  TEAM_UNREADABLE,
  relativeTime,
  renderMatchesScreen,
} from "./matches-screen.js";

const NOW = 1_800_000_000_000;

const fail = (): never => {
  throw new Error("no such starter build");
};

const played = (index: number) => recordTemplate(STARTER_BUILDS.at(index) ?? fail());

const RECORD: MatchRecord = {
  v: 1,
  mode: "random-arena",
  map: arenaIds()[0] ?? "",
  endedAt: NOW / 1000 - 120,
  durationSeconds: 305,
  winningTeam: 0,
  endReason: "annihilation",
  teams: [
    { players: [{ name: "Ann", guildTag: "VIBE", bot: false, template: played(0) }] },
    { players: [{ name: "Elementalist Bot", guildTag: null, bot: true, template: played(1) }] },
  ],
};

/** A 2v2: each team can be a Team Build (#2585). */
const PAIRS: MatchRecord = {
  ...RECORD,
  mode: "team-arena",
  teams: [
    {
      players: [
        { name: "Ann", guildTag: "VIBE", bot: false, template: played(0) },
        { name: "Bob", guildTag: null, bot: false, template: played(1) },
      ],
    },
    {
      players: [
        { name: "Bot A", guildTag: null, bot: true, template: played(2) },
        { name: "Bot B", guildTag: null, bot: true, template: played(3) },
      ],
    },
  ],
};

/** Just enough DOM to render the Matches page; the unit tests run in Node. */
class FakeElement {
  className = "";
  #text = "";
  title = "";
  src = "";
  alt = "";
  hidden = false;
  disabled = false;
  type = "";
  readonly children: FakeElement[] = [];
  parent: FakeElement | undefined;
  readonly attributes = new Map<string, string>();
  readonly dataset: Record<string, string> = {};
  readonly getContext = (): null => null;
  readonly listeners = new Map<string, () => void>();
  readonly classList = { add: () => undefined, toggle: () => undefined };
  readonly style = { setProperty: () => undefined };

  get textContent(): string {
    return this.#text + this.children.map((child) => child.textContent).join("");
  }

  set textContent(text: string) {
    this.#text = text;
    this.children.splice(0);
  }

  readonly setAttribute = (name: string, value: string): void => {
    this.attributes.set(name, value);
  };

  readonly addEventListener = (type: string, listener: () => void): void => {
    this.listeners.set(type, listener);
  };

  appendChild(child: FakeElement): FakeElement {
    child.remove();
    this.children.push(child);
    child.parent = this;
    return child;
  }

  insertBefore(child: FakeElement, before: FakeElement | null): FakeElement {
    child.remove();
    const at = before === null ? -1 : this.children.indexOf(before);
    this.children.splice(at === -1 ? this.children.length : at, 0, child);
    child.parent = this;
    return child;
  }

  remove(): void {
    const siblings = this.parent?.children ?? [];
    const at = siblings.indexOf(this);
    if (at !== -1) {
      siblings.splice(at, 1);
    }
    this.parent = undefined;
  }

  replaceWith(next: FakeElement): void {
    const siblings = this.parent?.children ?? [];
    siblings.splice(siblings.indexOf(this), 1, next);
    next.parent = this.parent;
  }

  append(...children: (FakeElement | string)[]): void {
    for (const child of children) {
      if (typeof child === "string") {
        const text = new FakeElement();
        text.textContent = child;
        this.appendChild(text);
      } else {
        this.appendChild(child);
      }
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0, this.children.length, ...children);
    for (const child of children) {
      child.parent = this;
    }
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.className.split(" ").includes(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** The one element under this one with class `name`. */
  one(name: string): FakeElement {
    const [found] = this.all(name);
    if (found === undefined) {
      throw new Error(`no .${name}`);
    }
    return found;
  }

  focus(): void {
    // Nothing to show it on.
  }

  /** As a browser does, a disabled button hears no click. */
  click(): void {
    if (this.disabled) {
      return;
    }
    this.listeners.get("click")?.();
  }
}

describe("the Matches page (#2532)", () => {
  let on: MatchRecordWatchHandlers | undefined;
  let closed: number;
  let cloned: MatchRecordTeam[];

  const render = (): { root: FakeElement; close: () => void } => {
    const root = new FakeElement();
    const screen = renderMatchesScreen(root as unknown as HTMLElement, {
      onSwitch: () => undefined,
      watch: (handlers) => {
        on = handlers;
        return {
          close: () => {
            closed += 1;
          },
        };
      },
      now: () => NOW,
      onCloneTeam: (team) => {
        cloned.push(team);
      },
    });
    return { root, close: () => screen.close() };
  };

  const hear = (id: string, record: MatchRecord = RECORD): void => {
    on?.record({ id, record });
  };

  beforeEach(() => {
    on = undefined;
    closed = 0;
    cloned = [];
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("window", { addEventListener: () => undefined });
    vi.stubGlobal("document", {
      addEventListener: () => undefined,
      createElement: () => new FakeElement(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says no match has been played yet, and that the relays are out of reach", () => {
    const { root } = render();
    const note = root.one("matches-note");
    expect(note.textContent).toBe(NO_MATCHES);
    expect(note.hidden).toBe(false);
    expect(root.all("match-row")).toEqual([]);

    on?.noRelay();
    expect(note.textContent).toBe(MATCHES_OFFLINE);
  });

  it("shows a record as one line: mode, each player's profession, winner, map, duration, when, badge (#2585)", () => {
    const { root } = render();
    hear("a");
    const [row] = root.all("match-row");
    expect(root.one("matches-note").hidden).toBe(true);
    expect(row?.one("match-mode").textContent).toBe("Random Arena");
    expect(row?.one("match-when").textContent).toBe("2 min ago");
    expect(row?.one("match-duration").textContent).toBe("5:05");
    const badge = row?.one("match-host-reported");
    expect(badge?.title).toBe(HOST_REPORTED);
    const teams = row?.all("match-team") ?? [];
    expect(teams.map((team) => team.className)).toEqual(["match-team is-winner", "match-team"]);
    expect(row?.one("match-result").textContent).toBe("◂ Won");
    const icons = teams.map((team) => team.all("match-player-icon"));
    expect(icons.map((team) => team.length)).toEqual([1, 1]);
    expect(icons[0]?.[0]?.title).toMatch(/^Ann \[VIBE\]: \S/);
    expect(icons[1]?.[0]?.title).toMatch(/^Elementalist Bot \(bot\): \S/);
    expect(icons[0]?.[0]?.src).not.toBe("");
    // No team card and no names until the row is opened.
    expect(row?.all("play-card")).toHaveLength(0);
    expect(row?.all("match-player-name")).toHaveLength(0);
  });

  it("marks a draw, and no team the winner; a second team's win points right", () => {
    const { root } = render();
    hear("a", { ...RECORD, winningTeam: null });
    expect(root.one("match-result").textContent).toBe("Draw");
    expect(root.all("match-team").map((team) => team.className)).toEqual([
      "match-team",
      "match-team",
    ]);
    hear("b", { ...RECORD, endedAt: RECORD.endedAt + 1, winningTeam: 1 });
    expect(root.all("match-result")[0]?.textContent).toBe("Won ▸");
  });

  it("puts a record heard live at the top when it is the newest", () => {
    const { root } = render();
    hear("old", { ...RECORD, endedAt: RECORD.endedAt - 600 });
    hear("new");
    hear("older", { ...RECORD, endedAt: RECORD.endedAt - 3600 });
    expect(root.all("match-when").map((when) => when.textContent)).toEqual([
      "2 min ago",
      "12 min ago",
      "1 h ago",
    ]);
  });

  it(`keeps ${String(MATCHES_KEPT)}, dropping the oldest for a newer one`, () => {
    const { root } = render();
    for (let index = 0; index <= MATCHES_KEPT; index += 1) {
      hear(String(index), { ...RECORD, endedAt: RECORD.endedAt + index, durationSeconds: index });
    }
    const durations = () => root.all("match-duration").map((duration) => duration.textContent);
    expect(durations()).toHaveLength(MATCHES_KEPT);
    // The first heard ended earliest, and went; the newest is on top.
    expect(durations()).not.toContain("0:00");
    expect(durations()[0]).toBe("1:40");
    // One older than a full page is not shown at all.
    hear("older", { ...RECORD, endedAt: RECORD.endedAt - 1, durationSeconds: 7000 });
    expect(durations()).toHaveLength(MATCHES_KEPT);
    expect(durations()).not.toContain("116:40");
  });

  it("opens a record's detail in place: the team card, and no list under it (#2637)", () => {
    const { root } = render();
    hear("a");
    const head = root.one("match-row-head");
    expect(root.all("match-detail")).toHaveLength(0);
    head.click();
    expect(head.attributes.get("aria-expanded")).toBe("true");
    const detail = root.one("match-detail");
    expect(detail.all("play-card")).toHaveLength(1);
    expect(detail.all("match-players")).toHaveLength(0);
    expect(detail.all("match-player")).toHaveLength(0);
    // The card member rows carry the only skill bars.
    expect(detail.all("mini-skill-bar")).toEqual(detail.one("play-card").all("mini-skill-bar"));
    expect(detail.one("match-detail-result").textContent).toBe("Team 1: Won");
    expect(detail.one("match-detail-summary").textContent).toBe("Annihilation after 5:05");

    head.click();
    expect(root.all("match-detail")).toHaveLength(0);
  });

  it("says a build it cannot read is unreadable", () => {
    const { root } = render();
    const [ann, bot] = [RECORD.teams[0].players[0], RECORD.teams[1]];
    if (ann === undefined) {
      return;
    }
    hear("a", { ...RECORD, teams: [{ players: [{ ...ann, template: "!!!" }] }, bot] });
    expect(root.one("match-player-icon").title).toBe(`Ann [VIBE]: ${BUILD_UNREADABLE}`);
  });

  it("puts the winner's tab first and opens it, keeping each team's number (#2637)", () => {
    const { root } = render();
    hear("a", { ...PAIRS, winningTeam: 1 });
    root.one("match-row-head").click();
    const detail = root.one("match-detail");
    const tabs = detail.all("match-tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Team 2 · Won", "Team 1 · Lost"]);
    expect(tabs.map((tab) => tab.attributes.get("aria-selected"))).toEqual(["true", "false"]);
    expect(detail.one("match-detail-result").textContent).toBe("Team 2: Won");
    tabs[1]?.click();
    expect(detail.one("match-detail-result").textContent).toBe("Team 1: Lost");
  });

  it("keeps Team 1 first on a draw (#2637)", () => {
    const { root } = render();
    hear("a", { ...PAIRS, winningTeam: null });
    root.one("match-row-head").click();
    const tabs = root.one("match-detail").all("match-tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Team 1 · Draw", "Team 2 · Draw"]);
    expect(root.one("match-detail-result").textContent).toBe("Team 1: Draw");
  });

  it("shows one team at a time as a team card, a tab for each, a member row per player (#2585)", () => {
    const { root } = render();
    hear("a", PAIRS);
    root.one("match-row-head").click();
    const detail = root.one("match-detail");
    const tabs = detail.all("match-tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Team 1 · Won", "Team 2 · Lost"]);
    const shown = () => {
      const cards = detail.all("play-card");
      expect(cards).toHaveLength(1);
      return [
        cards[0]?.one("match-detail-result").textContent,
        cards[0]?.all("play-card-member").map((member) => member.attributes.get("aria-label")),
        tabs.map((tab) => tab.attributes.get("aria-selected")),
      ];
    };
    expect(shown()).toEqual([
      "Team 1: Won",
      [expect.stringContaining("Ann"), "Bob"],
      ["true", "false"],
    ]);
    tabs[1]?.click();
    expect(shown()).toEqual(["Team 2: Lost", ["Bot A (bot)", "Bot B (bot)"], ["false", "true"]]);
  });

  it("clones a team once however often its Clone is pressed (#2585)", () => {
    const { root } = render();
    hear("a", PAIRS);
    root.one("match-row-head").click();
    const first = root.one("play-card-clone");
    first.click();
    first.click();
    expect(first.disabled).toBe(true);
    // The other team's Clone, and the first's, outlive a switch of tabs.
    root.all("match-tab")[1]?.click();
    expect(root.one("play-card-clone").disabled).toBe(false);
    root.all("match-tab")[0]?.click();
    expect(root.one("play-card-clone").disabled).toBe(true);
    expect(cloned).toEqual([PAIRS.teams[0]]);
  });

  it("has no Clone for a 1v1, and a disabled one for a team it can't read (#2585)", () => {
    const { root } = render();
    hear("solo");
    root.one("match-row-head").click();
    expect(root.all("play-card-clone")).toHaveLength(0);

    const [ann, bob] = PAIRS.teams[0].players;
    if (ann === undefined || bob === undefined) {
      return;
    }
    const unreadable: MatchRecord = {
      ...PAIRS,
      endedAt: RECORD.endedAt + 1,
      teams: [{ players: [ann, { ...bob, template: "!!!" }] }, PAIRS.teams[1]],
    };
    hear("pairs", unreadable);
    const head = root.all("match-row-head")[0];
    head?.click();
    const [clone] = root.all("play-card-clone");
    expect(clone?.disabled).toBe(true);
    expect(clone?.title).toBe(TEAM_UNREADABLE);
    clone?.click();
    expect(cloned).toEqual([]);
  });

  it("stops listening when the page closes", () => {
    const { close } = render();
    close();
    expect(closed).toBe(1);
  });
});

describe("a match's relative time (#2532)", () => {
  it("reads just now, minutes, hours, then days", () => {
    const now = 1_000_000;
    expect(relativeTime(now - 30, now)).toBe("just now");
    expect(relativeTime(now - 125, now)).toBe("2 min ago");
    expect(relativeTime(now - 2 * 3600, now)).toBe("2 h ago");
    expect(relativeTime(now - 3 * 86_400, now)).toBe("3 d ago");
    expect(relativeTime(now + 60, now)).toBe("just now");
  });
});
