import { PROFESSIONS, STARTER_TEAMS, type StarterTeam } from "@vibewars/game-core";
import type {
  WireProposalBuild,
  WireTeamChoice,
  WireTeamProposal,
  WireTeamSide,
} from "@vibewars/game-protocol";
import type { LobbyPlayerSnapshot, LobbySnapshot } from "@vibewars/game-session";

import { ASCENT_LOCKED_MESSAGE } from "../net/session.js";
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
import { button, h, playCard, screenBar } from "./kit.js";
import { memberCount, validateTeam } from "./team-builder.js";

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
  /** At 1v1 (#2387), play the character of the chooser's entry `key`. */
  readonly onPickSolo: (key: string) => void;
  readonly onToggleReady: () => void;
  readonly onLeave: () => void;
}

export const VOTE_TITLE = "Choose a team build";
export const CLAIM_TITLE = "Take a character";
export const VOTE_HINT = "Click a card to vote";
export const SPECTATING_LINE = "Teams are choosing their builds";
export const NO_PROPOSALS = "No proposals: a random preset team plays";
/** A 1v1's vote and claim (#2387): every character of the player, one click plays one. */
export const SOLO_TITLE = "Choose your character";
export const SOLO_STARTING = "Starting…";

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
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((team) =>
        team.members.map((member, seat) =>
          entry(`team:${team.id}:${String(seat)}`, member.character, team.name),
        ),
      ),
  ];
}
export const NO_TEAM_BUILDS = "You have no Team Builds. Make one in Team Builder.";
/** Every Team Build has problems (#2110): saved, but none can be proposed. */
export const NO_PLAYABLE_TEAM_BUILDS =
  "None of your Team Builds is playable. Fix one in Team Builder.";
/** None of your Team Builds is the side's size (#2104). */
export function noTeamBuildOf(size: number): string {
  return `No ${String(size)}-player Team Builds — make one in the Team Builder.`;
}
/** The builds drawer's search found nothing (#2116). */
export function noTeamBuildNamed(query: string): string {
  return `No Team Build named “${query}”.`;
}
/** What the builds drawer lists (#2116): the side's size, and how many it leaves out. */
export function drawerShowing(size: number, hidden: number): string {
  const showing = `Showing ${String(size)}-player builds`;
  return hidden === 0
    ? showing
    : `${showing} · ${String(hidden)} ${hidden === 1 ? "other" : "others"} hidden`;
}
export const BUILDS_DRAWER = "Your Team Builds";
export const PROPOSE_BUILD = "Propose this build";
export const WITHDRAW_PROPOSAL = "Withdraw proposal";
export const SEATS_LINE =
  "Unclaimed seats are filled when the clock ends: players first, then bots.";
/** A preset team's card title where it has no name (#2148): a side of one plays a starter build. */
export const PRESET_TEAM = "Preset team";

/** Why the chosen build won, as the line under it reads. */
export type ReasonLine =
  | "Most votes"
  | "Tie: captain's pick"
  | "Tie: picked at random"
  | "No votes: picked at random"
  | "No proposals: a random preset";

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
    case "preset":
      return "No proposals: a random preset";
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

