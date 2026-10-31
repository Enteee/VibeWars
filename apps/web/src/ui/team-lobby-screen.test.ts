import { PROFESSIONS } from "@vibewars/game-core";
import type { WireTeamLobby, WireTeamProposal, WireTeamSide } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredTeam } from "../storage/schema.js";
import {
  NO_PROPOSALS,
  SEATS_LINE,
  SPECTATING_LINE,
  VOTE_HINT,
  clockText,
  initial,
  proposableTeams,
  reasonLine,
  teamLobbyBody,
  type TeamLobbyCallbacks,
} from "./team-lobby-screen.js";

/** Just enough DOM for the Team Lobby's body; the unit tests run in Node. */
class FakeElement {
  className = "";
  textContent = "";
  title = "";
  value = "";
  disabled = false;
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

  change(value: string): void {
    this.value = value;
    this.listeners.get("change")?.();
  }
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
    character: null,
    bot,
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
): LobbySnapshot {
  const team = players.find((p) => p.sessionId === self)?.team ?? null;
  return {
    selfSessionId: self,
    code: "ACDEFG",
    phase: "team-lobby",
    mode: "hosted-game",
    mapId: "arena",
    open: true,
    hostId: "aria",
    players,
    isHost: self === "aria",
    countdownSeconds: null,
    teamLobby: {
      stage,
      secondsLeft: 38,
      sides: team === 0 ? [side, null] : team === 1 ? [null, side] : [null, null],
    },
  };
}

function team(id: string, name: string, size: number): StoredTeam {
  const character = {
    id: "c",
    name: "Member",
    primaryProfession: "warrior" as const,
    secondaryProfession: undefined,
    attributes: [],
    skillBar: [],
    equipment: { weapon: null, offhand: null, armor: null },
  };
  return {
    schemaVersion: 1,
    id,
    name,
    members: Array.from({ length: size }, () => ({ character })),
    rulesetId: "r",
    updatedAt: 0,
  } as unknown as StoredTeam;
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
    expect(reasonLine({ ...SUNRISE, proposerId: null, reason: "house" }, [])).toBe("House team");
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

  it("offers only the Team Builds of the side's exact size", () => {
    expect(proposableTeams([team("a", "Duo", 2), team("b", "Four", 4)], 4)).toEqual([
      { id: "a", label: "Duo (needs 4 characters)", disabled: true },
      { id: "b", label: "Four", disabled: false },
    ]);
    expect(proposableTeams([team("a", "Duo", 2)], 1)[0]?.label).toBe("Duo (needs 1 character)");
  });
});

