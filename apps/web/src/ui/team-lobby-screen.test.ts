import type {
  WireProposalBuild,
  WireTeamLobby,
  WireTeamProposal,
  WireTeamSide,
} from "@vibewars/game-protocol";
import { defaultBuildEquipment, STARTER_TEAMS } from "@vibewars/game-core";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { t } from "../i18n/index.js";
import type { StoredCharacter, StoredTeam, TeamBuildSize } from "../storage/schema.js";
import type { FigureLook } from "./character-card.js";
import type * as Figure from "./character-figure.js";
import type * as Kit from "./kit.js";
import {
  clockText,
  drawerRows,
  drawerShowing,
  initial,
  noTeamBuildNamed,
  proposableTeams,
  putAwayBuildsDrawer,
  reasonLine,
  renderTeamLobbyScreen,
  soloCharacterKey,
  soloEntries,
  teamLobbyBody,
  type SoloChoice,
  type TeamLobbyCallbacks,
} from "./team-lobby-screen.js";

// The figure draws on a canvas, which Node has none of: a bare one,
// naming what it holds as the real one does.
/** The title bar's status, as the last screen drawn put it there. */
const bar = vi.hoisted(() => ({ status: [] as readonly unknown[] }));

vi.mock("./kit.js", async (original) => ({
  ...(await original<typeof Kit>()),
  screenBar: (options: { readonly status?: readonly unknown[] }) => {
    bar.status = options.status ?? [];
    return { back: undefined, release: () => undefined };
  },
}));

vi.mock("./character-figure.js", async (original) => ({
  ...(await original<typeof Figure>()),
  createCharacterFigure: (look: FigureLook) => {
    const canvas = document.createElement("canvas");
    canvas.className = "character-figure";
    if (look.appearance.weaponId !== undefined) {
      canvas.setAttribute("data-weapon-id", look.appearance.weaponId);
    }
    return canvas;
  },
}));

/** Just enough DOM for the Team Lobby's body; the unit tests run in Node. */
class FakeElement {
  tagName = "";
  className = "";
  textContent = "";
  title = "";
  value = "";
  disabled = false;
  hidden = false;
  placeholder = "";
  type = "";
  readonly children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, () => void>();
  readonly style = { setProperty: (): void => undefined, width: "", height: "" };
  readonly classList = {
    add: (name: string): void => {
      this.classList.toggle(name, true);
    },
    toggle: (name: string, on: boolean): void => {
      const names = this.className.split(" ").filter((part) => part !== "" && part !== name);
      this.className = (on ? [...names, name] : names).join(" ");
    },
  };

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

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    this.append(...children);
  }

  focus(): void {
    focusLog.push(this);
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      this.appendChild(child);
    }
  }

  has(name: string): boolean {
    return this.className.split(" ").includes(name);
  }

  /** Every element under this one with class `name`, in document order. */
  all(name: string): FakeElement[] {
    return this.children.flatMap((child) => [
      ...(child.has(name) ? [child] : []),
      ...child.all(name),
    ]);
  }

  /** All the text under this one, as a reader would get it. */
  text(): string {
    return this.textContent + this.children.map((child) => child.text()).join("");
  }

  click(): void {
    this.listeners.get("click")?.();
  }
}

/** Each element focused, in order: the last is `document.activeElement`. */
const focusLog: FakeElement[] = [];

/** A card's own press, which votes and carries its state. */
function press(card: FakeElement | undefined): FakeElement | undefined {
  return card?.all("play-card-open")[0];
}

function player(
  sessionId: string,
  name: string,
  team: 0 | 1 | null,
  bot = false,
): LobbyPlayerSnapshot {
  return {
    sessionId,
    name,
    guildTag: null,
    team,
    ready: false,
    isHost: sessionId === "aria",
    bot,
    away: false,
    playerPubkey: bot ? null : "ab".repeat(32),
  };
}

const PLAYERS = [
  player("aria", "Aria", 0),
  player("brann", "Brann", 0),
  player("cass", "Cass", 0),
  player("bot", "Monk Bot", 0, true),
  player("eli", "Eli", 1),
  player("watcher", "Watcher", null),
];

const WAR_MONK = [
  { primary: "warrior", secondary: "monk" },
  { primary: "monk", secondary: null },
  { primary: "elementalist", secondary: null },
  { primary: "ranger", secondary: null },
];

function proposal(proposerId: string, voterIds: readonly string[]): WireTeamProposal {
  return { proposerId, members: WAR_MONK, voterIds };
}