/** The chosen build as a card: its proposer, or the preset team's name, and its characters. */
function chosenCard(
  choice: WireTeamChoice,
  side: WireTeamSide,
  snapshot: LobbySnapshot,
): HTMLElement {
  const card = teamFigureCard({
    title:
      choice.proposerId === null
        ? personName("team-lobby-card-name", choice.presetName ?? PRESET_TEAM, false)
        : personName(
            "team-lobby-card-name",
            nameOf(snapshot.players, choice.proposerId),
            choice.proposerId === side.captainId,
          ),
    members: cardMembers(choice.members, choiceBuilds(choice, snapshot), presetOf(choice)),
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
  const holderName = holder === null ? undefined : nameOf(snapshot.players, holder);
  const look =
    character === undefined
      ? undefined
      : lookOfWire(character, choiceBuilds(choice, snapshot)?.[slot]);
  // A preset's seat is its job (#2148): "Healer Monk".
  const professions =
    character === undefined
      ? undefined
      : (presetOf(choice)?.members[slot]?.name ??
        (look === undefined ? character.primary : professionLabel(look.primary, look.secondary)));
  const free =
    lock !== null && professions !== undefined ? `Open: ${professions} build` : "Sit here";
  if (professions !== undefined) {
    if (look === undefined) {
      node.append(
        h("span", "character-dot is-house", "?"),
        h("span", "play-card-line", professions),
      );
    } else {
      node.appendChild(characterFigureCard(look, { size: "card" }));
    }
    const label = `${professions}: ${holderName ?? free}`;
    node.title = label;
    node.setAttribute("aria-label", label);
  }
  node.appendChild(
    holderName === undefined
      ? h("span", "team-lobby-seat-free", free)
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
  solo: SoloChoice,
  callbacks: TeamLobbyCallbacks,
  notice: string | undefined,
): void {
  const lobby = snapshot.teamLobby;
  if (lobby === null) {
    return;
  }
  // The drawer's search keeps its focus and caret across the redraw (#2116).
  const active = document.activeElement;
  const typing =
    active instanceof HTMLInputElement && active.classList.contains("team-lobby-drawer-search")
      ? { start: active.selectionStart, end: active.selectionEnd }
      : undefined;
  const onTab = active?.classList.contains("team-lobby-drawer-tab") === true;
  root.replaceChildren();
  const panel = h("div", "screen screen-team-lobby");
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  const team = self?.team ?? null;
  const side = team === null ? null : lobby.sides[team];
  const clock = h("span", "team-lobby-clock", clockText(lobby.secondsLeft));
  tickDown(clock, lobby.secondsLeft);
  const status = h("div", "team-lobby-status");
  status.append(h("span", "team-lobby-stage", stageTitle(lobby.stage, side?.size)), clock);
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
    // Esc puts the builds drawer away before it leaves (#2116).
    putAway: putAwayBuildsDrawer,
    status: [status],
    actions,
  });

  if (notice !== undefined) {
    panel.appendChild(h("div", "screen-problem", notice));
  }

  panel.append(...teamLobbyBody(snapshot, teams, proposedTeamId, solo, callbacks));
  root.appendChild(panel);
  // The drawer and its tab hang just below the top bar, however tall it wraps.
  const topbar = document.getElementById("topbar");
  if (topbar !== null) {
    panel.style.setProperty(
      "--team-lobby-drawer-top",
      `${String(topbar.getBoundingClientRect().bottom)}px`,
    );
  }
  if (typing !== undefined) {
    const search = panel.querySelector<HTMLInputElement>(".team-lobby-drawer-search");
    search?.focus();
    search?.setSelectionRange(typing.start, typing.end);
  } else if (onTab) {
    panel.querySelector<HTMLElement>(".team-lobby-drawer-tab")?.focus();
  }
}

/**
 * Everything under the bar: a spectator's one line, the vote's picker
 * and cards, or the claim's result and seats.
 */
export function teamLobbyBody(
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  solo: SoloChoice,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  const lobby = snapshot.teamLobby;
  const team = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId)?.team ?? null;
  const side = lobby === null || team === null ? null : lobby.sides[team];
  if (lobby === null || side === null) {
    forgetDrawer();
    return [h("div", "screen-info team-lobby-spectating", SPECTATING_LINE)];
  }
  if (lobby.stage === "vote") {
    lastProposals = side.proposals;
    return voteStage(side, snapshot, teams, proposedTeamId, solo, callbacks);
  }
  forgetDrawer();
  return side.chosen === null ? [] : claimStage(side, side.chosen, snapshot, callbacks);
}

/** The humans on the player's side: one alone has nobody to vote with. */
function humansOnSide(snapshot: LobbySnapshot): number {
  const self = snapshot.players.find((p) => p.sessionId === snapshot.selfSessionId);
  return snapshot.players.filter((p) => !p.bot && p.team !== null && p.team === self?.team).length;
}

/**
 * The Your Team Builds drawer (#2116): whether it is open, its search,
 * and its one expanded row. The lobby redraws on every snapshot, so this
 * outlives the elements, as `lastProposals` does.
 */
