import { sizeClass } from "@vibewars/game-maps/size-class";
import type {
  Guild,
  LobbyCharacter,
  LobbyConnection,
  LobbySnapshot,
  MatchStarting,
} from "@vibewars/game-session";

import type { NostrQueue } from "./net/transport/nostr-queue.js";

import { ARENA_MAPS, mapMode } from "./net/maps.js";
import {
  connectMatchFor,
  observeMatchFor,
  enterQueue,
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
  TEAM_SPLIT_MESSAGE,
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
import { startMatchView, type MatchOutcome, type MatchView } from "./match-view.js";
import { beatEdits } from "./music/beat-edits.js";
import { musicPlayer } from "./music/music-player.js";
import { music } from "./music/play-music.js";
import { TRACKS } from "./music/tracks/index.js";
import { STRESS_BUILD, startStress, stressMs } from "./music/stress.js";
import {
  BLOCKED_NOTICE,
  CharacterRepository,
  MatchRecordRepository,
  TeamRepository,
  createMemoryStore,
  openIndexedDbStore,
  type KeyValueStore,
} from "./storage/repository.js";
import { cloneCharacter } from "./storage/clone-character.js";
import { matchRecordFrom, tally, type Tally } from "./storage/match-record.js";
import {
  CHARACTER_SCHEMA_VERSION,
  type StoredCharacter,
  type StoredTeam,
  type TeamCharacter,
} from "./storage/schema.js";
import {
  rerollStarterCharacter,
  rollClone,
  rollStarterCharacter,
} from "./storage/starter-character.js";
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
  type QueueScreen,
  type StayOffer,
} from "./ui/queue-screen.js";
import { hostMaps, renderLobbyScreen } from "./ui/lobby-screen.js";
import { entryProposal, renderTeamLobbyScreen } from "./ui/team-lobby-screen.js";
import { renderRecordScreen } from "./ui/record-screen.js";
import { createNowPlayingToast, nowPlayingText } from "./ui/now-playing.js";
import {
  loadActiveCharacterId,
  loadPlayTab,
  loadStarterCharacterId,
  playerGuild,
  renderMenu,
  saveActiveCharacterId,
  saveStarterCharacterId,
} from "./ui/menu.js";
import { dismissToast, toast } from "./ui/kit.js";
import { loadActiveTeamBuildId, renderTeamPlay, type TeamPlayTile } from "./ui/team-play.js";
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
import { teamSizeOf, type QueueMode } from "@vibewars/game-protocol";
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
  /** Whose record its matches go on (#1404); `undefined` for a starter build. */
  readonly characterId: string | undefined;
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
  // Its notice goes on the first menu, once.
  let editNotices = await beatEdits.load(TRACKS);
  // An edit that stopped the music, on the next menu (#878).
  music().onNotice((notice) => {
    editNotices = [...editNotices, notice];
  });
  // A saved relay of the wrong shape goes now, and the first menu says so.
  const savedRelay = loadTurnConfig(() => {
    editNotices = [...editNotices, UNREADABLE_RELAY_NOTICE];
  });
  const framed = window.top !== window.self;
  if (relayLink.kind === "malformed") {
    editNotices = [...editNotices, MALFORMED_RELAY_LINK_NOTICE];
  } else if (relayLink.kind === "config" && framed) {
    editNotices = [...editNotices, FRAMED_RELAY_LINK_NOTICE];
  }
  const characters = new CharacterRepository(store);
  const teams = new TeamRepository(store);
  const records = new MatchRecordRepository(store);
  // The first start plays a rolled starter character (#853). Not into
  // memory: it would be gone next start, with the key saying it was rolled.
  if (persistent) {
    // Its name is none of the roster's (#1149). The list's notices go on
    // the first menu: the stale records they report are gone after this.
    const { characters: roster, problems } = await characters.list();
    editNotices = [...problems, ...editNotices];
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
  }

  // The arenas a host can pick, built into the client (#403).
  const availableMaps = ARENA_MAPS.map((map) => ({
    id: map.id,
    name: map.name,
    size: sizeClass(map),
    mode: map.mode,
  }));

  let lobby: LobbyConnection | undefined;
  /** The lobby this tab hosts, while it hosts one: leaving it ends it for everyone. */
  let hosted: HostedLobby | undefined;
  /** The modes the hosted lobby's maps play (#1453): a Team Play tile's; `undefined` for all. */
  let lobbyModes: TeamPlayTile["modes"];
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
  /** Set while *Random Arena* is reading the character, so a second press makes no second ticket. */
  let joiningQueue = false;
  /** Queued wins in a row this visit (#881): page memory only, never stored. */
  let queueStreak = 0;
  /** The queued match's result line once it finished, whether this side won, and the timer to its ended view. */
  let queuedEnd:
    { readonly outcome: string; readonly won: boolean; readonly timer: number } | undefined;
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

  /**
   * The first thing every screen change does (#710): a toast belongs to
   * the screen that raised it, so it goes when that screen does. One the
   * next screen raises while it mounts stays. A screen added later calls
   * this first too, before anything mounts.
   */
  const leaveScreen = (): void => {
    idleScreen = false;
    dismissToast();
    closeBeatEditor();
  };

  // The bar's [?] and ⚙ open Help and Options over the screen, which
  // stays as it was underneath: an editor keeps its edits, a lobby keeps
  // updating (#454, #1257).
  const topbarView = mountTopbar(topbar, {
    onHelp: () => {
      openHelpOverlay(app);
    },
    onOptions: () => {
      openOptionsOverlay(app);
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
      characterId: character === null ? undefined : id,
    };
  };

  /** The open build editor; every way out of it passes through `showMenu`. */
  let editor: BuildEditorView | undefined;

  const showMenu = (): void => {
    leaveScreen();
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
    music().screen("menu");
    idleScreen = true;
    if (loadPlayTab() === "team") {
      void showTeamPlay();
      return;
    }
    void (async () => {
      const [{ characters: list, problems }, played] = await Promise.all([
        characters.list(),
        records.list(),
      ]);
      renderMenuWith(
        list,
        [...problems, ...played.problems, ...editNotices],
        tally(played.records),
      );
      editNotices = [];
    })();
  };

  const showRecord = async (): Promise<void> => {
    leaveScreen();
    const { records: played, problems } = await records.list();
    renderRecordScreen(screenRoot, played, problems, { onBack: showMenu });
  };

  const renderMenuWith = (
    list: readonly StoredCharacter[],
    problems: readonly string[] = [],
    tallies: ReadonlyMap<string, Tally> = new Map(),
  ): void => {
    renderMenu(
      screenRoot,
      {
        onCreateLobby: (name) => {
          hostWith(name, undefined, false);
        },
        onJoinLobby: joinWith,
        onRandomArena: (mode, name) => {
          void enterRandomArena(mode, name);
        },
        onSwitchTab: showMenu,
        onShowRecord: () => {
          void showRecord();
        },
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
            // Only the random starter has Clone: a fresh roll, not a copy (#1457).
            const copy = rollClone(
              character,
              Math.random,
              crypto.randomUUID(),
              Date.now(),
              list.map((c) => c.name),
            );
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
          renderMenuWith(list, problems, tallies);
        },
      },
      list,
      problems,
      menuNotice,
      tallies,
    );
  };

  /** The build editor for `character`; every way out of it goes `back`. */
  const showCharacterEditor = (character: StoredCharacter, back: () => void = showMenu): void => {
    leaveScreen();
    const editorCallbacks = {
      onSave: (saved: StoredCharacter) => {
        void (async () => {
          await characters.save(saved);
          back();
        })();
      },
      onDelete: (id: string) => {
        void (async () => {
          await characters.delete(id);
          // Its record goes with it (#1404); a failure leaves orphans, which no roster tallies.
          await records.deleteFor(id).catch((error: unknown) => {
            console.warn("[web] could not delete the character's record", error);
          });
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
   * Host a lobby as `name`, with the active Solo character, on `modes`'
   * maps; a Team Play tile's (`teamLobby`) starts in the Team Lobby (#1460).
   */
  const hostWith = (name: string, modes: TeamPlayTile["modes"], teamLobby: boolean): void => {
    void (async () => {
      lobbyModes = modes;
      const entrant = await readEntrant();
      await enterLobby(name, entrant, async () => {
        hosted = await hostLobby(name, entrant.guild, entrant.character, teamLobby);
        return hosted.lobby;
      });
    })();
  };

  const joinWith = (code: string, name: string): void => {
    void (async () => {
      lobbyModes = undefined;
      const entrant = await readEntrant();
      await enterLobby(name, entrant, async () =>
        joinLobbyByCode(code, name, entrant.guild, entrant.character),
      );
    })();
  };

  /**
   * Team Play (#1453), as `showMenu` shows it on that tab. Its tiles host
   * Team Lobbies (#1460), where the picked Team Build is proposed.
   */
  const showTeamPlay = async (): Promise<void> => {
    const [teamList, characterList] = await Promise.all([teams.list(), characters.list()]);
    renderTeamPlay(screenRoot, teamList.teams, [...teamList.problems, ...editNotices], menuNotice, {
      onHostTile: (tile, name) => {
        hostWith(name, tile.modes, true);
      },
      onJoinLobby: joinWith,
      onSwitchTab: showMenu,
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
    });
    editNotices = [];
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
   * adds a copy, and Close comes back without either.
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
    leaveScreen();
    teamEditor?.dispose();
    teamEditor = undefined;
    editor?.dispose();
    editor = mountBuildEditor(
      screenRoot,
      { ...member, schemaVersion: CHARACTER_SCHEMA_VERSION, updatedAt: Date.now() },
      {
        onSave: (saved) => {
          const character = teamCharacter(saved, member.id);
          back(present ? replaceMember(left.team, character) : addMember(left.team, character));
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
          back(left.team);
        },
      },
    );
  };

  /** The open team editor; every way out of it passes through `showMenu`, to Team Play. */
  let teamEditor: TeamEditorView | undefined;

  const showTeamEditor = (state: TeamEditorState, available: readonly StoredCharacter[]): void => {
    leaveScreen();
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
   * active character, or while already queueing.
   */
  const enterRandomArena = async (
    mode: QueueMode,
    name: string,
    from: { readonly party?: PartyPlace; readonly note?: string } = {},
  ): Promise<boolean> => {
    if (queue !== undefined || joiningQueue) {
      from.party?.board.close();
      return false;
    }
    const id = loadActiveCharacterId();
    if (id === undefined) {
      return false;
    }
    joiningQueue = true;
    let stored: StoredCharacter | undefined;
    let entrant: Entrant;
    try {
      stored = await characters.load(id);
      entrant = await readEntrant();
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

  const renderLobby = (): void => {
    if (lobby === undefined) {
      return;
    }
    // The lobby connection stays open for the whole match, so every lobby
    // state change still fires this. Without this guard, the lobby's own
    // "phase -> in-match" broadcast lands just after `enterMatch` showed
    // the viewport and puts the player straight back on the lobby screen,
    // with the match running unseen underneath. Found by the browser
    // tests; nothing headless could have caught it, because the bug lives
    // entirely in how the two screens are sequenced.
    if (match !== undefined || enteringMatch) {
      return;
    }
    // Every way back here (leaving, a finished match, a lost connection)
    // passes through this, so the status bar stops saying "in match".
    const snapshot = lobby.getSnapshot();
    if (queue !== undefined) {
      // A queued lobby has nothing to choose: it is the versus splash.
      setStatus("match found", "online");
      queue.screen.show({ kind: "splash", snapshot });
      return;
    }
    // The lobby screen shows its code, so the status has nothing to add.
    setStatus("", "online");
    showViewport(false);
    music().screen("lobby");
    if (snapshot.phase === "team-lobby") {
      renderTeamLobby(lobby, snapshot);
      return;
    }
    teamPicks = undefined;
    // A Team Play tile's lobby (#1453) starts on the first of its maps.
    const maps = hostMaps(availableMaps, lobbyModes);
    const [firstMap] = maps;
    if (
      snapshot.isHost &&
      snapshot.phase === "waiting" &&
      firstMap !== undefined &&
      !maps.some((map) => map.id === snapshot.mapId)
    ) {
      lobby.selectMap(firstMap.id);
    }
    renderLobbyScreen(
      screenRoot,
      snapshot,
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
        onLeave: () => {
          void leaveLobby();
        },
      },
      lobbyNotice,
      maps,
    );
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
    renderLobby();
  };

  /**
   * The Team Lobby screen (#1460). As it begins, the saved Team Builds
   * are read once, and the one picked on Team Play is proposed if it is
   * the side's size.
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
        const now = joined.getSnapshot();
        const team = now.players.find((p) => p.sessionId === joined.selfSessionId)?.team ?? null;
        const side = team === null ? null : (now.teamLobby?.sides[team] ?? null);
        const entry =
          side === null || now.teamLobby?.stage !== "vote"
            ? undefined
            : entryProposal(saved, loadActiveTeamBuildId(saved), side.size);
        if (entry === undefined) {
          renderLobby();
        } else {
          proposeTeam(entry);
        }
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

  /** Leave the lobby; a host's leaving ends it for everyone. */
  const leaveLobby = async (notice?: string): Promise<void> => {
    const leaving = lobby;
    const ending = hosted;
    lobby = undefined;
    hosted = undefined;
    closeChat();
    await leaving?.disconnect();
    await ending?.close();
    menuNotice = notice;
    showMenu();
  };

  const enterLobby = async (
    name: string,
    entrant: Entrant,
    connect: () => Promise<LobbyConnection>,
  ): Promise<void> => {
    setStatus("connecting…", "offline");
    menuNotice = undefined;
    // Still the menu, but on its way into a lobby.
    idleScreen = false;
    try {
      lobby = await connect();
    } catch (error) {
      console.warn("[web] could not join the lobby", error);
      hosted = undefined;
      menuNotice = joinFailureNotice(error, location, loadTurnConfig() !== undefined);
      showMenu();
      // After showMenu, which would clear the status.
      setStatus("could not join", "error");
      return;
    }
    seatLobby(name, lobby, entrant);
  };

  /**
   * Show `joined`, coded or queued, and play its matches as `name` with
   * `entrant`'s build, every one of them (#1070).
   */
  const seatLobby = (name: string, joined: LobbyConnection, entrant: Entrant): void => {
    lobby = joined;
    lobbyNotice = undefined;
    // Here and not in renderLobby, which every lobby change repaints:
    // a "Copied" toast outlives a player joining. The queue screen raises none.
    if (queue === undefined) {
      leaveScreen();
    }
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
    joined.onChat((line) => {
      chat?.add(line);
    });
    joined.onChatThrottled(() => {
      chat?.notice("Slow down: your last lines were not sent.");
    });
    joined.onChange(renderLobby);
    joined.onStartRejected((reason) => {
      lobbyNotice = reason;
      renderLobby();
    });
    joined.onRefused((reason) => {
      lobbyNotice = lobbyRefusalNotice(reason);
      renderLobby();
    });
    joined.onMatchStarting((start) => {
      // Only players on a team are sent this; a spectator stays here.
      void enterMatch(name, start, entrant);
    });
    joined.onClosed((reason) => {
      // From the lobby or from its match: either way, it is over.
      lobby = undefined;
      hosted = undefined;
      closeChat();
      if (queue !== undefined && match === undefined && !enteringMatch) {
        // Before its match, a queued lobby closing puts the player back
        // in the queue, which says so on its screen.
        return;
      }
      const notice = lobbyClosedNotice(reason);
      if (match !== undefined) {
        void exitMatch(notice);
      } else {
        enteringMatch = false;
        menuNotice = notice;
        showMenu();
      }
    });
    renderLobby();
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
    music().screen("menu");
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
    if (queue !== undefined) {
      // Before the end, the player's own leave forfeits; a host or a
      // connection lost counts for nothing. Either way, the menu.
      queueStreak = nextStreak(queueStreak, notice === undefined ? "forfeit" : "host-left");
      await leaveLobby(notice);
      return;
    }
    // The lobby goes back to waiting by itself once the match is over
    // (#44), so another can start straight away (brief §46).
    if (lobby !== undefined) {
      lobbyNotice = notice ?? lobbyNotice;
      renderLobby();
    } else {
      menuNotice = notice ?? menuNotice;
      showMenu();
    }
  };

  /**
   * Keeps a finished match on `entrant`'s character's record (#1404). A
   * starter build has none. Saving is a convenience: a failure is only logged.
   */
  const recordMatch = (outcome: MatchOutcome, mapId: string, entrant: Entrant): void => {
    if (entrant.characterId === undefined || entrant.character === null) {
      return;
    }
    const record = matchRecordFrom(outcome, {
      id: crypto.randomUUID(),
      characterId: entrant.characterId,
      characterName: entrant.character.name,
      mapId,
      mode: mapMode(mapId),
      finishedAt: Date.now(),
    });
    if (record !== undefined) {
      records.save(record).catch((error: unknown) => {
        console.warn("[web] could not record the match", error);
      });
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
        renderLobby();
      }
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
          // Every lobby match, coded or queued, goes on the record (#1404).
          onFinished: (finished) => {
            recordMatch(finished, start.mapId, entrant);
            if (queue === undefined) {
              return;
            }
            const { winningTeam, endReason, selfTeam, aggression } = finished;
            const won = selfTeam !== undefined && winningTeam === selfTeam;
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
      if (queue !== undefined) {
        await leaveLobby(notice);
      } else if (lobby !== undefined) {
        lobbyNotice = notice;
        renderLobby();
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
      idle: () =>
        idleScreen &&
        lobby === undefined &&
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
