import { STARTER_BUILDS } from "@vibewars/game-core";
import { recordTemplate, type MatchRecord } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { arenaIds } from "../net/maps.js";
import type { MatchRecordWatchHandlers } from "../net/transport/match-records.js";
import {
  BUILD_UNREADABLE,
  HOST_REPORTED,
  MATCHES_KEPT,
  MATCHES_OFFLINE,
  NO_MATCHES,
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

/** Just enough DOM to render the Matches page; the unit tests run in Node. */
class FakeElement {
  className = "";
  #text = "";
  title = "";
  src = "";
  alt = "";
  hidden = false;
  type = "";
  readonly children: FakeElement[] = [];
  parent: FakeElement | undefined;
  readonly attributes = new Map<string, string>();
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

  click(): void {
    this.listeners.get("click")?.();
  }
}

describe("the Matches page (#2532)", () => {
  let on: MatchRecordWatchHandlers | undefined;
  let closed: number;

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
    });
    return { root, close: () => screen.close() };
  };

  const hear = (id: string, record: MatchRecord = RECORD): void => {
    on?.record({ id, record });
  };

  beforeEach(() => {
    on = undefined;
    closed = 0;
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

  it("shows a record's mode, when, duration, teams, winner, bots and host-reported badge", () => {
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
    expect(teams[0]?.one("match-player-name").textContent).toBe("Ann [VIBE]");
    expect(teams[1]?.one("match-player-name").textContent).toBe("Elementalist Botbot");
    expect(teams[1]?.all("match-bot")).toHaveLength(1);
    expect(teams[0]?.all("match-bot")).toHaveLength(0);
    expect(row?.all("match-draw")).toHaveLength(0);
  });

  it("marks a draw, and no team the winner", () => {
    const { root } = render();
    hear("a", { ...RECORD, winningTeam: null });
    expect(root.all("match-draw")).toHaveLength(1);
    expect(root.all("match-won")).toHaveLength(0);
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

  it("opens a record's detail in place: each player's professions, attributes and bar", () => {
    const { root } = render();
    hear("a");
    const head = root.one("match-row-head");
    expect(root.all("match-detail")).toHaveLength(0);
    head.click();
    expect(head.attributes.get("aria-expanded")).toBe("true");
    const detail = root.one("match-detail");
    expect(detail.all("match-player")).toHaveLength(2);
    expect(detail.all("mini-skill-bar")).toHaveLength(2);
    expect(detail.all("match-professions")[0]?.textContent).not.toBe("");
    expect(detail.all("match-detail-result").map((result) => result.textContent)).toEqual([
      "Team 1: Won",
      "Team 2: Lost",
    ]);
    expect(detail.one("match-detail-summary").textContent).toBe("Annihilation after 5:05");

    head.click();
    expect(root.all("match-detail")).toHaveLength(0);
  });

  it("says a build it cannot read is unreadable, and shows the rest", () => {
    const { root } = render();
    const [ann, bot] = [RECORD.teams[0].players[0], RECORD.teams[1]];
    if (ann === undefined) {
      return;
    }
    hear("a", { ...RECORD, teams: [{ players: [{ ...ann, template: "!!!" }] }, bot] });
    root.one("match-row-head").click();
    const players = root.all("match-player");
    expect(players[0]?.one("match-build-unreadable").textContent).toBe(BUILD_UNREADABLE);
    expect(players[1]?.all("mini-skill-bar")).toHaveLength(1);
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
