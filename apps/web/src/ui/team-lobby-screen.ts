import type {
  WireProposalBuild,
  WireTeamChoice,
  WireTeamProposal,
  WireTeamSide,
} from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import type { StoredTeam } from "../storage/schema.js";
import {
  characterFigureCard,
  lookOfCharacter,
  lookOfWire,
  teamFigureCard,
  type TeamFigureMember,
} from "./character-card.js";
import { professionLabel } from "./character-preview.js";
import { button, h, screenBar } from "./kit.js";

/**
 * The Team Lobby screen (#1460, #1449 variant B, the card table): while
 * the lobby's phase is `"team-lobby"`, a side votes on proposed Team
 * Builds, cards with the voters' initials on them, then takes the chosen
 * one's characters as seats. It shows the player's own side only; the
 * host (#1458) decides everything, this only draws it and asks.
 */

export interface TeamLobbyCallbacks {
  /** Vote for `proposerId`'s proposal, or withdraw with `null`. */
  readonly onVote: (proposerId: string | null) => void;
  /** Propose the saved Team Build `teamId`, or withdraw with `undefined`. */
  readonly onPropose: (teamId: string | undefined) => void;
  /** Take seat `slot` of the chosen build, or leave yours with `null`. */
  readonly onClaim: (slot: number | null) => void;
  readonly onToggleReady: () => void;
  readonly onLeave: () => void;
}

export const VOTE_TITLE = "Choose a team build";
export const CLAIM_TITLE = "Take a character";
export const VOTE_HINT = "Click a card to vote";
export const SPECTATING_LINE = "Teams are choosing their builds";
export const NO_PROPOSALS = "No proposals: the house team plays";
export const NO_TEAM_BUILDS = "You have no Team Builds. Make one in Team Play.";
export const SEATS_LINE =
  "Unclaimed seats are filled when the clock ends: players first, then bots.";
export const HOUSE_TEAM = "House team";

/** Why the chosen build won, as the line under it reads. */
export type ReasonLine =
  | "Most votes"
  | "Tie: captain's pick"
  | "Tie: picked at random"
  | "No votes: picked at random"
  | "House team";

/**
 * The reason line for `choice`. The host says `"random"` both for a tie
 * and for a vote nobody cast; `proposals`, the last the vote showed, tell
 * the two apart.
 */
