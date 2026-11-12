import type { LobbyMode } from "@vibewars/game-protocol";

import { t } from "../i18n/index.js";
import { isTeamBuildSize, type StoredTeam, type TeamBuildSize } from "../storage/schema.js";
import { loadStarterTeamId } from "../storage/starter-team.js";
import { looksLikeBuild } from "../storage/build-transfer.js";
import { importTeam, looksLikeTeam, type TeamImportResult } from "../storage/team-transfer.js";
import { lookOfCharacter, teamFigureCard } from "./character-card.js";
import { professionLabel } from "./character-preview.js";
import { button, h, listenForPaste, loadLine, screenBar, toast } from "./kit.js";
import { mapLabel, type LobbyMap, type LobbyPanel } from "./lobby-screen.js";
import {
  loadTeamBuildSize,
  onTeamSizeChange,
  railScreen,
  teamSizeLabel,
  type RailEntry,
  type TeamSize,
} from "./rail.js";
import { validateTeam } from "./team-builder.js";

/**
 * The menu's team screens (#1525, #1522 variant C): a screen per team
 * mode, each the lobby on its own maps (#1526), Hosted Game, the lobby on
 * every map, and Team Builder, the only one with the Team Build cards
 * (#2031). Team Builds are proposed and voted on in the Team Lobby (#1460),
 * never picked here (#1515). There are no team queues yet.
 */

/** A rail entry that shows the lobby. */
export type HostEntry = Exclude<LobbyMode, "random-arena">;

/** The screens that show the lobby. */
const HOST_ENTRIES: ReadonlySet<RailEntry> = new Set<HostEntry>([
  "team-arena",
  "heroes-ascent",
  "gvg",
  "hosted-game",
]);

/** Whether `entry` is a screen that shows the lobby. */
export function isHostEntry(entry: RailEntry): entry is HostEntry {
  return HOST_ENTRIES.has(entry);
}

/** Under the cards while there are no Team Builds of the picked size (#2109). */
export function noTeamBuilds(size: TeamSize): string {
  return t("teamPlay.noTeamBuilds", { size: teamSizeLabel(size) });
}

/** A Team Build card's tag (#2109): its filled slots of its size, "3/4". */
function sizeTag(team: StoredTeam): HTMLElement {
  return h("span", "play-card-size", `${String(team.members.length)}/${String(team.size)}`);
}

export interface TeamPlayCallbacks {
  /** Show another rail entry (#1525); the rail has stored it. */
  readonly onSwitch: (entry: RailEntry) => void;
  readonly onNewTeam: () => void;
  readonly onEditTeam: (id: string) => void;
  /** The random starter team's Clone (#2036): a copy of it, to edit. */
  readonly onCloneStarterTeam: (id: string) => void;
  /** The random starter team's Reroll (#2036): another curated team in its place. */
  readonly onRerollTeam: (id: string) => void;
  /** A team code was pasted on the screen (#577) or loaded with Load team (#3181). */
  readonly onLoadTeam: (team: StoredTeam) => void;
  /** Leave Queue on a lobby's screen, while in the Random Arena queue (#2781). */
}

/**
 * The team in `text` (#3181), for Load team and a paste alike, its
 * members' ids from `newId`, saved at `now`: a team line (#577), trimmed.
 * A team line holds build lines too, so a single build is told apart
 * second, and told where it loads.
 */
export function loadTeamCode(text: string, newId: () => string, now: number): TeamImportResult {
  const code = text.trim();
  if (code === "") {
    return { ok: false, problems: [t("buildEditor.pasteFirst")] };
  }
  if (!looksLikeTeam(code) && looksLikeBuild(code)) {
    return { ok: false, problems: [t("teamPlay.buildCodeLoad")] };
  }
  return importTeam(code, newId, now);
}

/**
 * A team pasted where it opens (#577): `onTeam` with it, or a toast of
 * why not. Anything but a team line is not taken.
 */
export function pasteTeam(text: string, onTeam: (team: StoredTeam) => void): boolean {
  if (!looksLikeTeam(text)) {
    return false;
  }
  const result = loadTeamCode(text, () => crypto.randomUUID(), Date.now());
  if (result.ok) {
    onTeam(result.team);
  } else {
    toast(t("app.couldNotImport"), { problems: result.problems });
  }
  return true;
}