function voteSide(proposals: readonly WireTeamProposal[]): WireTeamSide {
  return { size: 4, captainId: "aria", proposals, chosen: null, claims: [] };
}

const SUNRISE = {
  proposerId: "aria",
  reason: "captain" as const,
  presetName: null,
  members: [
    { name: "Bram", primary: "warrior", secondary: null },
    { name: "Mira", primary: "monk", secondary: null },
    { name: "Ash", primary: "elementalist", secondary: null },
    { name: "Tove", primary: "ranger", secondary: null },
  ],
};

function claimSide(claims: readonly (string | null)[]): WireTeamSide {
  return { size: 4, captainId: "aria", proposals: [], chosen: SUNRISE, claims };
}

function lobby(
  self: string,
  stage: WireTeamLobby["stage"],
  side: WireTeamSide,
  players: readonly LobbyPlayerSnapshot[] = PLAYERS,
  proposalBuilds: LobbySnapshot["proposalBuilds"] = new Map(),
): LobbySnapshot {
  const team = players.find((p) => p.sessionId === self)?.team ?? null;
  return {
    selfSessionId: self,
    code: "ACDEFG",
    phase: "team-lobby",
    mode: "hosted-game",
    mapId: "arena",
    teamSize: 4,
    open: true,
    hostId: "aria",
    players,
    isHost: self === "aria",
    countdownSeconds: null,
    queueNonce: null,
    ascentRound: null,
    ascentLock: null,
    proposalBuilds,
    teamLobby: {
      stage,
      secondsLeft: 38,
      sides: team === 0 ? [side, null] : team === 1 ? [null, side] : [null, null],
    },
  };
}

/** A saved character `id`: legal, unless its bar holds a skill that does not exist. */
function saved(id: string, name: string, legal = true): StoredCharacter {
  return {
    schemaVersion: 1,
    id,
    name,
    primaryProfession: "monk",
    secondaryProfession: undefined,
    attributes: [],
    skillBar: [legal ? null : "no-such-skill", ...Array.from({ length: 7 }, () => null)],
    equipment: defaultBuildEquipment("monk"),
    updatedAt: 0,
  };
}

/** A chooser with nothing in it: every side here but the 1v1 ones. */
const NO_SOLO: SoloChoice = { entries: [], picked: undefined };

/** A Team Build of `size`, `filled` of its slots taken: all of them unless said. */
function team(id: string, name: string, size: TeamBuildSize, filled: number = size): StoredTeam {
  const character = {
    id: "c",
    name: "Member",
    primaryProfession: "warrior" as const,
    secondaryProfession: undefined,
    attributes: [],
    skillBar: Array.from({ length: 8 }, () => null),
    equipment: defaultBuildEquipment("warrior"),
  };
  return {
    schemaVersion: 1,
    id,
    name,
    size,
    members: Array.from({ length: filled }, () => ({ character })),
    rulesetId: "r",
    updatedAt: 0,
  };
}

