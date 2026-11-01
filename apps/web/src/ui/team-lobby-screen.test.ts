import type {
  WireProposalBuild,
  WireTeamLobby,
  WireTeamProposal,
  WireTeamSide,
} from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredTeam } from "../storage/schema.js";
import type { FigureLook } from "./character-card.js";
import type * as Figure from "./character-figure.js";
import {
  NO_PROPOSALS,
  NO_TEAM_BUILDS,
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

// The figure draws on a canvas, which Node has none of: a bare one,
// naming what it holds as the real one does.
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
}

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
  proposalBuilds: LobbySnapshot["proposalBuilds"] = new Map(),
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
    queueNonce: null,
    ascentRound: null,
    proposalBuilds,
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
    const duo = team("a", "Duo", 2);
    const four = team("b", "Four", 4);
    expect(proposableTeams([duo, four], 4, 1)).toEqual([
      { team: duo, disabled: true, reason: "needs 4 characters" },
      { team: four, disabled: false, reason: undefined },
    ]);
    expect(proposableTeams([duo], 1, 1)[0]?.reason).toBe("needs 1 character");
  });

  it("offers a Hosted Game's side any Team Build with a slot for each of its players (#2029)", () => {
    const solo = team("a", "Solo", 1);
    const duo = team("b", "Duo", 2);
    const eight = team("c", "Eight", 8);
    expect(proposableTeams([solo, duo, eight], null, 2)).toEqual([
      { team: solo, disabled: true, reason: "needs at least 2 characters" },
      { team: duo, disabled: false, reason: undefined },
      { team: eight, disabled: false, reason: undefined },
    ]);
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
    vi.stubGlobal("document", {
      createElement: (tag: string) =>
        Object.assign(new FakeElement(), { tagName: tag.toUpperCase() }),
    });
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
    expect(shown.all("team-lobby-hint").map((hint) => hint.textContent)).toEqual([VOTE_HINT]);
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

  it("shows each saved Team Build as a card to propose, and a click on yours withdraws it (#1862)", () => {
    const shown = body(
      lobby("aria", "vote", voteSide([])),
      [team("duo", "Duo", 2), team("four", "Four", 4), team("quad", "Quad", 4)],
      "four",
    );
    const own = shown.all("team-lobby-own-cards")[0]?.all("play-card") ?? [];
    expect(own.map((card) => card.all("play-card-name")[0]?.textContent)).toEqual([
      "Duo",
      "Four",
      "Quad",
    ]);
    expect(own[1]?.all("character-figure")).toHaveLength(4);
    // The one proposed is marked, and only it.
    expect(own.map((card) => press(card)?.attributes.get("aria-pressed"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(own.map((card) => card.has("is-proposed"))).toEqual([false, true, false]);
    expect(own[1]?.text()).toContain("Proposed ✓");
    press(own[2])?.click();
    press(own[1])?.click();
    expect(sent).toEqual([
      { kind: "propose", value: "quad" },
      { kind: "propose", value: undefined },
    ]);
  });

  it("shows a Team Build of the wrong size faded, its press disabled, and says why", () => {
    const [duo] =
      body(lobby("aria", "vote", voteSide([])), [team("duo", "Duo", 2)])
        .all("team-lobby-own-cards")[0]
        ?.all("play-card") ?? [];
    expect(press(duo)?.disabled).toBe(true);
    expect(duo?.has("is-faded")).toBe(true);
    expect(duo?.all("team-lobby-needs").map((line) => line.textContent)).toEqual([
      "needs 4 characters",
    ]);
  });

  it("says where to make a Team Build when you have none, with no cards and no dropdown", () => {
    const shown = body(lobby("aria", "vote", voteSide([])));
    expect(shown.all("team-lobby-own-cards")).toEqual([]);
    expect(shown.all("team-lobby-no-teams").map((line) => line.textContent)).toEqual([
      NO_TEAM_BUILDS,
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
    expect(shown.all("team-lobby-empty").map((box) => box.textContent)).toEqual([NO_PROPOSALS]);
  });

  it("gives a side of one player no vote hint", () => {
    const shown = body(lobby("eli", "vote", { ...voteSide([proposal("eli", [])]), size: 1 }));
    expect(shown.all("team-lobby-hint")).toEqual([]);
    expect(shown.all("play-card")).toHaveLength(1);
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
      SEATS_LINE,
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

  it("names the house team when nobody proposed", () => {
    body(lobby("aria", "vote", voteSide([])));
    const shown = body(
      lobby("aria", "claim", {
        ...claimSide([null, null, null, null]),
        chosen: { ...SUNRISE, proposerId: null, reason: "house" },
      }),
    );
    const cards = shown.all("play-card");
    expect(cards.map((card) => card.all("team-lobby-name-text")[0]?.textContent)).toEqual([
      "House team",
    ]);
    expect(shown.all("team-lobby-reason")[0]?.textContent).toBe("House team");
  });
});