/**
 * `teams` in the order they show: the random starter team (#2036) last,
 * as the starter character is, so a Reroll never moves it.
 */
export function teamOrder(
  teams: readonly StoredTeam[],
  starterId: string | undefined,
): StoredTeam[] {
  return [...teams.filter((t) => t.id !== starterId), ...teams.filter((t) => t.id === starterId)];
}

/** The random starter team's card (#2036): never edited, Clone and Reroll instead. */
function starterTeamCard(
  members: Parameters<typeof teamFigureCard>[0]["members"],
  team: StoredTeam,
  callbacks: TeamPlayCallbacks,
): HTMLElement {
  const clone = button(t("teamPlay.clone"), "play-card-clone", () => {
    // One copy per press: a double-click must not save two.
    clone.disabled = true;
    callbacks.onCloneStarterTeam(team.id);
  });
  const card = teamFigureCard({
    title: team.name,
    tags: [h("span", "roster-random-tag", t("teamPlay.random")), sizeTag(team)],
    members,
    actions: [
      clone,
      button(t("teamPlay.reroll"), "play-card-reroll", () => {
        callbacks.onRerollTeam(team.id);
      }),
    ],
  });
  // Dashed, not only tagged, as the starter character's (#1426).
  card.classList.add("is-random");
  return card;
}

/**
 * Whether the starter team's Reroll has the focus: it redraws the screen
 * under its own button, so the new card's Reroll takes the focus back, as
 * on Character Builder (#1425). Read before the screen is replaced.
 */
function rerollFocused(): boolean {
  return document.activeElement?.classList.contains("play-card-reroll") === true;
}

/** What a saved team without a name is called on its card (#2110); its stored name stays empty. */
/**
 * A saved team that could not be proposed (#2110): Save always stores,
 * so its card says why, by its first problem.
 */
function unplayable(team: StoredTeam): HTMLElement[] {
  const first = validateTeam(team)[0];
  return first === undefined
    ? []
    : [h("span", "play-card-unplayable", t("teamPlay.notPlayable", { problem: first.message }))];
}

/**
 * The Team Build cards of `size` (#2109), each opening in the editor as
 * its Edit does, then New team build.
 */
function teamCards(
  teams: readonly StoredTeam[],
  size: TeamBuildSize,
  callbacks: TeamPlayCallbacks,
): HTMLElement {
  const section = h("div", "team-play-builds");
  const starter = loadStarterTeamId(size);
  const cards = h("div", "play-cards");
  const shown = teams.filter((team) => team.size === size);
  for (const team of teamOrder(shown, starter)) {
    const edit = (): void => {
      callbacks.onEditTeam(team.id);
    };
    // No cape: a team's members wear none, as in the lobby.
    const members = team.members.map(({ character }) => ({
      look: lookOfCharacter(character, undefined),
      label: t("teamPlay.memberLabel", {
        name: character.name,
        professions: professionLabel(character.primaryProfession, character.secondaryProfession),
      }),
    }));
    cards.appendChild(
      team.id === starter
        ? starterTeamCard(members, team, callbacks)
        : teamFigureCard({
            title: team.name.trim() === "" ? t("teamPlay.unnamedTeam") : team.name,
            tags: [sizeTag(team)],
            members,
            footer: unplayable(team),
            onOpen: edit,
            actions: [button(t("teamPlay.edit"), "play-card-edit", edit)],
          }),
    );
  }
  cards.appendChild(
    button(t("teamPlay.newTeamBuild"), "play-card play-card-new", callbacks.onNewTeam),
  );
  // Load team (#3181): a shared team line, typed or pasted, opens as a
  // paste on the screen does.
  const load = loadLine(t("teamPlay.loadLine"), t("teamPlay.loadPlaceholder"), (text) => {
    const result = loadTeamCode(text, () => crypto.randomUUID(), Date.now());
    if (!result.ok) {
      return result.problems;
    }
    callbacks.onLoadTeam(result.team);
    return [];
  });
  const loadCard = h("div", "team-play-load");
  loadCard.append(
    button(t("teamPlay.loadTeam"), "play-card play-card-load", () => {
      load.show();
    }),
    load.element,
  );
  cards.appendChild(loadCard);
  section.appendChild(cards);
  if (shown.length === 0) {
    section.appendChild(h("p", "team-play-hint", noTeamBuilds(size)));
  }
  return section;
}