describe("the Team Lobby's words (#1460)", () => {
  it("reads every reason, telling a random tie from a vote nobody cast", () => {
    const voted = [proposal("aria", ["brann"]), proposal("brann", ["cass"])];
    const unvoted = [proposal("aria", []), proposal("brann", [])];
    expect(reasonLine({ ...SUNRISE, reason: "votes" }, voted)).toBe("Most votes");
    expect(reasonLine({ ...SUNRISE, reason: "captain" }, voted)).toBe("Tie: captain's pick");
    expect(reasonLine({ ...SUNRISE, reason: "random" }, voted)).toBe("Tie: picked at random");
    expect(reasonLine({ ...SUNRISE, reason: "random" }, unvoted)).toBe(
      "No votes: picked at random",
    );
    expect(
      reasonLine({ ...SUNRISE, proposerId: null, reason: "preset", presetName: "AB Balanced" }, []),
    ).toBe("No proposals: a random preset");
  });

  it("shows the clock as m:ss and a voter as an initial", () => {
    expect([clockText(38), clockText(60), clockText(0), clockText(-3)]).toEqual([
      "0:38",
      "1:00",
      "0:00",
      "0:00",
    ]);
    expect([initial("aria"), initial(" Brann"), initial("")]).toEqual(["A", "B", "?"]);
  });

  it("never offers a Team Build with problems: it saves, but is not playable (#2110)", () => {
    const unnamed = team("a", "", 4);
    const four = team("b", "Four", 4);
    expect(proposableTeams([unnamed, four], 4)).toEqual([four]);
  });

  it("offers only the Team Builds of the side's exact size (#2104)", () => {
    const duo = team("b", "Duo", 2);
    const four = team("c", "Four", 4);
    const eight = team("d", "Eight", 8);
    expect(proposableTeams([duo, four, eight], 4)).toEqual([four]);
    expect(proposableTeams([duo, four, eight], 1)).toEqual([]);
    expect(proposableTeams([duo, four], 8)).toEqual([]);
  });

  it("offers no Team Build short of its size, and counts none as hidden (#2109)", () => {
    const four = team("a", "Four", 4);
    const three = team("b", "Three of four", 4, 3);
    const half = team("c", "Half of eight", 8, 4);
    expect(proposableTeams([four, three, half], 4)).toEqual([four]);
    expect(drawerRows([four, three, half], 4, "")).toEqual({ rows: [four], hiddenOtherSizes: 0 });
  });

  it("lists the drawer's Team Builds by size and name, and counts the other sizes (#2116)", () => {
    const four = team("a", "Ward & Spike", 4);
    const hexway = team("b", "Hexway", 4);
    const duo = team("c", "Duo", 2);
    const broken = team("d", "", 2);
    const all = [four, hexway, duo, broken];
    // A Team Build with problems is no row, and not one hidden either.
    expect(drawerRows(all, 4, "")).toEqual({ rows: [four, hexway], hiddenOtherSizes: 1 });
    expect(drawerRows(all, 4, " WARD ").rows).toEqual([four]);
    expect(drawerRows(all, 4, "spike").rows).toEqual([four]);
    expect(drawerRows(all, 4, "zzz")).toEqual({ rows: [], hiddenOtherSizes: 1 });
    expect(drawerRows(all, 2, "")).toEqual({ rows: [duo], hiddenOtherSizes: 2 });
    expect(drawerShowing(4, 0)).toBe("Showing 4-player builds");
    expect(drawerShowing(4, 1)).toBe("Showing 4-player builds · 1 other hidden");
    expect(drawerShowing(4, 2)).toBe("Showing 4-player builds · 2 others hidden");
    expect(noTeamBuildNamed("zzz")).toBe("No Team Build named “zzz”.");
  });
});