describe("the Team Lobby's body (#1460)", () => {
  let sent: { kind: string; value: string | number | null | undefined }[];
  const callbacks: TeamLobbyCallbacks = {
    onVote: (proposerId) => sent.push({ kind: "vote", value: proposerId }),
    onPropose: (teamId) => sent.push({ kind: "propose", value: teamId }),
    onClaim: (slot) => sent.push({ kind: "claim", value: slot }),
    onToggleReady: () => undefined,
    onLeave: () => undefined,
  };
  const body = (
    shown: LobbySnapshot,
    teams: readonly StoredTeam[] = [],
    proposed?: string,
  ): FakeElement => {
    const root = new FakeElement();
    root.append(...(teamLobbyBody(shown, teams, proposed, callbacks) as unknown as FakeElement[]));
    return root;
  };

  beforeEach(() => {
    sent = [];
    vi.stubGlobal("document", { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws a card per proposal with its proposer, captain crown and voters' initials", () => {
    const shown = body(
      lobby(
        "brann",
        "vote",
        voteSide([proposal("aria", ["aria", "cass"]), proposal("brann", ["brann"])]),
      ),
    );
    const cards = shown.all("team-lobby-card");
    expect(cards.map((card) => card.all("team-lobby-name-text")[0]?.textContent)).toEqual([
      "Aria",
      "Brann",
    ]);
    expect(cards.map((card) => card.all("team-lobby-captain").length)).toEqual([1, 0]);
    expect(cards[0]?.all("team-lobby-token").map((token) => token.textContent)).toEqual(["A", "C"]);
    expect(cards.map((card) => card.all("team-lobby-count")[0]?.textContent)).toEqual(["2", "1"]);
    expect(cards[0]?.all("character-dot")).toHaveLength(4);
    // A circle shows its professions' icons, never their letters (#1785).
    const letters = new RegExp(
      `\\b(${Object.values(PROFESSIONS)
        .map((profession) => profession.abbreviation)
        .join("|")})\\b`,
    );
    for (const dot of shown.all("character-dot")) {
      expect(dot.text()).not.toMatch(letters);
    }
    // Brann's own vote is marked, and only it.
    expect(cards.map((card) => card.attributes.get("aria-pressed"))).toEqual(["false", "true"]);
    expect(cards[1]?.text()).toContain("Your vote ✓");
    expect(shown.all("team-lobby-hint").map((hint) => hint.textContent)).toEqual([VOTE_HINT]);
  });

  it("votes for a card on a click, and withdraws on a click on its own vote", () => {
    const cards = body(
      lobby("brann", "vote", voteSide([proposal("aria", []), proposal("brann", ["brann"])])),
    ).all("team-lobby-card");
    cards[0]?.click();
    cards[1]?.click();
    expect(sent).toEqual([
      { kind: "vote", value: "aria" },
      { kind: "vote", value: null },
    ]);
  });

  it("proposes only a Team Build of the side's size, and None withdraws", () => {
    const shown = body(
      lobby("aria", "vote", voteSide([])),
      [team("duo", "Duo", 2), team("four", "Four", 4)],
      "four",
    );
    const [select] = shown.all("team-lobby-propose").flatMap((label) => label.children.slice(1));
    expect(select?.children.map((option) => [option.textContent, option.disabled])).toEqual([
      ["None", false],
      ["Duo (needs 4 characters)", true],
      ["Four", false],
    ]);
    expect(select?.value).toBe("four");
    select?.change("");
    select?.change("four");
    expect(sent).toEqual([
      { kind: "propose", value: undefined },
      { kind: "propose", value: "four" },
    ]);
  });

  it("shows one dashed card when nobody proposed", () => {
    const cards = body(lobby("aria", "vote", voteSide([]))).all("team-lobby-card");
    expect(cards.map((card) => [card.textContent, card.has("is-empty")])).toEqual([
      [NO_PROPOSALS, true],
    ]);
  });

  it("gives a side of one player no vote hint", () => {
    const shown = body(lobby("eli", "vote", { ...voteSide([proposal("eli", [])]), size: 1 }));
    expect(shown.all("team-lobby-hint")).toEqual([]);
    expect(shown.all("team-lobby-card")).toHaveLength(1);
  });

  it("shows a spectator one line and nothing of either side", () => {
    const shown = body(lobby("watcher", "vote", voteSide([proposal("aria", [])])));
    expect(shown.text()).toBe(SPECTATING_LINE);
  });

  it("lifts the chosen build, fades the rest, and says why", () => {
    // The vote first: the claim's state carries no proposals.
    body(
      lobby("brann", "vote", voteSide([proposal("aria", ["aria"]), proposal("brann", ["brann"])])),
    );
    const shown = body(lobby("brann", "claim", claimSide([null, null, null, null])));
    const cards = shown.all("team-lobby-result")[0]?.all("team-lobby-card") ?? [];
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
    expect(cards[1]?.disabled).toBe(true);
    expect(shown.all("team-lobby-reason").map((line) => line.textContent)).toEqual([
      "Tie: captain's pick",
    ]);
    expect(shown.all("team-lobby-seats-line").map((line) => line.textContent)).toEqual([
      SEATS_LINE,
    ]);
  });

  it("seats: a free one is taken, your own let go, someone else's is locked", () => {
    const seats = body(lobby("brann", "claim", claimSide(["aria", "brann", null, null]))).all(
      "team-lobby-seat",
    );
    expect(seats.map((seat) => seat.all("team-lobby-seat-name")[0]?.text())).toEqual([
      "Bram",
      "Mira",
      "Ash",
      "Tove",
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

  it("names the house team when nobody proposed", () => {
    body(lobby("aria", "vote", voteSide([])));
    const shown = body(
      lobby("aria", "claim", {
        ...claimSide([null, null, null, null]),
        chosen: { ...SUNRISE, proposerId: null, reason: "house" },
      }),
    );
    const cards = shown.all("team-lobby-card");
    expect(cards.map((card) => card.all("team-lobby-name-text")[0]?.textContent)).toEqual([
      "House team",
    ]);
    expect(shown.all("team-lobby-reason")[0]?.textContent).toBe("House team");
  });
});