/** Team Builder's cards at the sidebar's team size, and a team code pasted on it. */
function teamBuilderBody(
  body: HTMLElement,
  teams: readonly StoredTeam[],
  callbacks: TeamPlayCallbacks,
  rerolled: boolean,
): void {
  let section = teamCards(teams, loadTeamBuildSize(), callbacks);
  body.appendChild(section);
  if (rerolled) {
    section.querySelector<HTMLElement>(".play-card-reroll")?.focus();
  }
  // Another size in the sidebar shows its builds at once (#2109).
  onTeamSizeChange((size) => {
    if (!isTeamBuildSize(size)) {
      return;
    }
    const next = teamCards(teams, size, callbacks);
    section.replaceWith(next);
    section = next;
  });

  // A team code pasted here opens that team (#577); a single build code
  // is not a team, and is ignored. The screen has no dispose, so the
  // listener stops itself once it is off screen.
  const stopPaste = listenForPaste((text) => {
    if (!body.isConnected) {
      stopPaste();
      return false;
    }
    return pasteTeam(text, callbacks.onLoadTeam);
  });
}

/** The screen's bar and rail, and why the last try failed. */
function teamScreen(
  root: HTMLElement,
  entry: RailEntry,
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
  panel?: LobbyPanel,
): HTMLElement {
  screenBar({
    crumbs: ["VibeWars"],
    status: panel?.status ?? [],
    actions: panel?.actions ?? [],
    ...(panel?.queueAction === undefined ? {} : { queueAction: panel.queueAction }),
    join: true,
  });
  const body = railScreen(root, entry, callbacks.onSwitch);
  // Why the last try failed, under the bar it was tried from.
  if (connectionNotice !== undefined) {
    body.appendChild(h("div", "screen-problem screen-connection-problem", connectionNotice));
  }
  for (const problem of problems) {
    body.appendChild(h("div", "screen-problem", problem));
  }
  return body;
}

/**
 * Render a lobby's screen (#1525, #1526): Team Arena, Heroes' Ascent and
 * GvG show the lobby on their maps, Hosted Game on every map (Q188), and
 * none the Team Build cards, which are Team Builder's (#2031). `panel` is
 * the lobby, once there is one.
 */
export function renderHostScreen(
  root: HTMLElement,
  entry: HostEntry,
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
  panel: LobbyPanel | undefined,
  /** In the Random Arena queue (#2743), `entry`'s maps to preview: no lobby until it is left. */
  queuedMaps: readonly LobbyMap[] | undefined,
): void {
  const body = teamScreen(root, entry, problems, connectionNotice, callbacks, panel);
  if (panel !== undefined) {
    body.appendChild(panel.body);
  } else if (queuedMaps !== undefined) {
    body.append(h("p", "screen-info", t("queue.busy")), mapPreview(queuedMaps));
  } else {
    body.appendChild(h("p", "screen-info", t("teamPlay.openingLobby")));
  }
}

/**
 * The maps a lobby of this screen plays, as its lobby lists them, to look
 * at and not to pick (#2781): in the Random Arena queue there is no lobby.
 */
function mapPreview(maps: readonly LobbyMap[]): HTMLElement {
  const preview = h("div", "screen-queued-maps");
  const list = h("ul", "lobby-map");
  list.append(...maps.map((map) => h("li", undefined, mapLabel(map))));
  preview.append(h("span", "field-label", t("teamPlay.queuedMaps")), list);
  return preview;
}

/** Render Team Builder (#1525): the Team Build cards, to make and edit them. */
export function renderTeamBuilder(
  root: HTMLElement,
  teams: readonly StoredTeam[],
  problems: readonly string[],
  connectionNotice: string | undefined,
  callbacks: TeamPlayCallbacks,
): void {
  const rerolled = rerollFocused();
  const body = teamScreen(root, "teams", problems, connectionNotice, callbacks);
  teamBuilderBody(body, teams, callbacks, rerolled);
}