describe("the Team Lobby's body (#1460)", () => {
  let sent: { kind: string; value: string | number | null | undefined }[];
  const callbacks: TeamLobbyCallbacks = {
    onVote: (proposerId) => sent.push({ kind: "vote", value: proposerId }),
    onPropose: (teamId) => sent.push({ kind: "propose", value: teamId }),
    onClaim: (slot) => sent.push({ kind: "claim", value: slot }),
    onPickSolo: (key) => sent.push({ kind: "pick", value: key }),
    onToggleReady: () => undefined,
    onLeave: () => undefined,
  };
  const body = (
    shown: LobbySnapshot,
    teams: readonly StoredTeam[] = [],
    proposed?: string,
    solo: SoloChoice = NO_SOLO,
  ): FakeElement => {
    const root = new FakeElement();
    root.append(
      ...(teamLobbyBody(shown, teams, proposed, solo, callbacks) as unknown as FakeElement[]),
    );
    return root;
  };

  beforeEach(() => {
    sent = [];
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        Object.assign(new FakeElement(), { tagName: tag.toUpperCase() }),
    });
    // A spectator's body forgets the last test's drawer (#2116).
    teamLobbyBody(lobby("watcher", "vote", voteSide([])), [], undefined, NO_SOLO, callbacks);
    focusLog.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("puts no Team size in the bar, at any stage, host or guest (#2141)", () => {
    vi.useFakeTimers();
    vi.stubGlobal("HTMLInputElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        Object.assign(new FakeElement(), { tagName: tag.toUpperCase() }),
      getElementById: () => null,
    });
    const screens = [
      lobby("aria", "vote", voteSide([])),
      lobby("aria", "claim", voteSide([])),
      lobby("brann", "vote", voteSide([])),
    ];
    for (const shown of screens) {
      const root = new FakeElement();
      renderTeamLobbyScreen(
        root as unknown as HTMLElement,
        shown,
        [],
        undefined,
        NO_SOLO,
        callbacks,
        undefined,
      );
      const status = bar.status as readonly FakeElement[];
      expect(status).toHaveLength(1);
      expect(status[0]?.text()).not.toMatch(/Team size|\dv\d/);
    }
    vi.useRealTimers();
  });

  it("draws a card per proposal with its proposer, captain crown and voters' initials", () => {
    const shown = body(
      lobby(
        "brann",
        "vote",
        voteSide([proposal("aria", ["aria", "cass"]), proposal("brann", ["brann"])]),
      ),
    );
    const cards = shown.all("play-card");
    expect(cards.map((card) => card.all("team-lobby-name-text")[0]?.textContent)).toEqual([
      "Aria",
      "Brann",
    ]);
    expect(cards.map((card) => card.all("team-lobby-captain").length)).toEqual([1, 0]);
    expect(cards[0]?.all("team-lobby-token").map((token) => token.textContent)).toEqual(["A", "C"]);
    expect(cards.map((card) => card.all("team-lobby-count")[0]?.textContent)).toEqual(["2", "1"]);
    expect(cards[0]?.all("character-figure")).toHaveLength(4);
    // Brann's own vote is marked, and only it.
    expect(cards.map((card) => press(card)?.attributes.get("aria-pressed"))).toEqual([
      "false",
      "true",
    ]);
    expect(cards.map((card) => card.has("is-voted"))).toEqual([false, true]);
    expect(press(cards[0])?.attributes.get("aria-label")).toBe("Aria's team build");
    expect(cards[1]?.text()).toContain("Your vote ✓");
    // No hint that the cards are clicked (#2642): they look pressable.
    expect(shown.text()).not.toContain("Click a card");
  });

  it("votes for a card on a click, and withdraws on a click on its own vote", () => {
    const cards = body(
      lobby("brann", "vote", voteSide([proposal("aria", []), proposal("brann", ["brann"])])),
    ).all("play-card");
    press(cards[0])?.click();
    press(cards[1])?.click();
    expect(sent).toEqual([
      { kind: "vote", value: "aria" },
      { kind: "vote", value: null },
    ]);
  });

  /** The drawer's tab, the drawer, and its rows' heads, in `shown`. */
  const drawerOf = (shown: FakeElement) => ({
    tab: shown.all("team-lobby-drawer-tab")[0],
    drawer: shown.all("team-lobby-drawer")[0],
    search: shown.all("team-lobby-drawer-search")[0],
    rows: () => shown.all("team-lobby-drawer-row"),
    heads: () => shown.all("team-lobby-drawer-row-head"),
    go: () => shown.all("team-lobby-drawer-go")[0],
  });

  it("keeps Your Team Builds in a closed drawer behind a tab, which opens it on the search (#2116)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [team("four", "Four", 4)]);
    const { tab, drawer, search } = drawerOf(shown);
    expect(tab?.text()).toBe("Your Team Builds ▾");
    expect(drawer?.hidden).toBe(true);
    expect(tab?.attributes.get("aria-expanded")).toBe("false");
    // No card of your own in the page: only the proposals' row is there.
    expect(shown.all("play-card")).toEqual([]);
    tab?.click();
    expect(drawer?.hidden).toBe(false);
    expect(tab?.attributes.get("aria-expanded")).toBe("true");
    expect(focusLog.at(-1)).toBe(search);
    expect(shown.all("team-lobby-drawer-showing").map((line) => line.textContent)).toEqual([
      "Showing 4-player builds",
    ]);
  });

  it("expands one row at a time to its members; Propose proposes and closes (#2116)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [
      team("four", "Four", 4),
      team("quad", "Quad", 4),
    ]);
    const { tab, drawer, rows, heads, go } = drawerOf(shown);
    tab?.click();
    expect(rows().map((row) => row.all("team-lobby-drawer-row-name")[0]?.textContent)).toEqual([
      "Four",
      "Quad",
    ]);
    expect(rows()[0]?.text()).toContain("4 members");
    expect(
      rows()[0]
        ?.all("team-lobby-drawer-chip")
        .map((chip) => chip.textContent),
    ).toEqual(["W", "W", "W", "W"]);
    expect(go()).toBeUndefined();
    heads()[0]?.click();
    heads()[1]?.click();
    // Only Quad's is open now, its four members drawn with their weapons.
    expect(rows().map((row) => row.has("is-expanded"))).toEqual([false, true]);
    expect(heads()[1]?.attributes.get("aria-expanded")).toBe("true");
    expect(rows()[1]?.all("character-figure")).toHaveLength(4);
    expect(go()?.textContent).toBe("Propose this build");
    go()?.click();
    expect(sent).toEqual([{ kind: "propose", value: "quad" }]);
    expect(drawer?.hidden).toBe(true);
    expect(focusLog.at(-1)).toBe(tab);
  });

  it("marks your proposal, whose button withdraws it (#1862, #2116)", () => {
    const shown = body(
      lobby("aria", "vote", voteSide([])),
      [team("four", "Four", 4), team("quad", "Quad", 4)],
      "four",
    );
    const { tab, rows, heads, go } = drawerOf(shown);
    tab?.click();
    expect(rows().map((row) => row.has("is-proposed"))).toEqual([true, false]);
    expect(
      rows()[0]
        ?.all("team-lobby-drawer-tag")
        .map((tag) => tag.textContent),
    ).toEqual(["proposed"]);
    heads()[0]?.click();
    expect(go()?.textContent).toBe("Withdraw proposal");
    go()?.click();
    expect(sent).toEqual([{ kind: "propose", value: undefined }]);
  });

  it("filters as you type, and says so when no name matches (#2116)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [
      team("four", "Four", 4),
      team("quad", "Quad", 4),
      team("duo", "Duo", 2),
    ]);
    const { tab, search, rows } = drawerOf(shown);
    tab?.click();
    expect(shown.all("team-lobby-drawer-showing")[0]?.textContent).toBe(
      "Showing 4-player builds · 1 other hidden",
    );
    if (search !== undefined) {
      search.value = "QU";
      search.listeners.get("input")?.();
    }
    expect(rows().map((row) => row.all("team-lobby-drawer-row-name")[0]?.textContent)).toEqual([
      "Quad",
    ]);
    if (search !== undefined) {
      search.value = "zzz";
      search.listeners.get("input")?.();
    }
    expect(rows()).toEqual([]);
    expect(shown.all("team-lobby-drawer-empty")[0]?.textContent).toBe("No Team Build named “zzz”.");
    // A redraw, as the next snapshot brings, keeps the search.
    const again = drawerOf(body(lobby("aria", "vote", voteSide([])), [team("quad", "Quad", 4)]));
    expect(again.drawer?.hidden).toBe(false);
    expect(again.search?.value).toBe("zzz");
  });

  it("puts the drawer away on Esc, focus back on its tab, before Esc leaves (#2116)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [team("four", "Four", 4)]);
    const { tab, drawer } = drawerOf(shown);
    expect(putAwayBuildsDrawer()).toBe(false);
    tab?.click();
    expect(putAwayBuildsDrawer()).toBe(true);
    expect(drawer?.hidden).toBe(true);
    expect(focusLog.at(-1)).toBe(tab);
    expect(putAwayBuildsDrawer()).toBe(false);
  });

  it("leaves out a Team Build of the wrong size, and says so when none is the side's (#2104)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [
      team("duo", "Duo", 2),
      team("eight", "Eight", 8),
    ]);
    expect(drawerOf(shown).rows()).toEqual([]);
    expect(drawerOf(shown).search?.hidden).toBe(true);
    expect(shown.all("team-lobby-no-teams").map((line) => line.textContent)).toEqual([
      "No 4-player Team Builds — make one in the Team Builder.",
    ]);
  });

  it("says to fix a Team Build when none is playable (#2110)", () => {
    const shown = body(lobby("aria", "vote", voteSide([])), [team("unnamed", "", 4)]);
    expect(drawerOf(shown).rows()).toEqual([]);
    expect(shown.all("team-lobby-no-teams").map((line) => line.textContent)).toEqual([
      t("teamLobby.noPlayableTeamBuilds"),
    ]);
  });

  it("says where to make a Team Build when you have none, with no rows and no dropdown", () => {
    const shown = body(lobby("aria", "vote", voteSide([])));
    expect(drawerOf(shown).rows()).toEqual([]);
    expect(shown.all("team-lobby-no-teams").map((line) => line.textContent)).toEqual([
      t("teamLobby.noTeamBuilds"),
    ]);
    const tags = (element: FakeElement): string[] => [
      element.tagName,
      ...element.children.flatMap(tags),
    ];
    expect(tags(shown)).not.toContain("SELECT");
  });

  it("shows one dashed box where the cards would be when nobody proposed", () => {
    const shown = body(lobby("aria", "vote", voteSide([])));
    expect(shown.all("play-card")).toEqual([]);
    expect(shown.all("team-lobby-empty").map((box) => box.textContent)).toEqual([
      t("teamLobby.noProposals"),
    ]);
  });

  it("lists a 1v1 every character, team members labelled, the active one pressed (#2387)", () => {
    const characters = [saved("kai", "Kai"), saved("lin", "Lin")];
    const teams = [team("z", "Zeal", 2), team("a", "Anvil", 2)];
    const entries = soloEntries(characters, teams);
    expect(entries.map((entry) => entry.key)).toEqual([
      "character:kai",
      "character:lin",
      "team:a:0",
      "team:a:1",
      "team:z:0",
      "team:z:1",
    ]);
    const solo = { entries, picked: soloCharacterKey("lin") };
    const shown = body(
      lobby("eli", "vote", { ...voteSide([proposal("eli", [])]), size: 1 }),
      teams,
      undefined,
      solo,
    );
    expect(shown.all("team-lobby-drawer-tab")).toEqual([]);
    expect(shown.all("team-lobby-proposals")).toEqual([]);
    const cards = shown.all("play-card");
    expect(cards.map((card) => card.all("play-card-name")[0]?.textContent)).toEqual([
      "Kai",
      "Lin",
      "Member",
      "Member",
      "Member",
      "Member",
    ]);
    expect(shown.all("play-card-note").map((label) => label.textContent)).toEqual([
      "Team: Anvil",
      "Team: Anvil",
      "Team: Zeal",
      "Team: Zeal",
    ]);
    expect(cards.map((card) => press(card)?.attributes.get("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);
    // A side of two still picks from its Team Builds.
    const pair = body(lobby("eli", "vote", { ...voteSide([proposal("eli", [])]), size: 2 }));
    expect(pair.all("team-lobby-drawer-tab")).toHaveLength(1);
    expect(pair.all("team-lobby-solo")).toEqual([]);
  });

  it("plays a 1v1's clicked character, never an invalid one (#2387)", () => {
    const entries = soloEntries([saved("kai", "Kai"), saved("bad", "Bad", false)], []);
    expect(entries.map((entry) => entry.legal)).toEqual([true, false]);
    const shown = body(lobby("eli", "vote", { ...voteSide([]), size: 1 }), [], undefined, {
      entries,
      picked: undefined,
    });
    const [kai, bad] = shown.all("play-card");
    expect(bad?.all("roster-invalid-tag").map((tag) => tag.textContent)).toEqual(["Invalid"]);
    expect(bad?.title).not.toBe("");
    press(bad)?.click();
    expect(sent).toEqual([]);
    press(kai)?.click();
    expect(sent).toEqual([{ kind: "pick", value: "character:kai" }]);
  });

  it("starts a 1v1 with the chosen card and no seats (#2387)", () => {
    vi.useFakeTimers();
    vi.stubGlobal("HTMLInputElement", FakeElement);
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        Object.assign(new FakeElement(), { tagName: tag.toUpperCase() }),
      getElementById: () => null,
    });
    const solo = {
      ...claimSide([null]),
      size: 1,
      chosen: { ...SUNRISE, members: SUNRISE.members.slice(0, 1) },
    };
    const root = new FakeElement();
    renderTeamLobbyScreen(
      root as unknown as HTMLElement,
      lobby("brann", "claim", solo),
      [],
      undefined,
      NO_SOLO,
      callbacks,
      undefined,
    );
    expect((bar.status as readonly FakeElement[])[0]?.text()).toContain(
      t("teamLobby.soloStarting"),
    );
    expect(root.all("team-lobby-seat")).toEqual([]);
    expect(root.all("team-lobby-result")).toHaveLength(1);
    renderTeamLobbyScreen(
      root as unknown as HTMLElement,
      lobby("brann", "vote", { ...voteSide([]), size: 1 }),
      [],
      undefined,
      NO_SOLO,
      callbacks,
      undefined,
    );
    expect((bar.status as readonly FakeElement[])[0]?.text()).toContain(t("teamLobby.soloTitle"));
    vi.useRealTimers();
  });

  it("shows a spectator one line and nothing of either side", () => {
    const shown = body(lobby("watcher", "vote", voteSide([proposal("aria", [])])));
    expect(shown.text()).toBe(t("teamLobby.spectating"));
  });

  it("lifts the chosen build, fades the rest, and says why", () => {
    // The vote first: the claim's state carries no proposals.
    body(
      lobby("brann", "vote", voteSide([proposal("aria", ["aria"]), proposal("brann", ["brann"])])),
    );
    const shown = body(lobby("brann", "claim", claimSide([null, null, null, null])));
    const cards = shown.all("team-lobby-result")[0]?.all("play-card") ?? [];
    expect(
      cards.map((card) => [
        card.all("team-lobby-name-text")[0]?.textContent,
        card.has("is-chosen"),
        card.has("is-faded"),
      ]),
    ).toEqual([
      ["Aria", true, false],
      ["Brann", false, true],
    ]);
    expect(press(cards[1])?.disabled).toBe(true);
    expect(shown.all("team-lobby-reason").map((line) => line.textContent)).toEqual([
      "Tie: captain's pick",
    ]);
    expect(shown.all("team-lobby-seats-line").map((line) => line.textContent)).toEqual([
      t("teamLobby.seatsLine"),
    ]);
  });

  it("seats: a free one is taken, your own let go, someone else's is locked", () => {
    const seats = body(lobby("brann", "claim", claimSide(["aria", "brann", null, null]))).all(
      "team-lobby-seat",
    );
    expect(seats.map((seat) => seat.all("play-card-line")[0]?.text())).toEqual([
      "Warrior",
      "Monk",
      "Elementalist",
      "Ranger",
    ]);
    expect(seats.map((seat) => seat.attributes.get("aria-label"))).toEqual([
      "Warrior: Aria",
      "Monk: Brann",
      "Elementalist: Sit here",
      "Ranger: Sit here",
    ]);
    expect(seats.map((seat) => seat.all("team-lobby-seat-holder")[0]?.text() ?? "free")).toEqual([
      "AriaC",
      "Brann",
      "free",
      "free",
    ]);
    expect(seats.map((seat) => seat.disabled)).toEqual([true, false, false, false]);
    expect(seats[1]?.has("is-mine")).toBe(true);
    seats[1]?.click();
    seats[2]?.click();
    expect(sent).toEqual([
      { kind: "claim", value: null },
      { kind: "claim", value: 2 },
    ]);
  });

  it("keeps a won Heroes' Ascent run's seats, a vacant one open to a newcomer alone (#2539)", () => {
    // Aria and Brann hold their seats; Elementalist's left, Ranger's was a bot's.
    const ascentLock = {
      slots: [
        { slot: 0, claimedBy: "aria" },
        { slot: 1, claimedBy: "brann" },
        { slot: 2, claimedBy: null },
        { slot: 3, claimedBy: null },
      ],
    };
    const locked = (self: string, claims: readonly (string | null)[]) =>
      body({ ...lobby(self, "claim", claimSide(claims)), ascentLock });
    const newcomer = locked("cass", ["aria", "brann", null, null]);
    const seats = newcomer.all("team-lobby-seat");
    expect(seats.map((seat) => seat.attributes.get("aria-label"))).toEqual([
      "Warrior: Aria",
      "Monk: Brann",
      "Elementalist: Open: Elementalist build",
      "Ranger: Open: Ranger build",
    ]);
    expect(seats.map((seat) => seat.disabled)).toEqual([true, true, false, false]);
    expect(newcomer.all("team-lobby-reason").map((line) => line.textContent)).toEqual([
      t("session.ascentLocked"),
    ]);
    seats[2]?.click();
    expect(sent).toEqual([{ kind: "claim", value: 2 }]);
    // A newcomer seated in a vacant slot may let go of it.
    expect(
      locked("cass", ["aria", "brann", "cass", null])
        .all("team-lobby-seat")
        .map((seat) => seat.disabled),
    ).toEqual([true, true, false, false]);
    // A member of the run keeps its seat, and takes no other.
    expect(
      locked("brann", ["aria", "brann", null, null])
        .all("team-lobby-seat")
        .map((seat) => seat.disabled),
    ).toEqual([true, true, true, true]);
  });

  describe("each member's weapons and skills (#1811)", () => {
    const BUILD: WireProposalBuild = {
      skills: ["warrior.backbreaker", "gone.skill", null, null, null, null, null, null],
      mainHand: "sword",
      offHand: "gone.offhand",
    };
    const ARIAS = new Map([["aria", [BUILD, BUILD, BUILD, BUILD]]]);

    it("draws them held on a proposal once the host sent its builds, the bare body before (#1864)", () => {
      const cards = body(
        lobby(
          "brann",
          "vote",
          voteSide([proposal("aria", []), proposal("brann", [])]),
          PLAYERS,
          ARIAS,
        ),
      ).all("play-card");
      const [sent, waiting] = cards;
      expect(sent?.all("character-card-row")).toHaveLength(4);
      expect(
        sent?.all("character-figure").map((figure) => figure.attributes.get("data-weapon-id")),
      ).toEqual(["sword", "sword", "sword", "sword"]);
      const row = sent?.all("character-card-row")[0];
      expect(row?.attributes.get("aria-label")).toBe("Warrior / Monk");
      // A skill or off-hand this client does not know is an empty slot.
      const cells = row?.all("mini-skill") ?? [];
      expect(cells.map((cell) => cell.has("is-empty"))).toEqual([
        false,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
      ]);
      expect(waiting?.all("character-card-row")).toHaveLength(4);
      expect(
        waiting?.all("character-figure").map((figure) => figure.attributes.get("data-weapon-id")),
      ).toEqual([undefined, undefined, undefined, undefined]);
      // No build yet: four empty bars.
      expect(waiting?.all("is-empty")).toHaveLength(32);
    });

    it("draws them on the chosen card and its seats, never by name; a house seat stays a '?' (#1863)", () => {
      body(lobby("brann", "vote", voteSide([proposal("aria", [])])));
      const shown = body(
        lobby(
          "brann",
          "claim",
          {
            ...claimSide([null, null, null, null]),
            chosen: {
              ...SUNRISE,
              members: [
                ...SUNRISE.members.slice(0, 3),
                { name: "Bot", primary: "?", secondary: null },
              ],
            },
          },
          PLAYERS,
          ARIAS,
        ),
      );
      const chosen = shown.all("is-chosen")[0];
      const rows = chosen?.all("character-card-row") ?? [];
      expect(rows.map((row) => row.attributes.get("aria-label"))).toEqual([
        "Warrior",
        "Monk",
        "Elementalist",
      ]);
      expect(chosen?.all("is-house")).toHaveLength(1);
      const seats = shown.all("team-lobby-seat");
      const [warrior] = seats;
      expect(
        warrior?.all("character-figure").map((figure) => figure.attributes.get("data-weapon-id")),
      ).toEqual(["sword"]);
      expect(warrior?.all("mini-skill")).toHaveLength(8);
      expect(warrior?.all("play-card-line")[0]?.text()).toBe("Warrior");
      expect(seats[3]?.all("is-house")).toHaveLength(1);
      expect(seats[3]?.all("character-figure")).toHaveLength(0);
      for (const name of ["Bram", "Mira", "Ash", "Bot"]) {
        expect(shown.text()).not.toContain(name);
        for (const each of seats) {
          expect(each.title).not.toContain(name);
          expect(each.attributes.get("aria-label")).not.toContain(name);
        }
      }
    });
  });

  it("names the random preset team when nobody proposed (#2148)", () => {
    body(lobby("aria", "vote", voteSide([])));
    const shown = body(
      lobby("aria", "claim", {
        ...claimSide([null, null, null, null]),
        chosen: { ...SUNRISE, proposerId: null, reason: "preset", presetName: "AB Balanced" },
      }),
    );
    const cards = shown.all("play-card");
    expect(cards.map((card) => card.all("team-lobby-name-text")[0]?.textContent)).toEqual([
      "AB Balanced",
    ]);
    expect(shown.all("team-lobby-reason")[0]?.textContent).toBe("No proposals: a random preset");
  });

  it("draws the preset's job names and skill bars on its card and seats (#2148)", () => {
    const preset = STARTER_TEAMS.find((team) => team.members.length === 4);
    if (preset === undefined) throw new Error("no 4-member starter team");
    const shown = body(
      lobby("aria", "claim", {
        ...claimSide([null, null, null, null]),
        chosen: {
          proposerId: null,
          reason: "preset",
          presetName: preset.name,
          members: preset.members.map(({ name, build }) => ({
            name,
            primary: build.primaryProfession,
            secondary: build.secondaryProfession ?? null,
          })),
        },
      }),
    );
    const jobs = preset.members.map(({ name }) => name);
    const rows = shown.all("is-chosen")[0]?.all("character-card-row") ?? [];
    expect(rows.map((row) => row.attributes.get("aria-label"))).toEqual(jobs);
    const seats = shown.all("team-lobby-seat");
    expect(seats.map((seat) => seat.attributes.get("aria-label"))).toEqual(
      jobs.map((job) => `${job}: Sit here`),
    );
    for (const seat of seats) {
      expect(
        seat.all("mini-skill").filter((cell) => !cell.className.includes("is-empty")),
      ).not.toHaveLength(0);
    }
  });

  it("titles a side of one's preset, which has no name, a preset team (#2148)", () => {
    const shown = body(
      lobby("aria", "claim", {
        ...claimSide([null]),
        size: 1,
        chosen: {
          ...SUNRISE,
          proposerId: null,
          reason: "preset",
          presetName: null,
          members: SUNRISE.members.slice(0, 1),
        },
      }),
    );
    expect(
      shown.all("play-card").map((card) => card.all("team-lobby-name-text")[0]?.textContent),
    ).toEqual([t("teamLobby.presetTeam")]);
  });
});