const drawerState: { open: boolean; query: string; expanded: string | undefined } = {
  open: false,
  query: "",
  expanded: undefined,
};
/** Closes the drawer on screen, focus back on its tab; none while no vote shows one. */
let closeDrawer: (() => void) | undefined;

/** Esc's first job in the vote (#2116): put the open drawer away; true when it was. */
export function putAwayBuildsDrawer(): boolean {
  if (!drawerState.open || closeDrawer === undefined) {
    return false;
  }
  closeDrawer();
  return true;
}

/** The vote is over, or was never yours: the next one opens on a closed drawer. */
function forgetDrawer(): void {
  drawerState.open = false;
  drawerState.query = "";
  drawerState.expanded = undefined;
  closeDrawer = undefined;
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
  onToggle: () => void,
  onPropose: (teamId: string | undefined) => void,
): { readonly row: HTMLElement; readonly head: HTMLButtonElement } {
  const expanded = drawerState.expanded === team.id;
  const row = h("div", "team-lobby-drawer-row");
  row.classList.toggle("is-proposed", proposed);
  row.classList.toggle("is-expanded", expanded);
  const head = button("", "team-lobby-drawer-row-head", onToggle);
  head.setAttribute("aria-expanded", String(expanded));
  head.setAttribute("aria-label", team.name);
  const title = h("span", "team-lobby-drawer-row-title");
  title.appendChild(h("span", "team-lobby-drawer-row-name", team.name));
  if (proposed) {
    title.appendChild(h("span", "team-lobby-drawer-tag", "proposed"));
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
      member.append(
        h("b", "team-lobby-drawer-member-name", character.name),
        // No cape: a team's members wear none, as on Team Builder.
        characterFigureCard(lookOfCharacter(character, undefined), { size: "card" }),
      );
      members.appendChild(member);
    }
    const action = button(
      proposed ? WITHDRAW_PROPOSAL : PROPOSE_BUILD,
      proposed ? "team-lobby-drawer-go" : "primary team-lobby-drawer-go",
      () => {
        onPropose(proposed ? undefined : team.id);
        closeDrawer?.();
      },
    );
    row.append(members, action);
  }
  return { row, head };
}

/**
 * The tab on the right edge and the drawer it opens (#2116), over the
 * lobby's right side and never dimming it: the vote stays clickable
 * beside it. What it shows comes from `drawerState`, redrawn in place
 * as the player types and expands, and kept across snapshots.
 */
function buildsDrawer(
  teams: readonly StoredTeam[],
  size: number,
  proposedTeamId: string | undefined,
  onPropose: (teamId: string | undefined) => void,
): HTMLElement[] {
  const drawer = h("aside", "team-lobby-drawer");
  drawer.setAttribute("aria-label", BUILDS_DRAWER);
  const tab = button(`${BUILDS_DRAWER} ▾`, "team-lobby-drawer-tab", () => {
    if (drawerState.open) {
      closeDrawer?.();
    } else {
      show();
    }
  });
  tab.setAttribute("aria-label", BUILDS_DRAWER);
  const close = button("Esc ✕", "team-lobby-drawer-close", () => {
    closeDrawer?.();
  });
  close.setAttribute("aria-label", `Close ${BUILDS_DRAWER}`);
  const head = h("div", "team-lobby-drawer-head");
  head.append(h("h3", "team-lobby-drawer-title", BUILDS_DRAWER), close);

  const proposable = proposableTeams(teams, size);
  const search = document.createElement("input");
  search.type = "search";
  search.className = "team-lobby-drawer-search";
  search.placeholder = "Search your Team Builds…";
  search.setAttribute("aria-label", "Search your Team Builds");
  search.value = drawerState.query;
  search.hidden = proposable.length === 0;
  const body = h("div", "team-lobby-drawer-body");

  const fill = (): Map<string, HTMLButtonElement> => {
    const heads = new Map<string, HTMLButtonElement>();
    if (proposable.length === 0) {
      const ofSize = teams.some((team) => team.members.length === size);
      body.replaceChildren(
        h(
          "div",
          "screen-info team-lobby-no-teams",
          teams.length === 0
            ? NO_TEAM_BUILDS
            : ofSize
              ? NO_PLAYABLE_TEAM_BUILDS
              : noTeamBuildOf(size),
        ),
      );
      return heads;
    }
    const { rows, hiddenOtherSizes } = drawerRows(teams, size, drawerState.query);
    const shown: HTMLElement[] = [
      h("div", "team-lobby-drawer-showing", drawerShowing(size, hiddenOtherSizes)),
    ];
    if (rows.length === 0) {
      shown.push(h("div", "team-lobby-drawer-empty", noTeamBuildNamed(drawerState.query.trim())));
    }
    const list = h("div", "team-lobby-drawer-list");
    for (const team of rows) {
      const { row, head: rowHead } = drawerRow(
        team,
        team.id === proposedTeamId,
        () => {
          drawerState.expanded = drawerState.expanded === team.id ? undefined : team.id;
          fill().get(team.id)?.focus();
        },
        onPropose,
      );
      heads.set(team.id, rowHead);
      list.appendChild(row);
    }
    shown.push(list);
    body.replaceChildren(...shown);
    return heads;
  };

  const place = (): void => {
    drawer.hidden = !drawerState.open;
    tab.setAttribute("aria-expanded", String(drawerState.open));
    tab.classList.toggle("is-open", drawerState.open);
  };
  const show = (): void => {
    drawerState.open = true;
    place();
    (search.hidden ? close : search).focus();
  };
  search.addEventListener("input", () => {
    drawerState.query = search.value;
    fill();
  });
  // A search field keeps its own Esc (kit.ts): this one's closes the drawer.
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer?.();
    }
  });
  closeDrawer = () => {
    drawerState.open = false;
    drawerState.expanded = undefined;
    place();
    fill();
    tab.focus();
  };

  fill();
  place();
  drawer.append(head, search, body);
  return [tab, drawer];
}

