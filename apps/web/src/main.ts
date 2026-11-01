import { sizeClass } from "@vibewars/game-maps/size-class";
import type {
  Guild,
  LobbyCharacter,
  LobbyConnection,
  LobbySnapshot,
  MatchStarting,
} from "@vibewars/game-session";

import type { NostrQueue } from "./net/transport/nostr-queue.js";

import { ARENA_MAPS, LOBBY_MODE_MATCH_MODES, modeMapIds } from "./net/maps.js";
import {
  connectMatchFor,
  observeMatchFor,
  enterQueue,
  followHost,
  hostLobby,
  joinFailureNotice,
  joinLobbyByCode,
  lobbyClosedNotice,
  lobbyRefusalNotice,
  matchFailureNotice,
  openPartyBoard,
  PARTY_ANSWER_MS,
  QUEUED_RESULT_SECONDS,
  STAY_TOGETHER_GRACE_SECONDS,
  STAY_TOGETHER_SECONDS,
  TEAM_PLAN_REJECTED_NOTICE,
  TEAM_RESULT_SECONDS,
  TEAM_SPLIT_MESSAGE,
  watchHostMove,
  type HostMove,
  type HostedLobby,
  type PartyPlace,
  type RandomArenaQueue,
} from "./net/session.js";
import {
  UNREADABLE_RELAY_NOTICE,
  loadTurnConfig,
  parseTurnFragment,
  type TurnFragment,
} from "./net/transport/turn-config.js";
import {
  CHECK_EVERY_MS,
  DEV_BUILD,
  createBuildWatch,
  fetchServedBuild,
  isStaleChunkError,
  type BuildWatch,
} from "./build-check.js";
import { startMatchView, type MatchView } from "./match-view.js";
import { beatEdits } from "./music/beat-edits.js";
import { musicPlayer } from "./music/music-player.js";
import { music } from "./music/play-music.js";
import { TRACKS } from "./music/tracks/index.js";
import { STRESS_BUILD, startStress, stressMs } from "./music/stress.js";
import {
  BLOCKED_NOTICE,
  CharacterRepository,
  TeamRepository,
  createMemoryStore,
  openIndexedDbStore,
  type KeyValueStore,
} from "./storage/repository.js";
import { cloneCharacter } from "./storage/clone-character.js";
import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamCharacter,
} from "./storage/schema.js";
import { rerollStarterCharacter, rollStarterCharacter } from "./storage/starter-character.js";
import {
  loadStarterTeamId,
  rerollStarterTeam,
  rollStarterTeam,
  saveStarterTeamId,
} from "./storage/starter-team.js";
import { importTeam, importedTeamSummary } from "./storage/team-transfer.js";
import { closeBeatEditor } from "./ui/beat-editor.js";
import { mountBuildBanner } from "./ui/build-banner.js";
import { mountBuildEditor, newCharacter, type BuildEditorView } from "./ui/build-editor.js";
import { closeHelpOverlay, openHelpOverlay } from "./ui/help-screen.js";
import { closeOptionsOverlay, openOptionsOverlay } from "./ui/options-screen.js";
import { mountChat, type ChatPanel } from "./ui/chat.js";
import { openRelayPrompt } from "./ui/relay-prompt.js";
import { needsTouchNotice, showTouchNotice } from "./ui/touch-notice.js";
import {
  loadTouchNoticeDismissed,
  saveTouchNoticeDismissed,
} from "./ui/touch-notice-preference.js";
import { describeOutcome } from "./ui/hud.js";
import type { SummaryTable } from "./ui/match-summary.js";
import {
  mountQueueScreen,
  nextStreak,
  requeuedSince,
  teamEndAction,
  teamEndLine,
  type QueueScreen,
  type StayOffer,
  type TeamEndAction,
} from "./ui/queue-screen.js";
import {
  HOUSE_TEAM_AFTER_MS,
  hostMaps,
  lobbyPanel,
  type LobbyMatchmaking,
  type LobbyPanel,
} from "./ui/lobby-screen.js";
import { renderTeamLobbyScreen } from "./ui/team-lobby-screen.js";
import { createNowPlayingToast, nowPlayingText } from "./ui/now-playing.js";
import {
  loadActiveCharacterId,
  loadStarterCharacterId,
  renderCharacterBuilder,
  renderRandomArena,
  saveActiveCharacterId,
  saveStarterCharacterId,
} from "./ui/menu.js";
import { dismissToast, toast } from "./ui/kit.js";
import { createScreenNotices } from "./screen-notices.js";
import { createScreenTurns, type ScreenTurn } from "./screen-turns.js";
import { loadPlayerName, playerGuild } from "./ui/player-section.js";
import { isAlone, lookingLabel, partyOf } from "./ui/party-strip.js";
import {
  isModeEntry,
  loadRail,
  railParty,
  redrawModeRail,
  redrawsOnLobbyChange,
  setRailParty,
  type RailEntry,
} from "./ui/rail.js";
import {
  isHostEntry,
  renderHostScreen,
  renderTeamBuilder,
  type HostEntry,
  type TeamPlayCallbacks,
} from "./ui/team-play.js";
import { mountTopbar, paintStatus, type StatusState } from "./ui/topbar.js";
import {
  addMember,
  duplicateTeam,
  newTeam,
  removeMember,
  replaceMember,
  teamCharacter,
} from "./ui/team-builder.js";
import {
  mountTeamEditor,
  openedTeam,
  pastedTeam,
  type TeamEditorState,
  type TeamEditorView,
} from "./ui/team-editor.js";
import { toPlayerBuild } from "./storage/build-validation.js";
import { STORAGE_NAMESPACE } from "./storage/namespace.js";
import {
  normalizeLobbyCode,
  teamQueueModeOf,
  teamSizeOf,
  type QueueMode,
} from "@vibewars/game-protocol";
import {
  MINIMAL_GW_INSPIRED_PVP_V1,
  resolveJoinLoadout,
  type PlayerBuild,
} from "@vibewars/game-core";

/**
 * Application shell: owns which screen is showing and the connections
 * behind it.
 *
 * Deliberately a small state machine rather than a framework — there are
 * five screens and one connection at a time, and a router would be more
 * machinery than the problem has (brief §30).
 */

/** Shown on the lobby or the menu once a match is lost for good. */
const LOST_MATCH_NOTICE = "Lost the connection to the match.";
/** A code typed into the title bar that is this tab's own lobby's (#1526). */
const OWN_LOBBY_NOTICE = "That is your own lobby";

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Expected element ${selector} to exist in index.html`);
  }
  return element;
}

function setStatus(text: string, state: StatusState): void {
  paintStatus(requireElement("#status"), text, state);
}

/** The store builds are kept in; `persistent` unless it lives only in memory. */
async function openStore(): Promise<{ store: KeyValueStore; persistent: boolean }> {
  try {
    return {
      store: await openIndexedDbStore(() => {
        setStatus(BLOCKED_NOTICE, "error");
      }),
      persistent: true,
    };
  } catch (error) {
    // Private browsing and some locked-down configurations deny
    // IndexedDB. Falling back to memory keeps the game playable for this
    // session rather than failing at the menu; the player just will not
    // keep their builds.
    console.warn("[web] IndexedDB unavailable; builds will not persist this session", error);
    return { store: createMemoryStore(), persistent: false };
  }
}

/** A relay link nothing could be read from (#972), on the first menu. */
const MALFORMED_RELAY_LINK_NOTICE = "That relay link is not valid. Nothing was saved.";
/**
 * A relay link opened inside another site's frame (#972): Use is the only
 * defence, and a framing page could overlay a decoy over it, so a framed
 * page never asks. Static hosting sends no `frame-ancestors`.
 */
const FRAMED_RELAY_LINK_NOTICE = "Open the relay link in its own tab. Nothing was saved.";

/**
 * The relay invite link this page was opened with, if any (#972), taken
 * out of the address bar and the history entry at once: a later copy or
 * screenshot of the URL carries no credential, even from a tab closed at
 * the prompt. Only `turn=` goes; the rest of the fragment stays.
 */
function takeRelayLink(): TurnFragment {
  const fragment = parseTurnFragment(location.hash);
  if (fragment.kind !== "none") {
    const rest = fragment.rest === "" ? "" : `#${fragment.rest}`;
    history.replaceState(history.state, "", `${location.pathname}${location.search}${rest}`);
  }
  return fragment;
}

/** The served build id this tab last reloaded for (#1268): once per id, never a loop. */
const RELOADED_FOR_KEY = `${STORAGE_NAMESPACE}.reloaded-for`;

/** A Team Lobby's saved Team Builds, read once as it begins, and the one proposed (#1460). */
interface TeamPicks {
  teams: readonly StoredTeam[];
  proposed: string | undefined;
}

/** What a player takes into a lobby, read once when they enter it (#1070). */
interface Entrant {
  /** Played every match of the lobby; `undefined` plays a starter build from the host. */
  readonly build: PlayerBuild | undefined;
  /** How the lobby lists it (#580). */
  readonly character: LobbyCharacter | null;
  /** The menu's guild tag (#1406) if it is a valid one, and its cape (#1422). */
  readonly guild: Guild;
}