export function reasonLine(
  choice: WireTeamChoice,
  proposals: readonly WireTeamProposal[],
): ReasonLine {
  switch (choice.reason) {
    case "votes":
      return "Most votes";
    case "captain":
      return "Tie: captain's pick";
    case "random":
      return proposals.some((proposal) => proposal.voterIds.length > 0)
        ? "Tie: picked at random"
        : "No votes: picked at random";
    case "house":
      return "House team";
  }
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

/** A saved Team Build as the propose cards show it (#1862). */
export interface ProposableTeam {
  readonly team: StoredTeam;
  /** Not the side's size, so the host would refuse it (Q182). */
  readonly disabled: boolean;
  /** Why it is disabled, as a line on its card: "needs 4 characters". */
  readonly reason: string | undefined;
}

/**
 * `teams` for a side of `size`: only those of exactly `size` members can
 * be proposed. A Hosted Game's side, `size` `null`, takes any with a slot
 * for each of its `players` (#2029).
 */
export function proposableTeams(
  teams: readonly StoredTeam[],
  size: number | null,
  players: number,
): readonly ProposableTeam[] {
  const least = size ?? players;
  const characters = `${String(least)} ${least === 1 ? "character" : "characters"}`;
  const needs = size === null ? `needs at least ${characters}` : `needs ${characters}`;
  return teams.map((team) => {
    const count = team.members.length;
    const disabled = size === null ? count < players : count !== size;
    return { team, disabled, reason: disabled ? needs : undefined };
  });
}

/** The member at `sessionId`'s name, or the id itself for someone already gone. */
function nameOf(players: readonly LobbyPlayerSnapshot[], sessionId: string): string {
  return players.find((player) => player.sessionId === sessionId)?.name ?? sessionId;
}

/**
 * A proposal's members as the team card shows them (#1864): each
 * holding what the host sent it (#1811), labelled by its professions,
 * never its name (#1863).
 */
function cardMembers(
  members: readonly { readonly primary: string; readonly secondary: string | null }[],
  builds: readonly WireProposalBuild[] | undefined,
): TeamFigureMember[] {
  return members.map((member, slot) => {
    const look = lookOfWire(member, builds?.[slot]);
    return {
      look,
      label: look === undefined ? member.primary : professionLabel(look.primary, look.secondary),
    };
  });
}

/** A name, with the captain's crown token after it when it is theirs. */
function personName(className: string, name: string, captain: boolean): HTMLElement {
  const label = h("span", className);
  const text = h("span", "team-lobby-name-text", name);
  text.title = name;
  label.appendChild(text);
  if (captain) {
    const crown = h("span", "team-lobby-captain", "C");
    crown.title = "Captain";
    crown.setAttribute("aria-label", "captain");
    label.appendChild(crown);
  }
  return label;
}

/** One proposal's card: proposer, its members, voter tokens and count. */
export function proposalCard(
  proposal: WireTeamProposal,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  onVote: ((proposerId: string | null) => void) | undefined,
): HTMLElement {
  const mine = proposal.voterIds.includes(snapshot.selfSessionId);
  const proposer = nameOf(snapshot.players, proposal.proposerId);
  const votes = h("span", "team-lobby-votes");
  const tokens = h("span", "team-lobby-tokens");
  for (const voterId of proposal.voterIds) {
    const name = nameOf(snapshot.players, voterId);
    const token = h("span", "team-lobby-token", initial(name));
    token.title = name;
    token.classList.toggle("is-self", voterId === snapshot.selfSessionId);
    tokens.appendChild(token);
  }
  votes.append(tokens, h("span", "team-lobby-count", String(proposal.voterIds.length)));
  const card = teamFigureCard({
    title: personName("team-lobby-card-name", proposer, proposal.proposerId === side.captainId),
    members: cardMembers(proposal.members, snapshot.proposalBuilds.get(proposal.proposerId)),
    footer: mine ? [votes, h("span", "team-lobby-your-vote", "Your vote ✓")] : [votes],
    // A click on your own vote takes it back.
    onOpen: () => {
      onVote?.(mine ? null : proposal.proposerId);
    },
    pressed: mine,
    disabled: onVote === undefined,
    label: `${proposer}'s team build`,
  });
  card.classList.toggle("is-voted", mine);
  return card;
}

/** The chosen build as a card: its proposer, or the house team, and its characters. */
function chosenCard(
  choice: WireTeamChoice,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
): HTMLElement {
  const card = teamFigureCard({
    title:
      choice.proposerId === null
        ? personName("team-lobby-card-name", HOUSE_TEAM, false)
        : personName(
            "team-lobby-card-name",
            nameOf(snapshot.players, choice.proposerId),
            choice.proposerId === side.captainId,
          ),
    members: cardMembers(
      choice.members,
      choice.proposerId === null ? undefined : snapshot.proposalBuilds.get(choice.proposerId),
    ),
  });
  card.classList.add("is-chosen");
  return card;
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
  onClaim: (slot: number | null) => void,
): HTMLElement {
  const character = choice.members[slot];
  const holder = side.claims[slot] ?? null;
  const mine = holder === snapshot.selfSessionId;
  // Your own seat lets go; someone else's cannot be taken.
  const node = button("", "team-lobby-seat", () => {
    onClaim(mine ? null : slot);
  });
  node.disabled = holder !== null && !mine;
  node.classList.toggle("is-mine", mine);
  node.classList.toggle("is-taken", holder !== null && !mine);
  const holderName = holder === null ? undefined : nameOf(snapshot.players, holder);
  if (character !== undefined) {
    const builds =
      choice.proposerId === null ? undefined : snapshot.proposalBuilds.get(choice.proposerId);
    const look = lookOfWire(character, builds?.[slot]);
    const professions =
      look === undefined ? character.primary : professionLabel(look.primary, look.secondary);
    if (look === undefined) {
      node.append(
        h("span", "character-dot is-house", "?"),
        h("span", "play-card-line", professions),
      );
    } else {
      node.appendChild(characterFigureCard(look, { size: "card" }));
    }
    const label = `${professions}: ${holderName ?? "Sit here"}`;
    node.title = label;
    node.setAttribute("aria-label", label);
  }
  node.appendChild(
    holderName === undefined
      ? h("span", "team-lobby-seat-free", "Sit here")
      : personName("team-lobby-seat-holder", holderName, holder === side.captainId),
  );
  return node;
}

/**
 * The last proposals the vote showed: the claim stage's carry none
 * (#1458), but its result fades them behind the chosen one.
 */
let lastProposals: readonly WireTeamProposal[] = [];
/** The clock between two states: the host sends whole seconds only on a change. */
let ticking: ReturnType<typeof setInterval> | undefined;

/** Count `shown` down from `secondsLeft`, once a second, until it is off screen. */
function tickDown(shown: HTMLElement, secondsLeft: number): void {
  clearInterval(ticking);
  const endsAt = Date.now() + secondsLeft * 1000;
  ticking = setInterval(() => {
    if (!shown.isConnected) {
      clearInterval(ticking);
      return;
    }
    shown.textContent = clockText(Math.ceil((endsAt - Date.now()) / 1000));
  }, 250);
}

export function renderTeamLobbyScreen(
  root: HTMLElement,
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  callbacks: TeamLobbyCallbacks,
  notice: string | undefined,
): void {
  const lobby = snapshot.teamLobby;
  if (lobby === null) {
    return;
  }
  root.replaceChildren();
  const panel = h("div", "screen screen-team-lobby");
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const team = self?.team ?? null;
  const side = team === null ? null : lobby.sides[team];
  const clock = h("span", "team-lobby-clock", clockText(lobby.secondsLeft));
  tickDown(clock, lobby.secondsLeft);
  const status = h("div", "team-lobby-status");
  status.append(
    h("span", "team-lobby-stage", lobby.stage === "vote" ? VOTE_TITLE : CLAIM_TITLE),
    clock,
  );
  const actions: HTMLElement[] = [];
  if (side !== null) {
    const ready = self?.ready === true;
    actions.push(
      button(ready ? "Not ready" : "Ready", ready ? "" : "primary", callbacks.onToggleReady),
    );
  }
  screenBar({
    crumbs: ["VibeWars", team === null ? "Team Lobby" : `Team Lobby · Team ${String(team + 1)}`],
    back: { label: "Leave", onBack: callbacks.onLeave },
    status: [status],
    actions,
  });

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  panel.append(...teamLobbyBody(snapshot, teams, proposedTeamId, callbacks));
  root.appendChild(panel);
}

/**
 * Everything under the bar: a spectator's one line, the vote's picker
 * and cards, or the claim's result and seats.
 */
export function teamLobbyBody(
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  const lobby = snapshot.teamLobby;
  const team = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId)?.team ?? null;
  const side = lobby === null || team === null ? null : lobby.sides[team];
  if (lobby === null || side === null) {
    return [h("div", "screen-info team-lobby-spectating", SPECTATING_LINE)];
  }
  if (lobby.stage === "vote") {
    lastProposals = side.proposals;
    return voteStage(side, snapshot, teams, proposedTeamId, callbacks);
  }
  return side.chosen === null ? [] : claimStage(side, side.chosen, snapshot, callbacks);
}