function voteStage(
  side: WireTeamSide,
  snapshot: LobbySnapshot,
  teams: readonly StoredTeam[],
  proposedTeamId: string | undefined,
  solo: SoloChoice,
  callbacks: TeamLobbyCallbacks,
): HTMLElement[] {
  // A 1v1 picks one of the player's characters, not a Team Build (#2387).
  if (side.size === 1) {
    return [soloChooser(solo.entries, solo.picked, callbacks.onPickSolo)];
  }
  const shown = buildsDrawer(teams, side.size, proposedTeamId, callbacks.onPropose);
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

/** The title of `stage` (#2387): a 1v1 chooses a character, then starts. */
function stageTitle(stage: "vote" | "claim", size: number | undefined): string {
  if (size === 1) {
    return stage === "vote" ? SOLO_TITLE : SOLO_STARTING;
  }
  return stage === "vote" ? VOTE_TITLE : CLAIM_TITLE;
}

/**
 * A 1v1's chooser (#2387): every character the player has, `picked`
 * pressed. An illegal one is shown, tagged and explained, never picked.
 */
function soloChooser(
  entries: readonly SoloEntry[],
  picked: string | undefined,
  onPick: (key: string) => void,
): HTMLElement {
  const cards = h("div", "play-cards team-lobby-solo");
  for (const entry of entries) {
    const content = [
      characterFigureCard(lookOfCharacter(entry.character, undefined), {
        size: "card",
        note: entry.team === undefined ? undefined : `Team: ${entry.team}`,
      }),
    ];
    const card = playCard({
      name: entry.character.name,
      tags: entry.legal ? [] : [h("span", "roster-invalid-tag", "Invalid")],
      content,
      pressed: entry.key === picked && entry.legal,
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
    cards.appendChild(card);
  }
  return cards;
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
  // A 1v1 takes its one seat itself (#2387): the card it starts with, alone.
  if (side.size === 1) {
    return [result];
  }
  // A locked run's build was voted in on its first map (#2539), not now.
  const locked = snapshot.ascentLock !== null;
  for (const proposal of locked ? [] : lastProposals) {
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
    h(
      "div",
      "team-lobby-reason",
      locked ? ASCENT_LOCKED_MESSAGE : reasonLine(choice, lastProposals),
    ),
    seats,
    h("div", "screen-info team-lobby-seats-line", SEATS_LINE),
  ];
}