async function main(): Promise<void> {
  // Before anything mounts or waits.
  const relayLink = takeRelayLink();
  // A touch-only device is told it needs a keyboard and mouse (#1392)
  // before the menu, which waits until it goes past.
  if (needsTouchNotice((query) => matchMedia(query).matches, loadTouchNoticeDismissed)) {
    await new Promise<void>((resolve) => {
      showTouchNotice(document.body, () => {
        saveTouchNoticeDismissed();
        resolve();
      });
    });
  }
  const screenRoot = requireElement("#screens");
  const showNowPlaying = createNowPlayingToast(document.body);
  musicPlayer().onNowPlaying((trackId) => {
    showNowPlaying(nowPlayingText(trackId, TRACKS, music().intensity));
  });
  const viewport = requireElement("#viewport");
  const topbar = requireElement("#topbar");
  const app = requireElement("#app");

  const stress = stressMs(window.location.search, STRESS_BUILD);
  if (stress !== null) {
    startStress(stress);
  }

  const { store, persistent } = await openStore();
  // Before any music: a stale edit is gone before it could play (#373).
  // Its notice goes on the first menu, until the player leaves it (#1807).
  const notices = createScreenNotices(await beatEdits.load(TRACKS));
  // An edit that stopped the music, on the next menu (#878).
  music().onNotice((notice) => {
    notices.add(notice);
  });
  // A saved relay of the wrong shape goes now, and the first menu says so.
  const savedRelay = loadTurnConfig(() => {
    notices.add(UNREADABLE_RELAY_NOTICE);
  });
  const framed = window.top !== window.self;
  if (relayLink.kind === "malformed") {
    notices.add(MALFORMED_RELAY_LINK_NOTICE);
  } else if (relayLink.kind === "config" && framed) {
    notices.add(FRAMED_RELAY_LINK_NOTICE);
  }
  const characters = new CharacterRepository(store);
  const teams = new TeamRepository(store);
  // The first start plays a rolled starter character (#853). Not into
  // memory: it would be gone next start, with the key saying it was rolled.
  if (persistent) {
    // Its name is none of the roster's (#1149). The list's notices go on
    // the first menu: the stale records they report are gone after this.
    const { characters: roster, problems } = await characters.list();
    for (const problem of problems) {
      notices.add(problem);
    }
    const rolled = await rollStarterCharacter({
      characters,
      key: { load: loadStarterCharacterId, save: saveStarterCharacterId },
      random: Math.random,
      id: crypto.randomUUID(),
      now: Date.now(),
      taken: roster.map((c) => c.name),
    });
    if (rolled !== undefined) {
      saveActiveCharacterId(rolled.id);
    }
    // And a curated Team Build, on its own key (#2036).
    await rollStarterTeam({
      teams,
      key: { load: loadStarterTeamId, save: saveStarterTeamId },
      random: Math.random,
      id: crypto.randomUUID(),
      newId: () => crypto.randomUUID(),
      now: Date.now(),
    });
  }

  // The arenas a host can pick, built into the client (#403).
  const availableMaps = ARENA_MAPS.map((map) => ({
    id: map.id,
    name: map.name,
    size: sizeClass(map),
    mode: map.mode,
  }));

  /**
   * The lobby this tab is in (#1526, ADR-0041): from page load its own,
   * one it joined, or a Random Arena group's. None only while a queue or
   * a Stay together party has the player, or while the next one opens.
   */
  let lobby: LobbyConnection | undefined;
  /** The lobby this tab hosts, while it hosts one: leaving it ends it for everyone. */
  let hosted: HostedLobby | undefined;
  /** What this player brought into `lobby`, and plays its matches with; a pick on the menu changes it. */
  let lobbyEntrant: Entrant | undefined;
  /** The name this player went into `lobby` under. */
  let lobbyName: string | undefined;
  /** While this tab's own lobby is being opened. */
  let opening = false;
  /**
   * The key this tab is following its host to (#1553), between lobbies:
   * no own lobby opens until the join ends.
   */
  let following: string | undefined;
  /**
   * The rail entry this player last chose (#1525): a host's mode is its
   * lobby's; a guest's modes show its host's instead (#1526).
   */
  let shownEntry: RailEntry = loadRail();
  /**
   * Whether the screen shown follows the lobby: a rail screen, which
   * redraws as it changes, or the Team Lobby. An editor never does.
   */
  let followsLobby = false;
  /** Whether the Team Lobby screen is up (#1460). */
  let teamLobbyShown = false;
  /** The party the rail was last drawn for: a builder's rail redraws only when its locks change. */
  let drawnParty = "";
  /** The rail entry last drawn: a guest's mode screen follows its host's (#1526). */
  let drawnEntry: RailEntry = "random-arena";
  let match: MatchView | undefined;
  /** The lobby's chat (#479), for as long as the lobby: on its screen, then over its match. */
  let chat: ChatPanel | undefined;
  /**
   * Set synchronously the moment a match is requested.
   *
   * `match` itself is only assigned after `startMatchView` resolves, and
   * a lobby state change arriving during that await would otherwise find
   * `match === undefined` and pull the player back to the lobby screen.
   */
  let enteringMatch = false;
  let lobbyNotice: string | undefined;
  /** While the lobby is in a Team Lobby (#1460). */
  let teamPicks: TeamPicks | undefined;
  /**
   * Why the last attempt to reach a lobby failed, shown on the menu
   * the player lands back on. Cleared when they try again.
   */
  let menuNotice: string | undefined;
  /**
   * The Random Arena queue and its screen (#880), from *Random Arena* to
   * the menu again: through its lobby and its match, which show the
   * splash and end on the menu rather than a lobby screen.
   */
  let queue:
    | {
        readonly place: RandomArenaQueue;
        readonly screen: QueueScreen;
        readonly mode: QueueMode;
        readonly name: string;
      }
    | undefined;
  /**
   * A team mode's party in the queue (#1766), from its lobby queueing
   * until it is back in it: the party board and key while its members
   * consent, the queue's place once it formed, and, while its match's
   * lobby is up, the party lobby out of sight and still live (ADR-0041).
   */
  let teamQueue:
    | {
        readonly party: LobbyConnection;
        readonly nonce: string;
        /** By `Date.now`. */
        readonly since: number;
        readonly timer: number;
        pressed: ReturnType<typeof openPartyBoard> | undefined;
        place: RandomArenaQueue | undefined;
        parked:
          | {
              readonly hosted: HostedLobby | undefined;
              readonly entrant: Entrant;
              readonly name: string;
            }
          | undefined;
        /** The party lobby closed while out of sight: what to say back on the menu. */
        partyClosed: string | undefined;
        /** Whether the screen offers *Play the house team* yet. */
        houseTeamShown: boolean;
        /** Teams its queue last heard searching (#1881); `undefined` until it says, or while it can't. */
        teams: number | undefined;
        /** Its match is over: whoever leaves it first is no news. */
        finished: boolean;
      }
    | undefined;
  /** Set while *Random Arena* is reading the character, so a second press makes no second ticket. */
  let joiningQueue = false;
  /** Queued wins in a row this visit (#881): page memory only, never stored. */
  let queueStreak = 0;
  /** The queued match's result line once it finished, whether this side won, and the timer to its ended view. */
  let queuedEnd:
    { readonly outcome: string; readonly won: boolean; readonly timer: number } | undefined;
  /**
   * A team match's end (#1997), once it finished: what comes next, when
   * by `Date.now`, the party a win queues again, and the countdown's tick.
   */
  let teamEnd:
    | {
        action: TeamEndAction;
        readonly endsAt: number;
        readonly party: LobbyConnection | undefined;
        readonly timer: number;
      }
    | undefined;
  /** The ended view's result line, while it is up. */
  let endedOutcome: string | undefined;
  /** The ended view's match summary (#1057), while it is up. */
  let endedSummary: readonly SummaryTable[] | undefined;
  /**
   * *Stay together* after a queued win (#882), while it is offered: the
   * lobby the vote goes through, the hosted lobby when this tab hosts it,
   * and the member key once pressed, on the board it was made on.
   */
  let stay:
    | {
        readonly lobby: LobbyConnection;
        readonly hosted: HostedLobby | undefined;
        /** By `Date.now`. */
        readonly endsAt: number;
        /**
         * Pressed, when to give up on the host's answer, by `Date.now`:
         * the host's vote window, or later once this player signed a
         * proposal (#1078).
         */
        answerBy: number;
        readonly timer: number;
        pressed: ReturnType<typeof openPartyBoard> | undefined;
        hostLeft: boolean;
      }
    | undefined;

  const clearQueuedEnd = (): void => {
    if (queuedEnd !== undefined) {
      clearTimeout(queuedEnd.timer);
      queuedEnd = undefined;
    }
  };

  const clearTeamEnd = (): void => {
    if (teamEnd !== undefined) {
      clearInterval(teamEnd.timer);
      teamEnd = undefined;
    }
  };

  /**
   * Stop offering *Stay together*. `keep` is the board a party formed on,
   * which goes on to its queue; otherwise a pressed key's board closes.
   * Not pressed, this player says no first. A remote lobby is left; this
   * tab's own stays up until its vote is over, unless this player's yes
   * is in it, which must not form a party without them.
   */
  const closeStay = (keep?: NostrQueue): void => {
    const ending = stay;
    if (ending === undefined) {
      return;
    }
    stay = undefined;
    clearInterval(ending.timer);
    if (ending.pressed === undefined && !ending.hostLeft) {
      ending.lobby.stayTogether(null);
    }
    if (ending.pressed !== undefined && ending.pressed.board !== keep) {
      ending.pressed.board.close();
    }
    if (ending.hosted === undefined) {
      void ending.lobby.disconnect();
    } else if (ending.pressed !== undefined && keep === undefined) {
      void ending.lobby.disconnect();
      void ending.hosted.close();
    }
  };

  /** Out of the queue, if in it; the lobby and match, if any, are the caller's to leave. */
  const dropQueue = (): void => {
    clearQueuedEnd();
    closeStay();
    endedOutcome = undefined;
    endedSummary = undefined;
    queue?.place.leave();
    queue?.screen.dispose();
    queue = undefined;
  };

  /**
   * On the menu or the queue's ended view (#1268), the screens a newer
   * build may reload away. Every screen change clears it first.
   */
  let idleScreen = false;

  const screenTurns = createScreenTurns();
  /**
   * Whose turn joining a lobby is (#1526): a join can wait 20 s for its
   * host, and a newer join or a Random Arena queue started meanwhile ends
   * an older one's, which then seats nothing.
   */
  const joinTurns = createScreenTurns();

  /**
   * The first thing every screen change does (#710): a toast belongs to
   * the screen that raised it, so it goes when that screen does. One the
   * next screen raises while it mounts stays. A screen added later calls
   * this first too, before anything mounts. Its turn (#1513) says whether
   * a screen that awaits before it draws still has the screen.
   */
  const leaveScreen = (): ScreenTurn => {
    idleScreen = false;
    followsLobby = false;
    teamLobbyShown = false;
    dismissToast();
    closeBeatEditor();
    notices.leave();
    return screenTurns.take();
  };

  // The bar's [?] and ⚙ open Help and Options over the screen, which
  // stays as it was underneath: an editor keeps its edits, a lobby keeps
  // updating (#454, #1257).
  const topbarView = mountTopbar(topbar, {
    onHelp: () => {
      openHelpOverlay(app);
    },
    onOptions: () => {
      // Closed over the menu, its characters wear the cape just picked in
      // Options (#1513). Not when a match starting closed it, which leaves
      // the screen first; any other screen keeps what it joined with.
      openOptionsOverlay(app, () => {
        const menu = idleScreen && screenRoot.querySelector(".screen-rail") !== null;
        if (renamedAlone()) {
          // Nobody else is in it to keep its code for: the lobby is opened
          // again under the new name and tag (#1526).
          void (async () => {
            await closeLobby();
            if (menu) {
              showMenu();
            } else {
              openOwnLobby();
            }
          })();
          return;
        }
        if (menu) {
          showMenu();
        }
      });
    },
    onJoin: (code, name) => {
      joinWith(code, name);
    },
    onLeave: () => {
      void leaveLobby();
    },
    onSetOpen: (open) => {
      hosted?.setOpen(open);
    },
  });

  const showViewport = (visible: boolean): void => {
    if (visible) {
      leaveScreen();
      // From the bar, over a lobby whose match just started: it goes with
      // the screens.
      closeOptionsOverlay();
      closeHelpOverlay();
    }
    // In a match the viewport has the whole height; the HUD has the bar's
    // buttons (#454).
    topbarView.setInMatch(visible);
    viewport.style.display = visible ? "block" : "none";
    screenRoot.style.display = visible ? "none" : "flex";
    if (chat !== undefined) {
      // Moved, not rebuilt: the lines and a half-typed one come along.
      (visible ? viewport : app).append(chat.root);
      chat.setInMatch(visible);
    }
  };

  const closeChat = (): void => {
    chat?.dispose();
    chat = undefined;
  };

  /**
   * The selected character's build, read fresh from storage.
   *
   * Read once, when the player enters a lobby (`readEntrant`), and played
   * every match of it: a character selected, edited or deleted elsewhere
   * meanwhile (another tab) is taken by leaving and joining again, as in
   * GW1 (#1070). An id pointing at a character
   * that no longer exists, or one that no longer validates, resolves to
   * `undefined` and a starter build from the host.
   */
  const activeBuild = async (id: string | undefined): Promise<PlayerBuild | undefined> => {
    if (id === undefined) {
      return undefined;
    }
    try {
      const character = await characters.load(id);
      return character === undefined ? undefined : toPlayerBuild(character);
    } catch (error) {
      // A build that cannot be read is not worth failing the match over;
      // the host would refuse an invalid one anyway.
      console.warn("[web] could not load the selected character", error);
      return undefined;
    }
  };

  /**
   * The selected character, read fresh: the one read per lobby (#1070).
   * The lobby lists it (#580) by the selected one's name and professions,
   * or `null` for a starter build. A build the host would refuse, an
   * illegal one, plays a starter build, so it is listed as that too.
   */
  const readEntrant = async (): Promise<Entrant> => {
    const id = loadActiveCharacterId();
    const build = await activeBuild(id);
    const character =
      build === undefined ||
      resolveJoinLoadout(build, MINIMAL_GW_INSPIRED_PVP_V1.attributes, Math.random).refused !==
        undefined
        ? null
        : {
            name: build.name,
            primary: build.primaryProfession,
            secondary: build.secondaryProfession ?? null,
          };
    return {
      build,
      guild: playerGuild(),
      character,
    };
  };

  /** The open build editor; every way out of it passes through `showMenu`. */
  let editor: BuildEditorView | undefined;

  const showMenu = (): void => {
    const turn = leaveScreen();
    // Every way back to the menu passes through here, so the status bar
    // never keeps saying where the player was: idle, it says nothing (#454).
    // Error paths set theirs after.
    setStatus("", "offline");
    // Any way off the queue screen leaves the queue (#880).
    dropQueue();
    editor?.dispose();
    editor = undefined;
    teamEditor?.dispose();
    teamEditor = undefined;
    showViewport(false);
    music().menu("main");
    idleScreen = true;
    // Back from a queue, a lost lobby or a Leave: a fresh one of its own (#1526).
    openOwnLobby();
    if (lobby?.getSnapshot().phase === "team-lobby") {
      lobbyChanged();
      return;
    }
    followsLobby = true;
    void refreshEntrant();
    drawRail(turn);
  };

  /** The rail entry to show: a guest's modes are its host's (#1526). */
  const railEntry = (): RailEntry => {
    const party = railParty();
    return party !== undefined && !party.isHost && isModeEntry(shownEntry)
      ? party.mode
      : shownEntry;
  };

  /** The rail screen for `railEntry`, if `turn` still has the screen once it has read what it shows. */
  const drawRail = (turn: ScreenTurn): void => {
    const party = railParty();
    drawnParty = party === undefined ? "" : `${party.mode}:${String(party.isHost)}`;
    const entry = railEntry();
    drawnEntry = entry;
    if (entry !== "random-arena" && entry !== "characters") {
      void showTeamScreen(entry, turn);
      return;
    }
    void (async () => {
      const { characters: list, problems } = await characters.list();
      // Host, Join or Random Arena clicked on the old menu while this
      // awaited (#1513): that screen has it now, so draw nothing over it.
      if (!turn()) {
        return;
      }
      // A lobby change redraws the screen under the player's keyboard:
      // the card it was on keeps the focus (#1526).
      const cardsBefore = [...screenRoot.querySelectorAll<HTMLElement>(".play-card-open")];
      const focused = cardsBefore.findIndex((card) => card === document.activeElement);
      renderMenuWith(entry, list, [...problems, ...notices.draw(entry)]);
      if (focused !== -1) {
        screenRoot.querySelectorAll<HTMLElement>(".play-card-open")[focused]?.focus();
      }
    })();
  };

  /**
   * Another rail entry (#1525), as the rail stored it: a host's mode is
   * its lobby's too (#1526), and every member's screen follows.
   */
  const switchTo = (entry: RailEntry): void => {
    shownEntry = entry;
    menuNotice = undefined;
    const snapshot = queue === undefined ? lobby?.getSnapshot() : undefined;
    if (isModeEntry(entry) && snapshot?.isHost === true && snapshot.mode !== entry) {
      lobby?.selectMode(entry);
    }
    showMenu();
  };

  /** Random Arena or Character Builder (#1525), with `list`. */
  const renderMenuWith = (
    entry: "random-arena" | "characters",
    list: readonly StoredCharacter[],
    problems: readonly string[] = [],
  ): void => {
    (entry === "random-arena" ? renderRandomArena : renderCharacterBuilder)(
      screenRoot,
      {
        onRandomArena: (mode, name) => {
          void enterRandomArena(mode, name);
        },
        onSwitch: switchTo,
        onNewCharacter: () => {
          showCharacterEditor(newCharacter(crypto.randomUUID()));
        },
        onEditCharacter: (id) => {
          void (async () => {
            const character = await characters.load(id);
            if (character !== undefined) {
              showCharacterEditor(character);
            }
          })();
        },
        onCloneStarter: (id) => {
          void (async () => {
            const character = await characters.load(id);
            if (character === undefined) {
              showMenu();
              return;
            }
            // Only the random starter has Clone: a copy of the character shown,
            // as the editor's Duplicate makes (#2038).
            const copy = cloneCharacter(character, crypto.randomUUID(), Date.now());
            try {
              await characters.save(copy);
            } catch (error) {
              console.warn("[web] could not save the clone", error);
              showMenu();
              return;
            }
            showCharacterEditor(copy);
          })();
        },
        onRerollCharacter: (id) => {
          void (async () => {
            const character = await characters.load(id);
            if (character !== undefined) {
              await rerollStarterCharacter(
                characters,
                character,
                Math.random,
                Date.now(),
                list.map((c) => c.name),
              );
            }
            showMenu();
          })();
        },
        // The menu persists the choice itself; re-render so the
        // highlighted row matches what was just picked, without a round
        // trip to storage for a list we already hold.
        onSelectCharacter: () => {
          renderMenuWith(entry, list, problems);
          // The lobby lists, and plays, the one picked (#1526).
          void refreshEntrant();
        },
      },
      list,
      problems,
      menuNotice,
    );
  };

  /** The build editor for `character`; every way out of it goes `back`. */
  const showCharacterEditor = (character: StoredCharacter, back: () => void = showMenu): void => {
    leaveScreen();
    music().menu("character-builder");
    const editorCallbacks = {
      onSave: (saved: StoredCharacter) => characters.save(saved),
      onDelete: (id: string) => {
        void (async () => {
          await characters.delete(id);
          back();
        })();
      },
      onDuplicate: (source: StoredCharacter) => {
        const copy = cloneCharacter(source, crypto.randomUUID(), Date.now());
        void (async () => {
          await characters.save(copy);
          back();
        })();
      },
      onClose: back,
    };
    teamEditor?.dispose();
    teamEditor = undefined;
    editor?.dispose();
    editor = mountBuildEditor(screenRoot, character, editorCallbacks);
  };

  /**
   * This tab's own lobby (#1526, ADR-0041), unless it is in one, opening
   * one, or queued: a fresh code, on the mode this player last chose. It
   * starts in the Team Lobby (#1460). Only the Random Arena queue hosts
   * any other kind.
   */
  const openOwnLobby = (): void => {
    /** In a lobby, or on the way to a queue: no own one now. */
    const elsewhere = (): boolean => lobby !== undefined || queue !== undefined || joiningQueue;
    if (elsewhere() || opening || stay !== undefined || following !== undefined) {
      return;
    }
    opening = true;
    void (async () => {
      const name = loadPlayerName();
      const entrant = await readEntrant();
      let own: HostedLobby;
      try {
        own = await hostLobby(name, entrant.guild, entrant.character, true);
      } catch (error) {
        opening = false;
        console.warn("[web] could not open a lobby", error);
        menuNotice = joinFailureNotice(error, location, loadTurnConfig() !== undefined);
        redrawRail();
        return;
      }
      opening = false;
      // Joined another, or queued, meanwhile: that one is the lobby.
      if (elsewhere()) {
        await own.lobby.disconnect();
        await own.close();
        return;
      }
      // Renamed while the key was derived: nobody can be in it yet, so it
      // opens again under the new name and tag.
      if (
        name !== loadPlayerName() ||
        JSON.stringify(entrant.guild) !== JSON.stringify(playerGuild())
      ) {
        await own.lobby.disconnect();
        await own.close();
        openOwnLobby();
        return;
      }
      hosted = own;
      if (isModeEntry(shownEntry) && shownEntry !== own.lobby.getSnapshot().mode) {
        own.lobby.selectMode(shownEntry);
      }
      seatLobby(name, own.lobby, entrant);
    })();
  };

  /** Whether this player is alone in its own lobby, under another name or guild than now. */
  const renamedAlone = (): boolean =>
    hosted !== undefined &&
    lobby === hosted.lobby &&
    isAlone(railParty()) &&
    (lobbyName !== loadPlayerName() ||
      JSON.stringify(lobbyEntrant?.guild) !== JSON.stringify(playerGuild()));

  /**
   * Out of the lobby this tab is in, ending it for everyone if it is this
   * tab's own; with `moveTo`, its guests follow to that key (#1553).
   */
  const closeLobby = async (moveTo?: string): Promise<void> => {
    endTeamQueue();
    const leaving = lobby;
    const ending = hosted;
    lobby = undefined;
    hosted = undefined;
    lobbyEntrant = undefined;
    lobbyName = undefined;
    closeChat();
    syncParty(undefined);
    // The host first: its own player going would end it without the move.
    await ending?.close(moveTo);
    await leaving?.disconnect();
  };

  /** Whether the tab moved on since `turn`: a newer join, a queue, a stay or a match. */
  const movedOnSince = (turn: () => boolean): boolean =>
    !turn() ||
    queue !== undefined ||
    joiningQueue ||
    stay !== undefined ||
    match !== undefined ||
    enteringMatch;

  /**
   * Follow this tab's host to the lobby it moved to (#1553). The tab has
   * no lobby meanwhile, so a failure opens a fresh own one and says whom
   * it could not follow. It takes a newer turn than any join of the
   * player's own still in flight, so the host's move overrides that one.
   */
  const followTo = (move: HostMove, name: string): void => {
    const turn = joinTurns.take();
    following = move.code;
    setRailParty(undefined);
    topbarView.setLobby({ code: move.code, isHost: false, open: false, party: 0, joining: true });
    setStatus("connecting…", "offline");
    menuNotice = undefined;
    void followHost(
      move,
      {
        join: async (code) => {
          const entrant = await readEntrant();
          const joined = await joinLobbyByCode(code, name, entrant.guild, entrant.character);
          return { joined, entrant };
        },
        movedOn: () => movedOnSince(turn),
        seat: ({ joined, entrant }) => {
          following = undefined;
          setStatus("", "online");
          seatLobby(name, joined, entrant);
        },
        drop: async ({ joined }) => {
          following = undefined;
          await joined.disconnect();
        },
        fallBack: (notice) => {
          following = undefined;
          syncParty(lobby?.getSnapshot());
          if (notice !== undefined) {
            menuNotice = notice;
            redrawRail();
            setStatus("could not join", "error");
            if (!followsLobby) {
              toast(notice);
            }
          }
          openOwnLobby();
        },
      },
      location,
      loadTurnConfig() !== undefined,
    );
  };

  /**
   * Join the lobby `code` from the title bar (#1526): this tab's own stays
   * open until the join is in, so a failed one keeps its code and guests,
   * and only then sends them after it (#1553).
   */
  const joinWith = (code: string, name: string): void => {
    const turn = joinTurns.take();
    const movedOn = (): boolean => movedOnSince(turn);
    void (async () => {
      const current = lobby?.getSnapshot().code;
      if (current !== undefined && normalizeLobbyCode(code) === current) {
        if (hosted !== undefined) {
          toast(OWN_LOBBY_NOTICE);
        }
        return;
      }
      const entrant = await readEntrant();
      setStatus("connecting…", "offline");
      menuNotice = undefined;
      let joined: LobbyConnection;
      try {
        joined = await joinLobbyByCode(code, name, entrant.guild, entrant.character);
      } catch (error) {
        console.warn("[web] could not join the lobby", error);
        if (movedOn()) {
          return;
        }
        menuNotice = joinFailureNotice(error, location, loadTurnConfig() !== undefined);
        redrawRail();
        setStatus("could not join", "error");
        return;
      }
      if (movedOn()) {
        // Too late: whatever the tab is in now stays, and the friend's
        // lobby keeps no member that never arrives.
        await joined.disconnect();
        return;
      }
      // In: only now does this tab's own lobby close, sending its guests
      // after it (#1553).
      await closeLobby(normalizeLobbyCode(code));
      if (movedOn()) {
        await joined.disconnect();
        return;
      }
      setStatus("", "online");
      seatLobby(name, joined, entrant);
    })();
  };

  /** The lobby's part of `entry`'s screen (#1526), once there is a lobby. */
  const panelFor = (entry: HostEntry): LobbyPanel | undefined => {
    if (lobby === undefined || queue !== undefined) {
      return undefined;
    }
    return lobbyPanel(
      lobby.getSnapshot(),
      {
        onSelectMap: (mapId) => {
          lobby?.selectMap(mapId);
        },
        onChooseTeam: (team) => {
          lobby?.chooseTeam(team);
        },
        onToggleReady: () => {
          const self = lobby
            ?.getSnapshot()
            .players.find((p) => p.sessionId === lobby?.selfSessionId);
          lobby?.setReady(!(self?.ready ?? false));
        },
        onStart: () => {
          lobby?.startMatch();
        },
        onWatch: () => {
          void watchMatch();
        },
        onSetBots: (team, count) => {
          lobby?.setBots(team, count);
        },
      },
      lobbyNotice,
      hostMaps(availableMaps, LOBBY_MODE_MATCH_MODES[entry]).filter((map) =>
        modeMapIds()[entry].includes(map.id),
      ),
      matchmakingFor(entry),
    );
  };

  /** A team mode's Find a match, Leave the queue and Play the house team (#1766). */
  const matchmakingFor = (entry: HostEntry): LobbyMatchmaking | undefined => {
    if (lobby === undefined || teamQueueModeOf(entry) === undefined) {
      return undefined;
    }
    return {
      queuedMs: queuedMsOf(lobby.getSnapshot()),
      onFindMatch: () => {
        lobby?.findMatch();
      },
      onLeaveQueue: () => {
        lobby?.leaveQueue();
      },
      onPlayHouseTeam: () => {
        lobby?.playHouseTeam();
      },
    };
  };

  /**
   * A team mode, Hosted Game or Team Builder (#1525), as `showMenu` shows
   * them. The modes show the lobby (#1526), which starts Team Lobbies
   * (#1460), where a Team Build is proposed.
   */
  const showTeamScreen = async (
    entry: Exclude<RailEntry, "random-arena" | "characters">,
    turn: ScreenTurn,
  ): Promise<void> => {
    const [teamList, characterList] = await Promise.all([teams.list(), characters.list()]);
    // Join or another entry pressed on the old screen while this awaited (#1513).
    if (!turn()) {
      return;
    }
    const callbacks: TeamPlayCallbacks = {
      onSwitch: switchTo,
      // A new team is stored only once it is saved (#573).
      onNewTeam: () => {
        showTeamEditor(openedTeam(newTeam(crypto.randomUUID()), false), characterList.characters);
      },
      onEditTeam: (id) => {
        void (async () => {
          const team = await teams.load(id);
          if (team !== undefined) {
            showTeamEditor(openedTeam(team, true), characterList.characters);
          }
        })();
      },
      onPasteTeam: (text) => {
        const result = importTeam(text, () => crypto.randomUUID(), Date.now());
        if (!result.ok) {
          toast("Could not import", { problems: result.problems });
          return;
        }
        openPastedTeam(result.team, characterList.characters);
      },
      // Only the random starter team has Clone: an exact copy, to edit (#2036).
      onCloneStarterTeam: (id) => {
        void (async () => {
          const team = await teams.load(id);
          if (team === undefined) {
            showMenu();
            return;
          }
          const copy = duplicateTeam(team, crypto.randomUUID());
          try {
            await teams.save(copy);
          } catch (error) {
            console.warn("[web] could not save the clone", error);
            showMenu();
            return;
          }
          showTeamEditor(openedTeam(copy, true), characterList.characters);
        })();
      },
      onRerollTeam: (id) => {
        void (async () => {
          const team = await teams.load(id);
          if (team !== undefined) {
            await rerollStarterTeam(
              teams,
              team,
              Math.random,
              () => crypto.randomUUID(),
              Date.now(),
            );
          }
          showMenu();
        })();
      },
    };
    const problems = [...teamList.problems, ...notices.draw(entry)];
    if (isHostEntry(entry)) {
      renderHostScreen(
        screenRoot,
        entry,
        teamList.teams,
        problems,
        menuNotice,
        callbacks,
        panelFor(entry),
      );
    } else {
      renderTeamBuilder(screenRoot, teamList.teams, problems, menuNotice, callbacks);
    }
  };

  /** A pasted team (#577) opens unsaved; its members are its own (#1452). */
  const openPastedTeam = (team: StoredTeam, available: readonly StoredCharacter[]): void => {
    showTeamEditor(pastedTeam(team), available);
    toast(importedTeamSummary(team));
  };

  /**
   * `member` of the team `left` in the build editor (#576, #1452): its
   * Save puts it in the team, which comes back as it was left and still
   * unsaved; nothing is stored. Delete takes it off the team, Duplicate
   * adds a copy, and Esc comes back without either.
   */
  const showMemberEditor = (
    member: TeamCharacter,
    left: TeamEditorState,
    available: readonly StoredCharacter[],
  ): void => {
    const back = (team: StoredTeam): void => {
      showTeamEditor({ ...left, team }, available);
    };
    const present = left.team.members.some((m) => m.character.id === member.id);
    // What the way out takes back: the team as left, or with Save's member in it.
    let team = left.team;
    leaveScreen();
    music().menu("member-editor");
    teamEditor?.dispose();
    teamEditor = undefined;
    editor?.dispose();
    editor = mountBuildEditor(
      screenRoot,
      { ...member, schemaVersion: CHARACTER_SCHEMA_VERSION, updatedAt: Date.now() },
      {
        onSave: (saved) => {
          const character = teamCharacter(saved, member.id);
          team = present ? replaceMember(left.team, character) : addMember(left.team, character);
          return Promise.resolve();
        },
        onDelete: () => {
          back(
            present
              ? removeMember(
                  left.team,
                  left.team.members.findIndex((m) => m.character.id === member.id),
                )
              : left.team,
          );
        },
        onDuplicate: (source) => {
          const copy = teamCharacter(source, crypto.randomUUID());
          back(addMember(left.team, { ...copy, name: `${source.name} (copy)` }));
        },
        onClose: () => {
          back(team);
        },
      },
    );
  };

  /** The open team editor; every way out of it passes through `showMenu`, to the menu. */
  let teamEditor: TeamEditorView | undefined;

  const showTeamEditor = (state: TeamEditorState, available: readonly StoredCharacter[]): void => {
    leaveScreen();
    music().menu("team-builder");
    editor?.dispose();
    editor = undefined;
    teamEditor?.dispose();
    teamEditor = mountTeamEditor(screenRoot, state, available, {
      onSave: (saved) => teams.save(saved),
      onDuplicate: (source) => {
        void (async () => {
          await teams.save(duplicateTeam(source, crypto.randomUUID()));
          showMenu();
        })();
      },
      onDelete: (id) => {
        void (async () => {
          await teams.delete(id);
          showMenu();
        })();
      },
      onClose: () => {
        showMenu();
      },
      onImportTeam: (team) => {
        openPastedTeam(team, available);
      },
      onOpenMember: (memberId, left) => {
        const member = left.team.members.find((m) => m.character.id === memberId);
        if (member !== undefined) {
          showMemberEditor(member.character, left, available);
        }
      },
      // A new member joins only on the build editor's Save.
      onNewMember: (left) => {
        const blank = newCharacter(crypto.randomUUID());
        showMemberEditor(teamCharacter(blank, blank.id), left, available);
      },
    });
  };

  /**
   * Queue for a Random Arena with the active character (#880): the queue
   * screen until a group's lobby seats this player, its splash while it
   * counts down, then the match. Whether it queued: not without an
   * active character, while already queueing, or with a party (#1526).
   * This tab's own lobby closes first; the menu opens a fresh one after.
   */
  const enterRandomArena = async (
    mode: QueueMode,
    name: string,
    from: { readonly party?: PartyPlace; readonly note?: string } = {},
  ): Promise<boolean> => {
    if (
      queue !== undefined ||
      joiningQueue ||
      (from.party === undefined && !isAlone(railParty()))
    ) {
      from.party?.board.close();
      return false;
    }
    const id = loadActiveCharacterId();
    if (id === undefined) {
      return false;
    }
    joiningQueue = true;
    // A join still waiting for its host is over (#1526).
    joinTurns.take();
    let stored: StoredCharacter | undefined;
    let entrant: Entrant;
    try {
      stored = await characters.load(id);
      entrant = await readEntrant();
      if (stored !== undefined) {
        // Closed before the ticket: a join landing meanwhile is refused, not seated.
        await closeLobby();
      }
    } finally {
      joiningQueue = false;
    }
    if (stored === undefined) {
      from.party?.board.close();
      return false;
    }
    leaveScreen();
    menuNotice = undefined;
    setStatus("in queue", "online");
    const screen = mountQueueScreen(
      screenRoot,
      {
        mode,
        characterName: stored.name,
        mapName: (mapId) => ARENA_MAPS.find((map) => map.id === mapId)?.name ?? mapId,
      },
      {
        onLeave: () => {
          void leaveLobby();
        },
        onBack: () => {
          void leaveLobby();
        },
        onQueueAgain: () => {
          requeue(mode, name);
        },
        onStayTogether: () => {
          pressStay();
        },
      },
    );
    const { note } = from;
    const place = enterQueue(
      mode,
      name,
      entrant.guild,
      entrant.character,
      {
        // Never past `in-lobby` while a lobby is up, unless it fell through.
        onState: (state) => {
          // The split is news until a match is found.
          screen.show({
            kind: "queue",
            state,
            ...(note === undefined || state.kind !== "searching" ? {} : { note }),
          });
        },
        onLobby: (joined, host) => {
          hosted = host;
          seatLobby(name, joined, entrant);
        },
        onRefused: (notice) => {
          setStatus("could not join", "error");
          screen.show({ kind: "refused", notice });
        },
        onPartyGone: () => {
          requeue(mode, name, { note: TEAM_SPLIT_MESSAGE });
        },
      },
      from.party,
    );
    queue = { place, screen, mode, name };
    music().menu("queue");
    return true;
  };

  /** Out of this queue and into a fresh one of `mode`, alone or as `from.party`. */
  const requeue = (
    mode: QueueMode,
    name: string,
    from: { readonly party?: PartyPlace; readonly note?: string } = {},
  ): void => {
    dropQueue();
    void enterRandomArena(mode, name, from).then((queued) => {
      // The character went meanwhile: the menu, where *Random Arena* is greyed.
      if (!queued) {
        showMenu();
      }
    });
  };

  /** *Stay together*'s state for the ended view, if it is offered. */
  const stayOffer = (): StayOffer | undefined => {
    if (stay === undefined) {
      return undefined;
    }
    if (stay.hostLeft) {
      return { kind: "host-left" };
    }
    const secondsLeft = Math.max(0, Math.ceil((stay.endsAt - Date.now()) / 1000));
    return stay.pressed === undefined
      ? { kind: "offer", secondsLeft }
      : { kind: "waiting", secondsLeft };
  };

  const showEnded = (): void => {
    if (queue === undefined || endedOutcome === undefined) {
      return;
    }
    const offer = stayOffer();
    queue.screen.show({
      kind: "ended",
      outcome: endedOutcome,
      streak: queueStreak,
      summary: endedSummary,
      ...(offer === undefined ? {} : { stay: offer }),
    });
  };

  /** The team did not stay together: queue alone at once, and say so. */
  const splitUp = (): void => {
    if (queue === undefined) {
      return;
    }
    const { mode, name } = queue;
    requeue(mode, name, { note: TEAM_SPLIT_MESSAGE });
  };

  const pressStay = (): void => {
    if (stay === undefined || stay.pressed !== undefined || stay.hostLeft) {
      return;
    }
    stay.pressed = openPartyBoard();
    stay.lobby.stayTogether(stay.pressed.key);
    showEnded();
  };

  /**
   * Offer *Stay together* through `through`, the finished match's lobby,
   * to this winner of a whole team (#882); `hosted` when this tab hosts it.
   */
  const offerStay = (through: LobbyConnection, hosted: HostedLobby | undefined): void => {
    const timer = window.setInterval(() => {
      if (
        stay === undefined ||
        Date.now() < (stay.pressed === undefined ? stay.endsAt : stay.answerBy)
      ) {
        showEnded();
        return;
      }
      if (stay.pressed !== undefined) {
        // No answer in time: the host's vote window, and its consent window
        // after a proposal, both end before this, so it is gone.
        splitUp();
        return;
      }
      closeStay();
      showEnded();
    }, 250);
    stay = {
      lobby: through,
      hosted,
      endsAt: Date.now() + STAY_TOGETHER_SECONDS * 1000,
      answerBy: Date.now() + (STAY_TOGETHER_SECONDS + STAY_TOGETHER_GRACE_SECONDS) * 1000,
      timer,
      pressed: undefined,
      hostLeft: false,
    };
    const offered = stay;
    through.onPartyProposal(() => {
      if (stay === offered) {
        offered.answerBy = Math.max(offered.answerBy, Date.now() + PARTY_ANSWER_MS);
      }
    });
    through.onParty((formed) => {
      if (stay !== offered || offered.pressed === undefined || queue === undefined) {
        return;
      }
      if (formed === null) {
        splitUp();
        return;
      }
      const { board, key } = offered.pressed;
      const { mode, name } = queue;
      closeStay(board);
      const { groupId, members, consents } = formed;
      requeue(mode, name, { party: { party: { members, key, groupId, consents }, board } });
    });
    through.onClosed(() => {
      if (stay !== offered) {
        return;
      }
      if (offered.pressed !== undefined) {
        splitUp();
        return;
      }
      offered.hostLeft = true;
      clearInterval(offered.timer);
      showEnded();
    });
  };

  /** The rail screen shown again, as it is now: a notice to say, or a party gone. */
  const redrawRail = (): void => {
    if (followsLobby && !teamLobbyShown) {
      drawRail(screenTurns.take());
    }
  };

  /** How long the party in sight has looked for a team (#1766), or `null`. */
  const queuedMsOf = (snapshot: LobbySnapshot): number | null =>
    teamQueue !== undefined &&
    teamQueue.parked === undefined &&
    lobby === teamQueue.party &&
    snapshot.phase === "queued"
      ? Date.now() - teamQueue.since
      : null;

  /** The queue strip's wait, each second; the screen again once the house team is offered. */
  const tickTeamQueue = (): void => {
    const current = teamQueue;
    if (current === undefined || current.parked !== undefined || lobby !== current.party) {
      return;
    }
    const snapshot = current.party.getSnapshot();
    const queuedMs = queuedMsOf(snapshot);
    if (queuedMs === null) {
      return;
    }
    syncParty(snapshot);
    for (const label of document.querySelectorAll(".party-queued")) {
      label.textContent = lookingLabel(queuedMs, current.teams);
    }
    if (!current.houseTeamShown && queuedMs >= HOUSE_TEAM_AFTER_MS) {
      current.houseTeamShown = true;
      redrawRail();
    }
  };

  /**
   * Follow `party`'s queueing (#1766): queued under a new nonce, this
   * member of its team brings a fresh key to it, or a one-human team's
   * host queues alone; out of the queue, so is this tab. A newcomer
   * outside the team is in no ticket.
   */
  const syncTeamQueue = (party: LobbyConnection): void => {
    const snapshot = party.getSnapshot();
    const nonce = snapshot.phase === "queued" ? snapshot.queueNonce : null;
    const current = teamQueue;
    if (current !== undefined) {
      // In its match, the party lobby is its host's to put back.
      if (current.party !== party || current.nonce === nonce || current.parked !== undefined) {
        return;
      }
      endTeamQueue();
    }
    const mode = teamQueueModeOf(snapshot.mode);
    const self = snapshot.players.find((p) => p.sessionId === party.selfSessionId);
    if (nonce === null || mode === undefined || self?.team !== 0 || lobby !== party) {
      return;
    }
    const started: NonNullable<typeof teamQueue> = {
      party,
      nonce,
      since: Date.now(),
      timer: window.setInterval(tickTeamQueue, 1000),
      pressed: undefined,
      place: undefined,
      parked: undefined,
      partyClosed: undefined,
      houseTeamShown: false,
      teams: undefined,
      finished: false,
    };
    teamQueue = started;
    music().menu("queue");
    if (snapshot.players.filter((p) => !p.bot && p.team === 0).length < 2) {
      if (snapshot.isHost) {
        queueTeam(started, mode, undefined);
      }
      return;
    }
    started.pressed = openPartyBoard();
    party.queueParty(started.pressed.key);
  };

  /**
   * `current`'s party into the queue of `mode` (#1766), as `party` when
   * it has more than one human. Its host sends the match its side's
   * seats. The match's lobby, once met, is the one in sight, the party's
   * kept out of sight until it is over.
   */
  const queueTeam = (
    current: NonNullable<typeof teamQueue>,
    mode: QueueMode,
    party: PartyPlace | undefined,
  ): void => {
    const entrant = lobbyEntrant;
    const name = lobbyName;
    if (entrant === undefined || name === undefined) {
      party?.board.close();
      return;
    }
    const own = hosted?.lobby === current.party ? hosted : undefined;
    current.place = enterQueue(
      mode,
      name,
      entrant.guild,
      entrant.character,
      {
        // The queue strip says the wait and how many teams it last heard
        // searching (#1881), none while the relays are down; the queue's
        // other states are its own.
        onState: (state) => {
          if (state.kind === "searching") {
            current.teams = state.teams;
          } else if (state.kind === "unreachable") {
            current.teams = undefined;
          }
        },
        onLobby: (joined, host) => {
          if (teamQueue !== current || current.parked !== undefined || lobby !== current.party) {
            void host?.close();
            void joined.disconnect();
            return;
          }
          current.parked = { hosted, entrant, name };
          lobby = undefined;
          closeChat();
          hosted = host;
          seatLobby(name, joined, entrant);
          // Its match is the queue's end: the party lobby waits again,
          // as each member finds it back from the match.
          joined.onMatchStarting(() => {
            if (current.party.getSnapshot().isHost) {
              current.party.leaveQueue();
            }
          });
        },
        onRefused: (notice) => {
          if (teamQueue !== current) {
            return;
          }
          if (current.party.getSnapshot().isHost) {
            current.party.leaveQueue();
          }
          endTeamQueue();
          lobbyNotice = notice;
          redrawRail();
        },
        onPartyGone: () => {
          // Its host is gone from the queue: the party lobby says the rest.
          if (teamQueue === current) {
            endTeamQueue();
          }
        },
      },
      party,
      own === undefined ? undefined : (selfKey) => own.teamPlan(selfKey),
    );
  };

  /** The party lobby back in sight (#1766), its match's lobby left; or the menu, if it closed. */
  const unpark = (current: NonNullable<typeof teamQueue>): void => {
    const { parked } = current;
    if (parked === undefined) {
      return;
    }
    current.parked = undefined;
    const matchRoom = lobby;
    const matchHost = hosted;
    lobby = undefined;
    hosted = undefined;
    closeChat();
    void (async () => {
      await matchHost?.close();
      await matchRoom?.disconnect();
    })();
    if (current.partyClosed !== undefined) {
      menuNotice = current.partyClosed;
      lobbyEntrant = undefined;
      lobbyName = undefined;
      endTeamQueue();
      syncParty(undefined);
      return;
    }
    lobby = current.party;
    hosted = parked.hosted;
    lobbyEntrant = parked.entrant;
    lobbyName = parked.name;
    mountLobbyChat(current.party);
    syncParty(current.party.getSnapshot());
  };

  /**
   * Out of the team queue (#1766): its place and board closed, the party
   * lobby back in sight, and, by its host, back to waiting.
   */
  const endTeamQueue = (): void => {
    const ending = teamQueue;
    if (ending === undefined) {
      return;
    }
    teamQueue = undefined;
    clearInterval(ending.timer);
    ending.place?.leave();
    ending.pressed?.board.close();
    unpark(ending);
    if (lobby === ending.party && ending.party.getSnapshot().isHost) {
      ending.party.leaveQueue();
    }
  };

  /** The rail and the title bar name `snapshot`'s party, or none (#1526). */
  const syncParty = (snapshot: LobbySnapshot | undefined): void => {
    setRailParty(
      snapshot === undefined
        ? undefined
        : partyOf(snapshot, queuedMsOf(snapshot), teamQueue?.teams),
    );
    topbarView.setLobby(
      snapshot === undefined
        ? undefined
        : {
            code: snapshot.code,
            isHost: snapshot.isHost,
            open: snapshot.open,
            party: snapshot.players.filter((p) => !p.bot).length,
            joining: false,
          },
    );
  };

  /**
   * The lobby changed: the screen follows it. The lobby connection stays
   * open for the whole match, so every lobby state change still fires
   * this. Without the match guard, the lobby's own "phase -> in-match"
   * broadcast lands just after `enterMatch` showed the viewport and puts
   * the player straight back on the lobby screen, with the match running
   * unseen underneath. Found by the browser tests; nothing headless could
   * have caught it, because the bug lives entirely in how the two screens
   * are sequenced.
   */
  const lobbyChanged = (): void => {
    if (match !== undefined || enteringMatch) {
      return;
    }
    if (lobby === undefined) {
      syncParty(undefined);
      redrawRail();
      return;
    }
    if (teamQueue?.parked !== undefined) {
      // A team's match's lobby counts down under the party's screen (#1766).
      setStatus("match found", "online");
      return;
    }
    const snapshot = lobby.getSnapshot();
    if (queue !== undefined) {
      // A queued lobby has nothing to choose: it is the versus splash.
      setStatus("match found", "online");
      queue.screen.show({ kind: "splash", snapshot });
      return;
    }
    syncParty(snapshot);
    if (snapshot.phase === "team-lobby") {
      // An open editor keeps its edits; its way out comes back here.
      if (editor !== undefined || teamEditor !== undefined) {
        return;
      }
      if (!teamLobbyShown) {
        leaveScreen();
        setStatus("", "online");
        showViewport(false);
        music().menu("team-lobby");
      }
      followsLobby = true;
      teamLobbyShown = true;
      renderTeamLobby(lobby, snapshot);
      return;
    }
    teamPicks = undefined;
    if (teamLobbyShown) {
      // The Team Lobby is over without a match: back to the mode's screen.
      showMenu();
      return;
    }
    const party = `${snapshot.mode}:${String(snapshot.isHost)}`;
    if (!followsLobby) {
      return;
    }
    // A builder keeps its screen, and a team code pasted into it (#1790).
    if (redrawsOnLobbyChange(railEntry(), drawnEntry)) {
      drawRail(screenTurns.take());
    } else if (party !== drawnParty) {
      drawnParty = party;
      redrawModeRail(screenRoot, drawnEntry, switchTo);
    }
  };

  /**
   * The character this player picked now, for the lobby to list and its
   * matches to play (#1526): the lobby outlives a pick on the menu.
   */
  const refreshEntrant = async (): Promise<void> => {
    const current = lobby;
    if (current === undefined || queue !== undefined) {
      return;
    }
    const entrant = await readEntrant();
    if (lobby !== current || lobbyEntrant === undefined) {
      return;
    }
    if (JSON.stringify(entrant.character) !== JSON.stringify(lobbyEntrant.character)) {
      current.setCharacter(entrant.character);
    }
    lobbyEntrant = entrant;
  };

  /** Propose the saved Team Build `teamId` in the Team Lobby, or withdraw with `undefined`. */
  const proposeTeam = (teamId: string | undefined): void => {
    if (teamPicks === undefined) {
      return;
    }
    const team = teamPicks.teams.find((saved) => saved.id === teamId);
    lobby?.propose(
      team === undefined ? null : team.members.map((member) => toPlayerBuild(member.character)),
    );
    teamPicks.proposed = team?.id;
    lobbyChanged();
  };

  /**
   * The Team Lobby screen (#1460). As it begins, the saved Team Builds
   * are read once, for its propose control; entering proposes nothing
   * (#1515).
   */
  const renderTeamLobby = (joined: LobbyConnection, snapshot: LobbySnapshot): void => {
    if (teamPicks === undefined) {
      const picks: TeamPicks = { teams: [], proposed: undefined };
      teamPicks = picks;
      void teams.list().then(({ teams: saved }) => {
        if (teamPicks !== picks || lobby !== joined) {
          return;
        }
        picks.teams = saved;
        lobbyChanged();
      });
    }
    renderTeamLobbyScreen(
      screenRoot,
      snapshot,
      teamPicks.teams,
      teamPicks.proposed,
      {
        onVote: (proposerId) => {
          lobby?.vote(proposerId);
        },
        onPropose: proposeTeam,
        onClaim: (slot) => {
          lobby?.claim(slot);
        },
        onToggleReady: () => {
          const self = lobby
            ?.getSnapshot()
            .players.find((p) => p.sessionId === lobby?.selfSessionId);
          lobby?.setReady(!(self?.ready ?? false));
        },
        onLeave: () => {
          void leaveLobby();
        },
      },
      lobbyNotice,
    );
  };

  /**
   * Leave the lobby; a host's leaving ends it for everyone. The menu
   * opens a fresh one of this tab's own (#1526).
   */
  const leaveLobby = async (notice?: string): Promise<void> => {
    await closeLobby();
    menuNotice = notice;
    showMenu();
  };

  /** The chat of `joined`, the lobby in sight. */
  const mountLobbyChat = (joined: LobbyConnection): void => {
    chat = mountChat({
      selfId: joined.selfSessionId,
      selfTeam: () =>
        joined.getSnapshot().players.find((p) => p.sessionId === joined.selfSessionId)?.team ??
        null,
      send: (channel, text) => {
        joined.sendChat(channel, text);
      },
    });
    app.append(chat.root);
  };

  /**
   * Show `joined`, coded or queued, and play its matches as `name` with
   * `entrant`'s build, every one of them (#1070).
   */
  const seatLobby = (name: string, joined: LobbyConnection, entrant: Entrant): void => {
    lobby = joined;
    lobbyEntrant = entrant;
    lobbyName = name;
    lobbyNotice = undefined;
    mountLobbyChat(joined);
    // A lobby out of sight says nothing to the chat.
    joined.onChat((line) => {
      if (lobby === joined) {
        chat?.add(line);
      }
    });
    joined.onChatThrottled(() => {
      if (lobby === joined) {
        chat?.notice("Slow down: your last lines were not sent.");
      }
    });
    // A lobby this tab has left says nothing more to it; a party lobby
    // out of sight while its match is up still queues (#1766).
    joined.onChange(() => {
      if (lobby === joined || teamQueue?.party === joined) {
        syncTeamQueue(joined);
      }
      if (lobby === joined) {
        lobbyChanged();
      }
    });
    joined.onParty((formed) => {
      const current = teamQueue;
      if (current?.party !== joined || current.pressed === undefined) {
        return;
      }
      const { board, key } = current.pressed;
      current.pressed = undefined;
      const mode = teamQueueModeOf(joined.getSnapshot().mode);
      if (formed === null || mode === undefined) {
        // No party this time: its lobby goes back to waiting.
        board.close();
        return;
      }
      const { groupId, members, consents } = formed;
      queueTeam(current, mode, { party: { members, key, groupId, consents }, board });
    });
    joined.onStartRejected((reason) => {
      if (lobby === joined) {
        lobbyNotice = reason;
        lobbyChanged();
      }
    });
    joined.onRefused((reason) => {
      if (lobby === joined) {
        lobbyNotice = lobbyRefusalNotice(reason);
        lobbyChanged();
      }
    });
    joined.onMatchStarting((start) => {
      // Only players on a team are sent this; a spectator stays here.
      if (lobby === joined) {
        void enterMatch(name, start, lobbyEntrant ?? entrant);
      }
    });
    const hostMove = watchHostMove(joined);
    joined.onClosed((reason) => {
      const team = teamQueue;
      if (team?.party === joined) {
        if (team.parked !== undefined) {
          team.partyClosed = lobbyClosedNotice(reason);
          return;
        }
        endTeamQueue();
      }
      if (lobby !== joined) {
        return;
      }
      // From the lobby or from its match: either way, it is over.
      lobby = undefined;
      hosted = undefined;
      lobbyEntrant = undefined;
      closeChat();
      if (teamQueue?.parked !== undefined && match === undefined && !enteringMatch) {
        // A team's match's lobby fell through (#1766): the party lobby, still queued.
        unpark(teamQueue);
        showMenu();
        return;
      }
      const move = hostMove();
      if (move !== undefined) {
        // Its host went on to another lobby (#1553): after it, quietly.
        followTo(move, name);
        return;
      }
      if (queue !== undefined && match === undefined && !enteringMatch) {
        // Before its match, a queued lobby closing puts the player back
        // in the queue, which says so on its screen.
        return;
      }
      syncParty(undefined);
      const notice = lobbyClosedNotice(reason);
      if (match !== undefined) {
        void exitMatch(notice);
        return;
      }
      enteringMatch = false;
      menuNotice = notice;
      if (followsLobby) {
        showMenu();
      } else {
        // An editor keeps its edits: the fresh lobby opens under it.
        toast(notice);
        openOwnLobby();
      }
    });
    lobbyChanged();
  };

  /**
   * A finished queued match, after its result (#881): out of the match
   * and its lobby, onto the queue screen's ended view rather than the
   * menu. The queue's place already closed as the match started.
   */
  const endQueuedMatch = async (outcome: string, won: boolean): Promise<void> => {
    clearQueuedEnd();
    const leaving = match;
    if (leaving === undefined) {
      return;
    }
    match = undefined;
    // Read before the view goes: the table moves with the player (#1057).
    const summary = leaving.summary();
    await leaving.dispose();
    enteringMatch = false;
    const leavingLobby = lobby;
    const ending = hosted;
    lobby = undefined;
    hosted = undefined;
    closeChat();
    const teamSize = queue === undefined ? 1 : teamSizeOf(queue.mode);
    const snapshot = leavingLobby?.getSnapshot();
    const selfTeam = snapshot?.players.find((p) => p.sessionId === snapshot.selfSessionId)?.team;
    // A whole winning side is still in the lobby: a member gone, and there is no party.
    const offered =
      won &&
      teamSize > 1 &&
      selfTeam !== undefined &&
      selfTeam !== null &&
      snapshot?.players.filter((p) => p.team === selfTeam).length === teamSize;
    if (ending !== undefined) {
      // The host holds its lobby for the winners' vote, whoever won (#882).
      void ending.done.then(async () => {
        await ending.lobby.disconnect();
        await ending.close();
      });
    } else if (!offered) {
      await leavingLobby?.disconnect();
    }
    if (queue === undefined) {
      return;
    }
    leaveScreen();
    setStatus("", "offline");
    showViewport(false);
    music().menu("main");
    endedOutcome = outcome;
    endedSummary = summary;
    idleScreen = true;
    if (offered && leavingLobby !== undefined) {
      offerStay(leavingLobby, ending);
    }
    showEnded();
  };

  /**
   * Back to where the player came from: the lobby if there is one, else
   * the menu, with `notice` on it. A no-op once the match is gone, so a
   * lost connection racing a leave click exits once.
   */
  const exitMatch = async (notice?: string): Promise<void> => {
    if (match === undefined) {
      return;
    }
    // Out before its countdown is over, or by it (#1997): no second exit.
    clearTeamEnd();
    if (queue !== undefined && queuedEnd !== undefined) {
      // Finished: leaving now, or the host going, only skips the wait.
      await endQueuedMatch(queuedEnd.outcome, queuedEnd.won);
      return;
    }
    const leaving = match;
    match = undefined;
    await leaving.dispose();
    leaveScreen();
    enteringMatch = false;
    // A team's match (#1766): back in the party's own lobby, the match's
    // end no news.
    const team = teamQueue?.parked === undefined ? undefined : teamQueue;
    const said = team?.finished === true ? undefined : notice;
    if (team !== undefined) {
      endTeamQueue();
      // Its host may have left the match first and queued the party
      // again (#1997), a change this tab saw while parked and let pass.
      if (lobby === team.party && requeuedSince(team.party.getSnapshot(), team.nonce)) {
        syncTeamQueue(team.party);
      }
    }
    if (queue !== undefined) {
      // Before the end, the player's own leave forfeits; a host or a
      // connection lost counts for nothing. Either way, the menu.
      queueStreak = nextStreak(queueStreak, notice === undefined ? "forfeit" : "host-left");
      await leaveLobby(notice);
      return;
    }
    // The lobby goes back to waiting by itself once the match is over
    // (#44), so another can start straight away (brief §46): the party,
    // on its host's mode (#1526).
    if (lobby !== undefined) {
      lobbyNotice = said ?? lobbyNotice;
    } else {
      menuNotice = said ?? menuNotice;
    }
    showMenu();
  };

  /**
   * A finished team match counts down to `action` (#1997) over its
   * result: its winners' party queues again, its losers go back to the
   * menu, a coded lobby's players back to it. Its button goes now; a
   * winner's, without queueing.
   */
  const startTeamEnd = (action: TeamEndAction, party: LobbyConnection | undefined): void => {
    clearTeamEnd();
    teamEnd = {
      action,
      endsAt: Date.now() + TEAM_RESULT_SECONDS * 1000,
      party,
      timer: window.setInterval(tickTeamEnd, 250),
    };
    tickTeamEnd();
  };

  const tickTeamEnd = (): void => {
    const current = teamEnd;
    if (current === undefined) {
      return;
    }
    // The winning party's host left it: nothing to queue with, so the menu.
    if (current.action === "requeue" && teamQueue?.partyClosed !== undefined) {
      current.action = "menu";
    }
    const seconds = Math.ceil((current.endsAt - Date.now()) / 1000);
    if (seconds <= 0) {
      void endTeamMatch(current);
      return;
    }
    match?.setEndLine({
      ...teamEndLine(current.action, seconds),
      onPress: () => {
        void exitMatch();
      },
    });
  };

  /** `ending`'s countdown is over (#1997): out of the match, and a winning host queues again. */
  const endTeamMatch = async (ending: NonNullable<typeof teamEnd>): Promise<void> => {
    await exitMatch();
    // As its host pressing Find a match: its members follow the lobby.
    const { party } = ending;
    if (
      ending.action === "requeue" &&
      party !== undefined &&
      lobby === party &&
      party.getSnapshot().isHost
    ) {
      party.findMatch();
    }
  };

  /**
   * Watch the lobby's match from no team (#480), 10 s late, with nothing
   * to act with. Leaving, or its end, is back to the lobby; the match
   * goes on without the watcher either way.
   */
  const watchMatch = async (): Promise<void> => {
    const from = lobby;
    const watch = from?.watchMatch();
    if (from === undefined || watch === undefined || match !== undefined || enteringMatch) {
      return;
    }
    enteringMatch = true;
    lobbyNotice = undefined;
    showViewport(true);
    setStatus("watching…", "offline");
    try {
      match = await startMatchView(
        viewport,
        {
          onConnectionChange: (state) => {
            if (state === "lost") {
              void exitMatch(LOST_MATCH_NOTICE);
            }
          },
          onLeave: () => {
            void exitMatch();
          },
        },
        {
          kind: "observe",
          selfSessionId: from.selfSessionId,
          connect: () => observeMatchFor(from, watch),
        },
      );
      setStatus("", "online");
    } catch (error) {
      console.error("[web] could not watch the match", error);
      enteringMatch = false;
      if (lobby !== undefined) {
        lobbyNotice = matchFailureNotice(error) ?? LOST_MATCH_NOTICE;
      }
      showMenu();
    }
  };

  const enterMatch = async (
    name: string,
    start: MatchStarting,
    entrant: Entrant,
  ): Promise<void> => {
    const from = lobby;
    if (from === undefined) {
      return;
    }
    enteringMatch = true;
    menuNotice = undefined;
    lobbyNotice = undefined;
    clearQueuedEnd();
    showViewport(true);
    setStatus("entering match…", "offline");
    try {
      match = await startMatchView(
        viewport,
        {
          // Reconnecting is the HUD's to say (#181); the top bar is hidden
          // in a match (#454).
          onConnectionChange: (state) => {
            if (state === "lost") {
              // The host is gone: the arena is frozen for good, so there
              // is nothing to stay for.
              setStatus("disconnected", "error");
              void exitMatch(LOST_MATCH_NOTICE);
            }
          },
          onLeave: () => {
            void exitMatch();
          },
          onFinished: (finished) => {
            const team = teamQueue?.parked === undefined ? undefined : teamQueue;
            if (team !== undefined) {
              team.finished = true;
            }
            const { winningTeam, endReason, selfTeam, aggression } = finished;
            // A draw is no win.
            const won = selfTeam !== undefined && winningTeam === selfTeam;
            if (queue === undefined) {
              // A team match, queued by its party or in a coded lobby (#1997).
              if (team !== undefined) {
                queueStreak = nextStreak(queueStreak, won ? "win" : "loss");
              }
              startTeamEnd(teamEndAction(won, team !== undefined), team?.party);
              return;
            }
            queueStreak = nextStreak(queueStreak, won ? "win" : "loss");
            const outcome = describeOutcome(winningTeam, endReason, selfTeam, aggression);
            queuedEnd = {
              outcome,
              won,
              timer: window.setTimeout(() => {
                void endQueuedMatch(outcome, won);
              }, QUEUED_RESULT_SECONDS * 1000),
            };
          },
        },
        {
          kind: "play",
          connect: () => connectMatchFor(from, start, name, entrant.guild, entrant.build),
        },
      );
      // In the match, the status has nothing to say until it is lost.
      setStatus("", "online");
      // Said once, on the match screen: the lobby's went with it.
      if (start.teamPlanRejected) {
        toast(TEAM_PLAN_REJECTED_NOTICE);
      }
    } catch (error) {
      console.error("[web] could not enter match", error);
      enteringMatch = false;
      if (isStaleChunkError(error)) {
        void buildWatch?.chunkFailed();
      }
      const notice = matchFailureNotice(error) ?? LOST_MATCH_NOTICE;
      // Back to the lobby. If it closed while this was joining, closing it
      // already took the player to the menu, and said why. A queued
      // lobby has no screen of its own to go back to.
      if (teamQueue?.parked !== undefined) {
        endTeamQueue();
      }
      if (queue !== undefined) {
        await leaveLobby(notice);
      } else if (lobby !== undefined) {
        lobbyNotice = notice;
        showMenu();
      }
    }
  };

  /**
   * A newer deployed build (#1268): the banner, and the reload once the
   * player is idle. Never for a build without an id.
   */
  const watchServedBuild = (): BuildWatch | undefined => {
    if (__VIBEWARS_BUILD__ === DEV_BUILD) {
      return undefined;
    }
    const reload = (): void => {
      watch.reloadNow();
    };
    const show = mountBuildBanner(document.body, {
      // Unsaved edits ask first, as their Close does.
      onReloadNow: () => {
        if (editor !== undefined) {
          editor.leave(reload);
        } else if (teamEditor !== undefined) {
          teamEditor.leave(reload);
        } else {
          reload();
        }
      },
      onNotNow: () => {
        watch.dismiss();
      },
    });
    const watch = createBuildWatch({
      current: __VIBEWARS_BUILD__,
      fetchLatest: () => fetchServedBuild(import.meta.env.BASE_URL),
      // Its own lobby, alone, is nobody's loss (#1526): a reload opens another.
      idle: () =>
        idleScreen &&
        (lobby === undefined || (hosted !== undefined && isAlone(railParty()))) &&
        match === undefined &&
        !enteringMatch &&
        stay === undefined &&
        document.querySelector('[aria-modal="true"]') === null,
      reloadedFor: {
        load: () => sessionStorage.getItem(RELOADED_FOR_KEY) ?? undefined,
        save: (id) => {
          sessionStorage.setItem(RELOADED_FOR_KEY, id);
        },
      },
      reload: () => {
        location.reload();
      },
      show,
    });
    const checkIfVisible = (): void => {
      if (document.visibilityState === "visible") {
        void watch.check();
      }
    };
    window.setInterval(checkIfVisible, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", checkIfVisible);
    // A chunk the page itself preloads, before the import that needs it.
    window.addEventListener("vite:preloadError", () => {
      void watch.chunkFailed();
    });
    checkIfVisible();
    return watch;
  };
  const buildWatch = watchServedBuild();

  showMenu();
  if (relayLink.kind === "config" && !framed) {
    openRelayPrompt(app, relayLink.config, savedRelay);
  }
  // An invite link pasted into this open tab only changes the fragment:
  // nothing reloads, so it is taken out and asked about here.
  window.addEventListener("hashchange", () => {
    const pasted = takeRelayLink();
    if (pasted.kind === "malformed") {
      toast(MALFORMED_RELAY_LINK_NOTICE);
    } else if (pasted.kind === "config" && framed) {
      toast(FRAMED_RELAY_LINK_NOTICE);
    } else if (pasted.kind === "config") {
      openRelayPrompt(app, pasted.config, loadTurnConfig());
    }
  });
}

main().catch((error: unknown) => {
  setStatus("failed to start", "error");
  console.error("[web] boot failed", error);
});