/** The humans on the player's side: one alone has nobody to vote with. */
function humansOnSide(snapshot: LobbySnapshot): number {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  return snapshot.players.filter((p) => !p.bot && p.team !== null && p.team === self?.team).length;
}

/**
 * One of your saved Team Builds, to propose by a click (#1862), and to
 * withdraw by a click on the one you proposed. It is Team Play's card
 * for the team, without Edit.
 */
function ownCard(
  { team, disabled, reason }: ProposableTeam,
  proposedTeamId: string | undefined,
  onPropose: (teamId: string | undefined) => void,
): HTMLElement {
  const proposed = team.id === proposedTeamId;
  const footer: HTMLElement[] = [];
  if (reason !== undefined) {
    footer.push(h("span", "team-lobby-needs", reason));
  }
  if (proposed) {
    footer.push(h("span", "team-lobby-proposed", "Proposed ✓"));
  }
  const card = teamFigureCard({
    title: team.name,
    // No cape: a team's members wear none, as on Team Play.
    members: team.members.map(({ character }) => ({
      look: lookOfCharacter(character, undefined),
      label: `${character.name}, ${professionLabel(character.primaryProfession, character.secondaryProfession)}`,
    })),
    footer,
    onOpen: () => {
      onPropose(proposed ? undefined : team.id);
    },
    pressed: proposed,
    disabled,
    label: `Propose ${team.name}`,
  });
  card.classList.toggle("is-proposed", proposed);
  card.classList.toggle("is-faded", disabled);
  return card;
}

function voteStage(
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  const shown: HTMLElement[] = [h("h3", "menu-column-title", "Your Team Builds")];
  if (teams.length === 0) {
    shown.push(h("div", "screen-info team-lobby-no-teams", NO_TEAM_BUILDS));
  } else {
    const own = h("div", "play-cards team-lobby-own-cards");
    for (const proposable of proposableTeams(teams, side.size, humansOnSide(snapshot))) {
      own.appendChild(ownCard(proposable, proposedTeamId, callbacks.onPropose));
    }
    shown.push(own);
  }

  shown.push(h("h3", "menu-column-title", "Proposals"));
  if (humansOnSide(snapshot) > 1) {
    shown.push(h("div", "screen-info team-lobby-hint", VOTE_HINT));
  }

  const cards = h("div", "play-cards team-lobby-proposals");
  if (side.proposals.length === 0) {
    cards.appendChild(h("div", "team-lobby-empty", NO_PROPOSALS));
  }
  for (const proposal of side.proposals) {
    cards.appendChild(proposalCard(proposal, side, snapshot, callbacks.onVote));
  }
  shown.push(cards);
  return shown;
}

function claimStage(
  side: WireTeamSide,
  choice: WireTeamChoice,
  snapshot: LobbySnapshot,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  // The chosen card lifted, the rest faded behind it.
  const result = h("div", "play-cards team-lobby-result");
  result.appendChild(chosenCard(choice, side, snapshot));
  for (const proposal of lastProposals) {
    if (proposal.proposerId !== choice.proposerId) {
      const faded = proposalCard(proposal, side, snapshot, undefined);
      faded.classList.add("is-faded");
      result.appendChild(faded);
    }
  }
  const seats = h("div", "team-lobby-seats");
  for (let slot = 0; slot < choice.members.length; slot += 1) {
    seats.appendChild(seat(slot, choice, side, snapshot, callbacks.onClaim));
  }
  return [
    result,
    h("div", "team-lobby-reason", reasonLine(choice, lastProposals)),
    seats,
    h("div", "screen-info team-lobby-seats-line", SEATS_LINE),
  ];
}
