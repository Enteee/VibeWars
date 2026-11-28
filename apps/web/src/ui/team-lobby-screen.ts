import { PROFESSIONS, STARTER_TEAMS, type StarterTeam } from "@vibewars/game-core";
import type {
  WireProposalBuild,
  WireTeamChoice,
  WireTeamProposal,
  WireTeamSide,
} from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import { ownBody } from "../cosmetics/view.js";
import { locale, t } from "../i18n/index.js";
import { validateBuild } from "../storage/build-validation.js";
import type { StoredCharacter, StoredTeam, TeamCharacter } from "../storage/schema.js";
import {
  characterFigureCard,
  lookOfCharacter,
  lookOfWire,
  teamFigureCard,
  type TeamFigureMember,
} from "./character-card.js";
import { professionLabel } from "./character-preview.js";
import { button, h, playCard, screenBar, syncList, wordmark } from "./kit.js";
import { SIGNET_ROW_PX, signetElement, signetOf } from "./player-label.js";
import { memberCount, validateTeam } from "./team-builder.js";

/**
 * The Team Lobby screen (#1460, #1449 variant B, the card table): while
 * the lobby's phase is `"team-lobby"`, a side votes on proposed Team
 * Builds, cards with the voters' initials on them, then takes the chosen
 * one's characters as seats. It shows the player's own side only; the
 * host (#1458) decides everything, this only draws it and asks.
 */

export interface TeamLobbyCallbacks {
  /** Vote for `proposerId`'s proposal. */
  readonly onVote: (proposerId: string) => void;
  /** Propose the saved Team Build `teamId`, or withdraw with `undefined`. */
  readonly onPropose: (teamId: string | undefined) => void;
  /** Take seat `slot` of the chosen build. */
  readonly onClaim: (slot: number) => void;
  /** At 1v1 (#2387), play the character of the chooser's entry `key`. */
  readonly onPickSolo: (key: string) => void;
  readonly onLeave: () => void;
}

/** One character a 1v1 can play (#2387): a saved one, or a Team Build's member. */
export interface SoloEntry {
  /** `character:<id>`, or `team:<teamId>:<seat>`. */
  readonly key: string;
  readonly character: TeamCharacter | StoredCharacter;
  /** The Team Build's name, for a member of one. */
  readonly team: string | undefined;
  readonly legal: boolean;
}

/** A 1v1's chooser: its entries, and the one picked, the active character until a click. */
export interface SoloChoice {
  readonly entries: readonly SoloEntry[];
  readonly picked: string | undefined;
}

/** The key of the saved character `id` in a 1v1's chooser. */
export function soloCharacterKey(id: string): string {
  return `character:${id}`;
}

/**
 * Everything a 1v1 can play (#2387): the saved characters in the order
 * given, then every Team Build's members, teams by name, each in seat
 * order. A member is its own copy, so one also saved alone is listed twice.
 */
export function soloEntries(
  characters: readonly StoredCharacter[],
  teams: readonly StoredTeam[],
): SoloEntry[] {
  const entry = (
    key: string,
    character: TeamCharacter | StoredCharacter,
    team: string | undefined,
  ): SoloEntry => ({ key, character, team, legal: validateBuild(character).length === 0 });
  return [
    ...characters.map((character) => entry(soloCharacterKey(character.id), character, undefined)),
    ...[...teams]
      .sort((a, b) => a.name.localeCompare(b.name, locale()))
      .flatMap((team) =>
        team.members.map((member, seat) =>
          entry(`team:${team.id}:${String(seat)}`, member.character, team.name),
        ),
      ),
  ];
}
/** The builds drawer's search found nothing (#2116). */
export function noTeamBuildNamed(query: string): string {
  return t("teamLobby.noTeamBuildNamed", { query });
}
/** What the builds drawer lists (#2116): the side's size, and how many it leaves out. */
export function drawerShowing(size: number, hidden: number): string {
  return hidden === 0
    ? t("teamLobby.drawerShowing", { size })
    : t("teamLobby.drawerShowingHidden", { size, count: hidden });
}

