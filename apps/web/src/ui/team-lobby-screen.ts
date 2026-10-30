import { isProfessionId } from "@vibewars/game-core";
import type { WireTeamChoice, WireTeamProposal, WireTeamSide } from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import type { StoredTeam } from "../storage/schema.js";
import { createProfessionDot } from "./character-preview.js";
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

/** A saved Team Build as the Propose picker lists it. */
export interface ProposableTeam {
  readonly id: string;
  readonly label: string;
  /** Not the side's size, so the host would refuse it (Q182). */
  readonly disabled: boolean;
}

/** `teams` for a side of `size`: only those of exactly `size` members can be proposed. */
export function proposableTeams(
  teams: readonly StoredTeam[],
  size: number,
): readonly ProposableTeam[] {
  const needs = `needs ${String(size)} ${size === 1 ? "character" : "characters"}`;
  return teams.map((team) => {
    const disabled = team.members.length !== size;
    return { id: team.id, label: disabled ? `${team.name} (${needs})` : team.name, disabled };
  });
}

/** The member at `sessionId`'s name, or the id itself for someone already gone. */
function nameOf(players: readonly LobbyPlayerSnapshot[], sessionId: string): string {
  return players.find((player) => player.sessionId === sessionId)?.name ?? sessionId;
}

/** A character's badge, or "?" for a profession this client does not know. */
function professionDot(primary: string, secondary: string | null): HTMLElement {
  if (!isProfessionId(primary)) {
    return h("span", "character-dot is-house", "?");
  }
  return createProfessionDot(
    primary,
    secondary !== null && isProfessionId(secondary) ? secondary : undefined,
    "ally",
  );
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

/** One proposal's card: proposer, professions, voter tokens and count. */
export function proposalCard(
  proposal: WireTeamProposal,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  onVote: ((proposerId: string | null) => void) | undefined,
): HTMLElement {
  const mine = proposal.voterIds.includes(snapshot.selfSessionId);
  // A click on your own vote takes it back.
  const card = button("", "team-lobby-card", () => {
    onVote?.(mine ? null : proposal.proposerId);
  });
  card.disabled = onVote === undefined;
  card.classList.toggle("is-voted", mine);
  card.setAttribute("aria-pressed", String(mine));
  const proposer = nameOf(snapshot.players, proposal.proposerId);
  card.setAttribute("aria-label", `${proposer}'s team build`);
  card.appendChild(
    personName("team-lobby-card-name", proposer, proposal.proposerId === side.captainId),
  );
  const members = h("span", "team-lobby-card-members");
  for (const member of proposal.members) {
    members.appendChild(professionDot(member.primary, member.secondary));
  }
  card.appendChild(members);
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
  card.appendChild(votes);
  if (mine) {
    card.appendChild(h("span", "team-lobby-your-vote", "Your vote ✓"));
  }
  return card;
}

/** The chosen build as a card: its proposer, or the house team, and its characters by name. */
function chosenCard(
  choice: WireTeamChoice,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
): HTMLElement {
  const card = h("div", "team-lobby-card is-chosen");
  card.appendChild(
    choice.proposerId === null
      ? personName("team-lobby-card-name", HOUSE_TEAM, false)
      : personName(
          "team-lobby-card-name",
          nameOf(snapshot.players, choice.proposerId),
          choice.proposerId === side.captainId,
        ),
  );
  const members = h("span", "team-lobby-card-members");
  for (const member of choice.members) {
    members.appendChild(professionDot(member.primary, member.secondary));
  }
  card.appendChild(members);
  return card;
}

/** Seat `slot` of the chosen build: its character, and who sits in it. */
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
  const who = h("span", "team-lobby-seat-character");
  if (character !== undefined) {
    who.append(
      professionDot(character.primary, character.secondary),
      personName("team-lobby-seat-name", character.name, false),
    );
  }
  node.appendChild(who);
  node.appendChild(
    holder === null
      ? h("span", "team-lobby-seat-free", "Sit here")
      : personName(
          "team-lobby-seat-holder",
          nameOf(snapshot.players, holder),
          holder === side.captainId,
        ),
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

function voteStage(
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  const shown: HTMLElement[] = [];
  const propose = h("label", "team-lobby-propose");
  propose.appendChild(h("span", "field-label", "Propose"));
  const select = document.createElement("select");
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  select.appendChild(none);
  for (const team of proposableTeams(teams, side.size)) {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.label;
    option.disabled = team.disabled;
    select.appendChild(option);
  }
  select.value = proposedTeamId ?? "";
  select.addEventListener("change", () => {
    callbacks.onPropose(select.value === "" ? undefined : select.value);
  });
  propose.appendChild(select);
  shown.push(propose);

  if (humansOnSide(snapshot) > 1) {
    shown.push(h("div", "screen-info team-lobby-hint", VOTE_HINT));
  }

  const cards = h("div", "team-lobby-cards");
  if (side.proposals.length === 0) {
    cards.appendChild(h("div", "team-lobby-card is-empty", NO_PROPOSALS));
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
  const result = h("div", "team-lobby-cards team-lobby-result");
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