/** Seconds as the clock shows them: 38 as "0:38". */
export function clockText(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60))}:${String(whole % 60).padStart(2, "0")}`;
}

/** A voter's token: the first letter of the name, "?" for none. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** Whether `team` is playable: no problems (#2110). */
function isPlayable(team: StoredTeam): boolean {
  return validateTeam(team).length === 0;
}

/**
 * `teams` a side of `size` can propose: Team Builds of that size
 * (#2104, #2109), complete, and with no problems (#2110): a team with
 * problems or an empty slot saves, but is not playable. The rest are
 * left out, never shown greyed.
 */
export function proposableTeams(teams: readonly StoredTeam[], size: number): readonly StoredTeam[] {
  return teams.filter((team) => team.size === size && isPlayable(team));
}

/** The builds drawer's rows (#2116): `teams` a side of `size` can propose, named like `query`. */
export interface DrawerRows {
  readonly rows: readonly StoredTeam[];
  /** Your playable Team Builds of other sizes, which no search shows. */
  readonly hiddenOtherSizes: number;
}

/**
 * The builds drawer's rows (#2116): the proposable `teams` of `size`
 * whose names hold `query`, any case. A Team Build with problems or an
 * empty slot is neither a row nor counted as hidden: it is not playable
 * (#2110, #2109).
 */
export function drawerRows(teams: readonly StoredTeam[], size: number, query: string): DrawerRows {
  const needle = query.trim().toLowerCase();
  return {
    rows: proposableTeams(teams, size).filter((team) => team.name.toLowerCase().includes(needle)),
    hiddenOtherSizes: teams.filter((team) => team.size !== size && isPlayable(team)).length,
  };
}

/** Who a card or a seat names, with their signet (#2820) when they have one. */
interface Person {
  readonly name: string;
  readonly signet: number | undefined;
}

/** The member at `sessionId`; the id itself, unsigned, for someone already gone. */
function personOf(players: readonly LobbyPlayerSnapshot[], sessionId: string): Person {
  const player = players.find((candidate) => candidate.sessionId === sessionId);
  return { name: player?.name ?? sessionId, signet: signetOf(player) };
}

/**
 * A proposal's members as the team card shows them (#1864): each
 * holding what the host sent it (#1811), labelled by its professions,
 * never its name (#1863).
 */
function cardMembers(
  members: readonly { readonly primary: string; readonly secondary: string | null }[],
  builds: readonly WireProposalBuild[] | undefined,
  preset?: StarterTeam,
): TeamFigureMember[] {
  return members.map((member, slot) => {
    const look = lookOfWire(member, builds?.[slot]);
    return {
      look,
      label:
        preset?.members[slot]?.name ??
        (look === undefined ? member.primary : professionLabel(look.primary, look.secondary)),
    };
  });
}

/** A name, with the captain's crown token after it when it is theirs. */
function personName(className: string, person: Person, captain: boolean): HTMLElement {
  const { name, signet } = person;
  const label = h("span", className);
  if (signet !== undefined) {
    label.appendChild(signetElement(signet, SIGNET_ROW_PX));
  }
  const text = h("span", "team-lobby-name-text", name);
  text.title = name;
  // A player typed it: it reads, and is cut at its end, in its own direction (#2655).
  text.dir = "auto";
  label.appendChild(text);
  if (captain) {
    const crown = h("span", "team-lobby-captain", t("teamLobby.captainMark"));
    crown.title = t("teamLobby.captain");
    crown.setAttribute("aria-label", t("teamLobby.captainLabel"));
    label.appendChild(crown);
  }
  return label;
}

/** One proposal's card: proposer, its members, voter tokens and count. */
export function proposalCard(
  proposal: WireTeamProposal,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  onVote: (proposerId: string) => void,
): HTMLElement {
  const mine = proposal.voterIds.includes(snapshot.selfSessionId);
  const proposer = personOf(snapshot.players, proposal.proposerId);
  const votes = h("span", "team-lobby-votes");
  const tokens = h("span", "team-lobby-tokens");
  for (const voterId of proposal.voterIds) {
    const voter = personOf(snapshot.players, voterId);
    const token = h("span", "team-lobby-token", initial(voter.name));
    if (voter.signet !== undefined) {
      token.prepend(signetElement(voter.signet, SIGNET_ROW_PX));
    }
    token.title = voter.name;
    token.classList.toggle("is-self", voterId === snapshot.selfSessionId);
    tokens.appendChild(token);
  }
  votes.append(tokens, h("span", "team-lobby-count", String(proposal.voterIds.length)));
  const card = teamFigureCard({
    title: personName("team-lobby-card-name", proposer, proposal.proposerId === side.captainId),
    members: cardMembers(proposal.members, snapshot.proposalBuilds.get(proposal.proposerId)),
    footer: mine ? [votes, h("span", "team-lobby-your-vote", t("teamLobby.yourVote"))] : [votes],
    // A vote can move to another card, never be taken back (#2872).
    onOpen: () => {
      if (!mine) {
        onVote(proposal.proposerId);
      }
    },
    pressed: mine,
    label: t("teamLobby.proposerBuild", { name: proposer.name }),
  });
  card.classList.toggle("is-voted", mine);
  return card;
}

/**
 * The preset team `choice` plays (#2148): the starter team its name and
 * size name, which the client holds as the host does. A proposal's, or
 * a size-1 side's nameless preset, is none.
 */
function presetOf(choice: WireTeamChoice): StarterTeam | undefined {
  return choice.proposerId === null
    ? STARTER_TEAMS.find(
        (team) => team.name === choice.presetName && team.members.length === choice.members.length,
      )
    : undefined;
}

/** What `choice`'s members hold, as the host sends a proposal's (#1811). */
function choiceBuilds(
  choice: WireTeamChoice,
  snapshot: LobbySnapshot,
): readonly WireProposalBuild[] | undefined {
  if (choice.proposerId !== null) {
    return snapshot.proposalBuilds.get(choice.proposerId);
  }
  return presetOf(choice)?.members.map(({ build }) => {
    const [set] = build.equipment.weaponSets;
    return {
      skills: [...build.skillBar],
      mainHand: set.mainHand.weaponId,
      offHand: set.offHand?.offhandId ?? null,
    };
  });
}

/**
 * Seat `slot` of the chosen build: its character as the character card
 * draws it (#1863), holding its weapons over its skills, and who sits in
 * it. Not its name: a seat is picked for what the character plays.
 */
export function seat(
  slot: number,
  choice: WireTeamChoice,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  onClaim: (slot: number) => void,
): HTMLElement {
  const character = choice.members[slot];
  const holder = side.claims[slot] ?? null;
  const mine = holder === snapshot.selfSessionId;
  // Your own seat stays yours (#2872); someone else's cannot be taken.
  const node = button("", "team-lobby-seat", () => {
    if (!mine) {
      onClaim(slot);
    }
  });
  node.disabled = holder !== null && !mine;
  // A Heroes' Ascent run keeps its seats (#2539): only a vacant one, by a member who holds none.
  const lock = snapshot.ascentLock;
  if (
    lock !== null &&
    (lock.slots.some((locked) => locked.claimedBy === snapshot.selfSessionId) ||
      (lock.slots[slot]?.claimedBy ?? null) !== null)
  ) {
    node.disabled = true;
  }
  node.classList.toggle("is-mine", mine);
  node.classList.toggle("is-taken", holder !== null && !mine);
  const holderPerson = holder === null ? undefined : personOf(snapshot.players, holder);
  const holderName = holderPerson?.name;
  const look =
    character === undefined
      ? undefined
      : lookOfWire(character, choiceBuilds(choice, snapshot)?.[slot]);
  // A preset's seat is its member's name (#2148): "AB Balanced 3 (Mo/Me)".
  const professions =
    character === undefined
      ? undefined
      : (presetOf(choice)?.members[slot]?.name ??
        (look === undefined ? character.primary : professionLabel(look.primary, look.secondary)));
  const free =
    lock !== null && professions !== undefined
      ? t("teamLobby.openSeat", { professions })
      : t("teamLobby.sitHere");
  if (professions !== undefined) {
    if (look === undefined) {
      node.append(
        h("span", "character-dot is-house", "?"),
        h("span", "play-card-line", professions),
      );
    } else {
      node.appendChild(characterFigureCard(look, { size: "card" }));
    }
    const label = t("teamLobby.seatLabel", { professions, holder: holderName ?? free });
    node.title = label;
    node.setAttribute("aria-label", label);
  }
  node.appendChild(
    holderPerson === undefined
      ? h("span", "team-lobby-seat-free", free)
      : personName("team-lobby-seat-holder", holderPerson, holder === side.captainId),
  );
  return node;
}

/** What the Team Lobby shows: the host's snapshot and the player's own picks. */
export interface TeamLobbyView {
  readonly snapshot: LobbySnapshot;
  /** The saved Team Builds, for the drawer. */
  readonly teams: readonly StoredTeam[];
  /** The player's own proposal, if any. */
  readonly proposedTeamId: string | undefined;
  readonly solo: SoloChoice;
  readonly notice: string | undefined;
}

/** The Team Lobby, mounted once (ADR-0030), updated in place on every lobby change. */
export interface TeamLobbyScreen {
  /** Show `view`, changing only what changed: the same view twice changes nothing. */
  update(view: TeamLobbyView): void;
  /** Esc's first job in the vote (#2116): put the open drawer away; true when it was. */
  readonly putAway: () => boolean;
  /** Whether this screen is still the one on its root: another screen may have drawn over it. */
  shown(): boolean;
  /** Stop the clock. */
  dispose(): void;
}

/**
 * Make `container` one element per item, keyed by `key` (ADR-0030): an
 * item whose `look` is unchanged keeps its element, with its focus,
 * hover and listeners; a changed one is drawn again in its place, and
 * the focus it held goes to the new one's first button, the page left
 * where it was scrolled (#3929).
 */
function syncDrawn<T>(
  container: HTMLElement,
  items: readonly T[],
  key: (item: T) => string,
  look: (item: T) => string,
  draw: (item: T) => HTMLElement,
): void {
  const focused = document.activeElement;
  const at =
    focused === null
      ? -1
      : Array.from(container.children).findIndex((child) => child.contains(focused));
  syncList(
    container,
    items,
    (item) => `${key(item)}\n${look(item)}`,
    draw,
    () => undefined,
  );
  if (at !== -1 && focused !== null && !container.contains(focused)) {
    const next = container.children[at];
    const target = next?.querySelector<HTMLElement>("button") ?? next;
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
    }
  }
}

/** What the screen is showing under the bar. */
type Region = "spectating" | "vote" | "solo" | "claim" | "none";

/**
 * Mount the Team Lobby on `root` (#3929, ADR-0030): the panel, the bar,
 * the drawer and the lists are built here once, and `update` changes in
 * place only what a lobby change changed, so a vote, a proposal or a
 * tick never drops the page's scroll, the drawer's, or the focus.
 */
export function mountTeamLobbyScreen(
  root: HTMLElement,
  callbacks: TeamLobbyCallbacks,
): TeamLobbyScreen {
  root.replaceChildren();
  const panel = h("div", "screen screen-team-lobby");
  panel.setAttribute("data-tutorial", "team-lobby");
  const notice = h("div", "screen-problem");
  notice.hidden = true;
  const stage = h("span", "team-lobby-stage");
  const clock = h("span", "team-lobby-clock");
  const status = h("div", "team-lobby-status");
  status.append(stage, clock);

  const drawer = buildsDrawer(callbacks.onPropose);
  const proposals = h("div", "play-cards team-lobby-proposals");
  const noProposals = h("div", "team-lobby-empty", t("teamLobby.noProposals"));
  const soloCards = h("div", "play-cards team-lobby-solo");
  const seats = h("div", "team-lobby-seats");
  const regions: Readonly<Record<Region, readonly HTMLElement[]>> = {
    spectating: [h("div", "screen-info team-lobby-spectating", t("teamLobby.spectating"))],
    vote: [
      drawer.tab,
      drawer.element,
      h("h3", "menu-column-title", t("teamLobby.proposals")),
      proposals,
    ],
    solo: [soloCards],
    claim: [seats, h("div", "screen-info team-lobby-seats-line", t("teamLobby.seatsLine"))],
    none: [],
  };
  let region: Region | undefined;
  let crumb: string | undefined;
  let clockFrom: string | undefined;
  let ticking: ReturnType<typeof setInterval> | undefined;
  panel.appendChild(notice);
  root.appendChild(panel);

  const show = (next: Region): void => {
    if (next === region) {
      return;
    }
    // The vote is over, or was never yours: the next one opens on a closed drawer.
    if (next !== "vote") {
      drawer.forget();
    }
    region = next;
    panel.replaceChildren(notice, ...regions[next]);
  };

  /** Count the clock down from the host's `secondsLeft`, sent only on a change. */
  const tick = (secondsLeft: number): void => {
    clearInterval(ticking);
    clock.textContent = clockText(secondsLeft);
    const endsAt = Date.now() + secondsLeft * 1000;
    // A match entered from the lobby never disposes it: the clock stops
    // itself once it has left the page.
    ticking = setInterval(() => {
      if (!clock.isConnected) {
        clearInterval(ticking);
        return;
      }
      clock.textContent = clockText(Math.ceil((endsAt - Date.now()) / 1000));
    }, 250);
  };

  const update = ({
    snapshot,
    teams,
    proposedTeamId,
    solo,
    notice: problem,
  }: TeamLobbyView): void => {
    const lobby = snapshot.teamLobby;
    if (lobby === null) {
      return;
    }
    const team = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId)?.team ?? null;
    const side = team === null || team === 2 ? null : lobby.sides[team];
    const title =
      team === null ? t("teamLobby.crumb") : t("teamLobby.crumbTeam", { team: team + 1 });
    if (title !== crumb) {
      crumb = title;
      screenBar({
        crumbs: [wordmark("topbar-wordmark"), title],
        back: { label: t("teamLobby.leave"), onBack: callbacks.onLeave },
        // Esc puts the builds drawer away before it leaves (#2116).
        putAway: drawer.putAway,
        status: [status],
        actions: [],
      });
    }
    stage.textContent = stageTitle(lobby.stage, side?.size);
    const from = `${lobby.stage}:${String(lobby.secondsLeft)}`;
    if (from !== clockFrom) {
      clockFrom = from;
      tick(lobby.secondsLeft);
    }
    notice.textContent = problem ?? "";
    notice.hidden = problem === undefined;
    // The drawer and its tab hang just below the top bar, however tall it wraps.
    const topbar = document.getElementById("topbar");
    if (topbar !== null) {
      panel.style.setProperty(
        "--team-lobby-drawer-top",
        `${String(topbar.getBoundingClientRect().bottom)}px`,
      );
    }

    if (side === null) {
      show("spectating");
    } else if (lobby.stage === "vote" && side.size === 1) {
      // A 1v1 picks one of the player's characters, not a Team Build (#2387).
      show("solo");
      syncSolo(soloCards, solo.entries, solo.picked, callbacks.onPickSolo);
    } else if (lobby.stage === "vote") {
      show("vote");
      drawer.update(teams, side.size, proposedTeamId);
      syncProposals(proposals, noProposals, side, snapshot, callbacks.onVote);
    } else if (side.chosen === null || side.size === 1) {
      // A 1v1 takes its one seat itself (#2387), so has none to show.
      show("none");
    } else {
      show("claim");
      syncSeats(seats, side, side.chosen, snapshot, callbacks.onClaim);
    }
  };

  return {
    update,
    putAway: drawer.putAway,
    shown: () => panel.parentElement === root,
    dispose: () => {
      clearInterval(ticking);
      drawer.forget();
    },
  };
}

/** The vote's cards, one per proposal, by proposer; one dashed box while nobody proposed. */
function syncProposals(
  cards: HTMLElement,
  empty: HTMLElement,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  onVote: (proposerId: string) => void,
): void {
  if (side.proposals.length === 0) {
    if (cards.children.length !== 1 || cards.children[0] !== empty) {
      cards.replaceChildren(empty);
    }
    return;
  }
  syncDrawn(
    cards,
    side.proposals,
    (proposal) => proposal.proposerId,
    (proposal) =>
      JSON.stringify([
        proposal,
        proposal.proposerId === side.captainId,
        snapshot.selfSessionId,
        [proposal.proposerId, ...proposal.voterIds].map((id) => personOf(snapshot.players, id)),
        snapshot.proposalBuilds.get(proposal.proposerId),
      ]),
    (proposal) => proposalCard(proposal, side, snapshot, onVote),
  );
}

/** The claim's seats, one per member of the chosen build. */
function syncSeats(
  seats: HTMLElement,
  side: WireTeamSide,
  choice: WireTeamChoice,
  snapshot: LobbySnapshot,
  onClaim: (slot: number) => void,
): void {
  // Whatever a seat draws from, but the slot: who sits where, and the build.
  const drawnFrom = JSON.stringify([
    choice,
    side.claims,
    side.captainId,
    snapshot.selfSessionId,
    snapshot.ascentLock,
    snapshot.players.map((player) => personOf(snapshot.players, player.sessionId)),
    choiceBuilds(choice, snapshot),
  ]);
  syncDrawn(
    seats,
    choice.members.map((_, slot) => slot),
    String,
    () => drawnFrom,
    (slot) => seat(slot, choice, side, snapshot, onClaim),
  );
}

/**
 * The Your Team Builds drawer (#2116): the tab on the right edge and
 * the drawer it opens, over the lobby's right side and never dimming
 * it, so the vote stays clickable beside it. Its state, open, search
 * and one expanded row, lives as long as the screen and outlives every
 * snapshot; the vote's end forgets it.
 */
interface BuildsDrawer {
  readonly tab: HTMLButtonElement;
  readonly element: HTMLElement;
  update(teams: readonly StoredTeam[], size: number, proposedTeamId: string | undefined): void;
  /** Close it, focus back on its tab; true when it was open. */
  readonly putAway: () => boolean;
  /** Closed, its search empty, nothing expanded. */
  forget(): void;
}

/** A member's professions as a chip: "W/Mo". */
function professionChip({ character }: StoredTeam["members"][number]): HTMLElement {
  const secondary = character.secondaryProfession;
  const chip = h(
    "span",
    "team-lobby-drawer-chip",
    PROFESSIONS[character.primaryProfession].abbreviation +
      (secondary === undefined ? "" : `/${PROFESSIONS[secondary].abbreviation}`),
  );
  chip.title = professionLabel(character.primaryProfession, secondary);
  return chip;
}

/**
 * One of your Team Builds in the drawer (#2116): a compact row, which a
 * click expands to its members, holding their weapons and skills, and
 * the button that proposes it, or withdraws it when it is yours (#1862).
 */
function drawerRow(
  team: StoredTeam,
  proposed: boolean,
  expanded: boolean,
  onToggle: () => void,
  onPropose: (teamId: string | undefined) => void,
): { readonly row: HTMLElement; readonly head: HTMLButtonElement } {
  const row = h("div", "team-lobby-drawer-row");
  row.classList.toggle("is-proposed", proposed);
  row.classList.toggle("is-expanded", expanded);
  const head = button("", "team-lobby-drawer-row-head", onToggle);
  head.setAttribute("aria-expanded", String(expanded));
  head.setAttribute("aria-label", team.name);
  const title = h("span", "team-lobby-drawer-row-title");
  title.appendChild(h("span", "team-lobby-drawer-row-name", team.name));
  if (proposed) {
    title.appendChild(h("span", "team-lobby-drawer-tag", t("teamLobby.proposed")));
  }
  title.appendChild(h("span", "team-lobby-drawer-row-size", memberCount(team.members.length)));
  const chips = h("span", "team-lobby-drawer-chips");
  chips.append(...team.members.map(professionChip));
  head.append(title, chips);
  row.appendChild(head);
  if (expanded) {
    const members = h("div", "team-lobby-drawer-members");
    for (const { character } of team.members) {
      const member = h("div", "team-lobby-drawer-member");
      const name = h("b", "team-lobby-drawer-member-name", character.name);
      name.title = character.name;
      member.append(
        name,
        // No cape: a team's members wear none, as on Team Builder.
        characterFigureCard(lookOfCharacter(character, undefined, ownBody()), { size: "card" }),
      );
      members.appendChild(member);
    }
    const action = button(
      t(proposed ? "teamLobby.withdrawProposal" : "teamLobby.proposeBuild"),
      proposed ? "team-lobby-drawer-go" : "primary team-lobby-drawer-go",
      () => {
        onPropose(proposed ? undefined : team.id);
      },
    );
    row.append(members, action);
  }
  return { row, head };
}

/** The drawer, built once per screen; `update` and the player's typing redraw only its rows. */
function buildsDrawer(onPropose: (teamId: string | undefined) => void): BuildsDrawer {
  const state: { open: boolean; query: string; expanded: string | undefined } = {
    open: false,
    query: "",
    expanded: undefined,
  };
  let shown: {
    readonly teams: readonly StoredTeam[];
    readonly size: number;
    readonly proposedTeamId: string | undefined;
  } = { teams: [], size: 0, proposedTeamId: undefined };

  const element = h("aside", "team-lobby-drawer");
  const drawerName = t("teamLobby.buildsDrawer");
  element.setAttribute("aria-label", drawerName);
  const tab = button(`${drawerName} ▾`, "team-lobby-drawer-tab", () => {
    if (state.open) {
      close();
    } else {
      open();
    }
  });
  tab.setAttribute("aria-label", drawerName);
  // The menu quest's arena step points at both (#3544).
  tab.setAttribute("data-tutorial", "team-builds");
  element.setAttribute("data-tutorial", "team-builds");
  const closeButton = button(t("teamLobby.escClose"), "team-lobby-drawer-close", () => {
    close();
  });
  closeButton.setAttribute("aria-label", t("teamLobby.closeBuildsDrawer"));
  const head = h("div", "team-lobby-drawer-head");
  head.append(h("h3", "team-lobby-drawer-title", drawerName), closeButton);

  const search = document.createElement("input");
  search.type = "search";
  search.className = "team-lobby-drawer-search";
  search.placeholder = t("teamLobby.search");
  search.setAttribute("aria-label", t("teamLobby.searchLabel"));
  const body = h("div", "team-lobby-drawer-body");
  const noTeams = h("div", "screen-info team-lobby-no-teams");
  const showing = h("div", "team-lobby-drawer-showing");
  const noMatch = h("div", "team-lobby-drawer-empty");
  const list = h("div", "team-lobby-drawer-list");
  const heads = new Map<string, HTMLButtonElement>();

  /** The body's parts, put in again only when which of them show changes. */
  const parts = (wanted: readonly HTMLElement[]): void => {
    const there = Array.from(body.children);
    if (there.length !== wanted.length || wanted.some((part, index) => there[index] !== part)) {
      body.replaceChildren(...wanted);
    }
  };

  const fill = (): void => {
    const { teams, size, proposedTeamId } = shown;
    const proposable = proposableTeams(teams, size);
    search.hidden = proposable.length === 0;
    if (proposable.length === 0) {
      const ofSize = teams.some((team) => team.members.length === size);
      // Every Team Build of the size has problems (#2110), or none is the side's size (#2104).
      noTeams.textContent =
        teams.length === 0
          ? t("teamLobby.noTeamBuilds")
          : ofSize
            ? t("teamLobby.noPlayableTeamBuilds")
            : t("teamLobby.noTeamBuildOf", { size });
      parts([noTeams]);
      return;
    }
    const { rows, hiddenOtherSizes } = drawerRows(teams, size, state.query);
    showing.textContent = drawerShowing(size, hiddenOtherSizes);
    noMatch.textContent = noTeamBuildNamed(state.query.trim());
    parts(rows.length === 0 ? [showing, noMatch, list] : [showing, list]);
    syncDrawn(
      list,
      rows,
      (team) => team.id,
      (team) => JSON.stringify([team, team.id === proposedTeamId, team.id === state.expanded]),
      (team) => {
        const { row, head: rowHead } = drawerRow(
          team,
          team.id === proposedTeamId,
          team.id === state.expanded,
          () => {
            state.expanded = state.expanded === team.id ? undefined : team.id;
            fill();
            heads.get(team.id)?.focus({ preventScroll: true });
          },
          (teamId) => {
            onPropose(teamId);
            close();
          },
        );
        heads.set(team.id, rowHead);
        return row;
      },
    );
  };

  const place = (): void => {
    element.hidden = !state.open;
    tab.setAttribute("aria-expanded", String(state.open));
    tab.classList.toggle("is-open", state.open);
  };
  const open = (): void => {
    state.open = true;
    place();
    (search.hidden ? closeButton : search).focus();
  };
  const close = (): void => {
    state.open = false;
    state.expanded = undefined;
    place();
    fill();
    tab.focus({ preventScroll: true });
  };
  search.addEventListener("input", () => {
    state.query = search.value;
    fill();
  });
  // A search field keeps its own Esc (kit.ts): this one's closes the drawer.
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });

  place();
  element.append(head, search, body);
  return {
    tab,
    element,
    update: (teams, size, proposedTeamId) => {
      shown = { teams, size, proposedTeamId };
      fill();
    },
    putAway: () => {
      if (!state.open) {
        return false;
      }
      close();
      return true;
    },
    forget: () => {
      state.open = false;
      state.query = "";
      state.expanded = undefined;
      search.value = "";
      place();
    },
  };
}

/**
 * The title of `stage` (#2387): a 1v1 chooses a character, every one of
 * the player's, one click plays one, then starts.
 */
function stageTitle(stage: "vote" | "claim", size: number | undefined): string {
  if (size === 1) {
    return t(stage === "vote" ? "teamLobby.soloTitle" : "teamLobby.soloStarting");
  }
  return t(stage === "vote" ? "teamLobby.voteTitle" : "teamLobby.claimTitle");
}

/**
 * A 1v1's chooser (#2387): every character the player has, `picked`
 * pressed. An illegal one is shown, tagged and explained, never picked.
 */
function syncSolo(
  cards: HTMLElement,
  entries: readonly SoloEntry[],
  picked: string | undefined,
  onPick: (key: string) => void,
): void {
  syncDrawn(
    cards,
    entries,
    (entry) => entry.key,
    (entry) => JSON.stringify([entry, entry.key === picked]),
    (entry) => soloCard(entry, entry.key === picked, onPick),
  );
}

function soloCard(entry: SoloEntry, picked: boolean, onPick: (key: string) => void): HTMLElement {
  const content = [
    characterFigureCard(lookOfCharacter(entry.character, undefined, ownBody()), {
      size: "card",
      note: entry.team === undefined ? undefined : t("teamLobby.teamNote", { team: entry.team }),
    }),
  ];
  const card = playCard({
    name: entry.character.name,
    tags: entry.legal ? [] : [h("span", "roster-invalid-tag", t("teamLobby.invalid"))],
    content,
    pressed: picked && entry.legal,
    disabled: !entry.legal,
    onOpen: () => {
      if (entry.legal) {
        onPick(entry.key);
      }
    },
  });
  card.classList.add("character-card");
  if (!entry.legal) {
    card.classList.add("is-invalid");
    card.title = validateBuild(entry.character)
      .map((problem) => problem.message)
      .join("\n");
  }
  return card;
}
