import { PROTOCOL_MISMATCH_MESSAGE } from "@vibewars/game-protocol";

import { httpOriginFrom, resolveEndpoint, type MatchTarget } from "./net/match-client.js";
import { ONLINE_PLAY } from "./net/online.js";
import {
  LobbyNotFoundError,
  createLobby,
  isProtocolMismatch,
  joinLobbyByCode,
  type LobbyConnection,
} from "./net/lobby-client.js";
import { startMatchView, type MatchView } from "./match-view.js";
import {
  CharacterRepository,
  TeamRepository,
  createMemoryStore,
  openIndexedDbStore,
  type KeyValueStore,
} from "./storage/repository.js";
import type { StoredCharacter, StoredTeam } from "./storage/schema.js";
import { disposeBuildEditor, newCharacter, renderBuildEditor } from "./ui/build-editor.js";
import { renderLobbyScreen } from "./ui/lobby-screen.js";
import { loadActiveCharacterId, renderMenu, renderTeamList } from "./ui/menu.js";
import { addMember, duplicateTeam, moveMember, newTeam, removeMember } from "./ui/team-builder.js";
import { toPlayerBuild } from "./storage/build-validation.js";
import type { PlayerBuild } from "@vibewars/game-core";

/**
 * Application shell: owns which screen is showing and the connections
 * behind it.
 *
 * Deliberately a small state machine rather than a framework — there are
 * five screens and one connection at a time, and a router would be more
 * machinery than the problem has (brief §30).
 */

function requireElement(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Expected element ${selector} to exist in index.html`);
  }
  return element;
}

function setStatus(text: string, state: "offline" | "online" | "error"): void {
  const status = requireElement("#status");
  status.textContent = text;
  status.dataset.state = state;
}

async function openStore(): Promise<KeyValueStore> {
  try {
    return await openIndexedDbStore();
  } catch (error) {
    // Private browsing and some locked-down configurations deny
    // IndexedDB. Falling back to memory keeps the game playable for this
    // session rather than failing at the menu; the player just will not
    // keep their builds.
    console.warn("[web] IndexedDB unavailable; builds will not persist this session", error);
    return createMemoryStore();
  }
}

async function main(): Promise<void> {
  const screenRoot = requireElement("#screens");
  const viewport = requireElement("#viewport");

  const store = await openStore();
  const characters = new CharacterRepository(store);
  const teams = new TeamRepository(store);

  const endpoint = resolveEndpoint(window.location);

  // Fetched once: the server is the authority on which arenas exist. A
  // build without online play has no server to ask, and no lobby to host.
  let availableMaps: { id: string; name: string }[] = [];
  if (ONLINE_PLAY) {
    try {
      const response = await fetch(`${httpOriginFrom(endpoint)}/api/maps`);
      if (response.ok) {
        const body = (await response.json()) as { maps: { id: string; name: string }[] };
        availableMaps = body.maps;
      }
    } catch (error) {
      // A missing map list only costs the host their picker; the match
      // still runs on the server's default arena.
      console.warn("[web] could not load the map list", error);
    }
  }

  let lobby: LobbyConnection | undefined;
  let match: MatchView | undefined;
  /**
   * Set synchronously the moment a match is requested.
   *
   * `match` itself is only assigned after `startMatchView` resolves, and
   * a lobby state change arriving during that await would otherwise find
   * `match === undefined` and pull the player back to the lobby screen.
   */
  let enteringMatch = false;
  let lobbyNotice: string | undefined;
  /**
   * Why the last attempt to reach the server failed, shown on the menu
   * the player lands back on. Cleared when they try again.
   */
  let menuNotice: string | undefined;

  const showViewport = (visible: boolean): void => {
    viewport.style.display = visible ? "block" : "none";
    screenRoot.style.display = visible ? "none" : "flex";
  };

  /**
   * The build to take into the next match, read fresh from storage.
   *
   * Read at join time rather than cached when the player picked it, so
   * editing a character takes effect on the next match instead of the
   * next time they happen to re-select it. An id pointing at a character
   * that no longer exists, or one that no longer validates, resolves to
   * `undefined` and the server's house loadout.
   */
  const activeBuild = async (): Promise<PlayerBuild | undefined> => {
    const id = loadActiveCharacterId();
    if (id === undefined) {
      return undefined;
    }
    try {
      const character = await characters.load(id);
      return character === undefined ? undefined : toPlayerBuild(character);
    } catch (error) {
      // A build that cannot be read is not worth failing the match over;
      // the server would refuse an invalid one anyway.
      console.warn("[web] could not load the selected character", error);
      return undefined;
    }
  };

  const showMenu = (): void => {
    disposeBuildEditor();
    showViewport(false);
    void (async () => {
      const { characters: list, problems } = await characters.list();
      renderMenuWith(list, problems);
    })();
  };

  const renderMenuWith = (
    list: readonly StoredCharacter[],
    problems: readonly string[] = [],
  ): void => {
    renderMenu(
      screenRoot,
      {
        onCreateLobby: (name) => {
          void enterLobby(async () => createLobby(endpoint, name, await activeBuild()));
        },
        onJoinLobby: (code, name) => {
          void enterLobby(async () => joinLobbyByCode(endpoint, code, name, await activeBuild()));
        },
        onManageTeams: () => {
          void showTeams();
        },
        // Straight into a match with no lobby — how the game worked before
        // Sprint 19, kept because it is the fastest way to try the game.
        onQuickMatch: (name) => {
          void enterMatch({ kind: "quick", name });
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
        // The menu persists the choice itself; re-render so the
        // highlighted row matches what was just picked, without a round
        // trip to storage for a list we already hold.
        onSelectCharacter: () => {
          renderMenuWith(list, problems);
        },
      },
      ONLINE_PLAY,
      list,
      problems,
      menuNotice,
    );
  };

  const showCharacterEditor = (character: StoredCharacter): void => {
    const rerender = (next: StoredCharacter): void => {
      renderBuildEditor(screenRoot, next, editorCallbacks, rerender);
    };
    const editorCallbacks = {
      onSave: (saved: StoredCharacter) => {
        void (async () => {
          await characters.save(saved);
          showMenu();
        })();
      },
      onDelete: (id: string) => {
        void (async () => {
          await characters.delete(id);
          showMenu();
        })();
      },
      onDuplicate: (source: StoredCharacter) => {
        const copy: StoredCharacter = {
          ...source,
          id: crypto.randomUUID(),
          name: `${source.name} (copy)`,
          updatedAt: Date.now(),
        };
        void (async () => {
          await characters.save(copy);
          showMenu();
        })();
      },
      onClose: () => {
        showMenu();
      },
    };
    rerender(character);
  };

  const showTeams = async (): Promise<void> => {
    const [teamList, characterList] = await Promise.all([teams.list(), characters.list()]);
    renderTeamList(screenRoot, teamList.teams, teamList.problems, {
      onNew: () => {
        void (async () => {
          await teams.save(newTeam(crypto.randomUUID()));
          await showTeams();
        })();
      },
      onEdit: (id) => {
        // The team editor UI is the same list screen for now; editing a
        // team means adding/removing members, which needs characters to
        // exist first.
        void (async () => {
          const team = await teams.load(id);
          if (team !== undefined) {
            showTeamEditor(team, characterList.characters);
          }
        })();
      },
      onBack: showMenu,
    });
  };

  const showTeamEditor = (team: StoredTeam, available: readonly StoredCharacter[]): void => {
    // Rendered inline rather than in its own module: the team editor is
    // a list with add/remove buttons, and splitting it out would be more
    // indirection than content.
    const saveTeam = async (next: StoredTeam): Promise<void> => {
      await teams.save({ ...next, updatedAt: Date.now() });
      await showTeams();
    };

    screenRoot.replaceChildren();
    const panel = document.createElement("div");
    panel.className = "screen";

    const title = document.createElement("h2");
    title.className = "screen-title";
    title.textContent = "edit team";
    panel.appendChild(title);

    const nameInput = document.createElement("input");
    nameInput.className = "field-input";
    nameInput.value = team.name;
    panel.appendChild(nameInput);

    const list = document.createElement("div");
    list.className = "entity-list";
    team.members.forEach((member, index) => {
      const row = document.createElement("div");
      row.className = "entity-row";
      const named = available.find((c) => c.id === member.characterId);
      const label = document.createElement("span");
      label.className = "entity-name";
      label.textContent = `${String(index + 1)}. ${named?.name ?? "(missing character)"}`;
      row.appendChild(label);

      // Reordering matters: a team's order is its slot assignment, and
      // `moveMember` already clamps at the ends.
      const up = document.createElement("button");
      up.type = "button";
      up.textContent = "↑";
      up.disabled = index === 0;
      up.addEventListener("click", () => {
        void saveTeam(moveMember({ ...team, name: nameInput.value }, index, -1));
      });
      row.appendChild(up);

      const down = document.createElement("button");
      down.type = "button";
      down.textContent = "↓";
      down.disabled = index === team.members.length - 1;
      down.addEventListener("click", () => {
        void saveTeam(moveMember({ ...team, name: nameInput.value }, index, 1));
      });
      row.appendChild(down);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "remove";
      remove.addEventListener("click", () => {
        void saveTeam(removeMember({ ...team, name: nameInput.value }, index));
      });
      row.appendChild(remove);
      list.appendChild(row);
    });
    panel.appendChild(list);

    const addRow = document.createElement("div");
    addRow.className = "menu-row";
    const select = document.createElement("select");
    for (const character of available) {
      const option = document.createElement("option");
      option.value = character.id;
      option.textContent = character.name;
      select.appendChild(option);
    }
    addRow.appendChild(select);

    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "add member";
    add.disabled = available.length === 0;
    add.addEventListener("click", () => {
      void saveTeam(addMember({ ...team, name: nameInput.value }, select.value));
    });
    addRow.appendChild(add);
    panel.appendChild(addRow);

    const actions = document.createElement("div");
    actions.className = "menu-row";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary";
    save.textContent = "save";
    save.addEventListener("click", () => {
      void saveTeam({ ...team, name: nameInput.value });
    });

    const duplicate = document.createElement("button");
    duplicate.type = "button";
    duplicate.textContent = "duplicate";
    duplicate.addEventListener("click", () => {
      void saveTeam(duplicateTeam({ ...team, name: nameInput.value }, crypto.randomUUID()));
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "delete";
    remove.addEventListener("click", () => {
      void (async () => {
        await teams.delete(team.id);
        await showTeams();
      })();
    });
    const back = document.createElement("button");
    back.type = "button";
    back.textContent = "back";
    back.addEventListener("click", () => {
      void showTeams();
    });
    actions.append(save, duplicate, remove, back);
    panel.appendChild(actions);

    screenRoot.appendChild(panel);
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
    showViewport(false);
    renderLobbyScreen(
      screenRoot,
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
        onLeave: () => {
          void (async () => {
            await lobby?.disconnect();
            lobby = undefined;
            showMenu();
          })();
        },
      },
      lobbyNotice,
      availableMaps,
    );
  };

  const enterLobby = async (connect: () => Promise<LobbyConnection>): Promise<void> => {
    setStatus("connecting…", "offline");
    menuNotice = undefined;
    try {
      lobby = await connect();
    } catch (error) {
      setStatus("could not join", "error");
      menuNotice = isProtocolMismatch(error)
        ? PROTOCOL_MISMATCH_MESSAGE
        : error instanceof LobbyNotFoundError
          ? "No lobby with that code. Check the code and try again."
          : "Could not connect to the server.";
      showMenu();
      return;
    }

    lobbyNotice = undefined;
    setStatus(`lobby ${lobby.getSnapshot().code}`, "online");
    lobby.onChange(renderLobby);
    lobby.onStartRejected((message) => {
      lobbyNotice = message.reason;
      renderLobby();
    });
    lobby.onMatchStarting((message) => {
      // Only players on a team are sent this; a spectator stays here.
      void enterMatch({ kind: "lobby", reservation: message.reservation });
    });
    renderLobby();
  };

  const enterMatch = async (target: MatchTarget): Promise<void> => {
    enteringMatch = true;
    menuNotice = undefined;
    showViewport(true);
    setStatus("entering match…", "offline");
    try {
      const build = await activeBuild();
      match = await startMatchView(
        viewport,
        endpoint,
        {
          onConnectionChange: (state) => {
            // The server holds a dropped player's slot, so "reconnecting"
            // is a recoverable state worth showing rather than an error.
            if (state === "reconnecting") {
              setStatus("connection lost — reconnecting…", "error");
            } else if (state === "online") {
              setStatus("in match", "online");
            } else {
              setStatus("disconnected", "error");
            }
          },
          onLeave: () => {
            void (async () => {
              await match?.dispose();
              match = undefined;
              enteringMatch = false;
              // The lobby goes back to waiting by itself once the match
              // is over (#44), so another can start straight away
              // (brief §46).
              if (lobby !== undefined) {
                renderLobby();
              } else {
                showMenu();
              }
            })();
          },
        },
        { target, build },
      );
      setStatus("in match", "online");
    } catch (error) {
      console.error("[web] could not enter match", error);
      setStatus("match failed", "error");
      if (isProtocolMismatch(error)) {
        menuNotice = PROTOCOL_MISMATCH_MESSAGE;
      }
      enteringMatch = false;
      showMenu();
    }
  };

  showMenu();
  setStatus("ready", "offline");
}

main().catch((error: unknown) => {
  setStatus("failed to start", "error");
  console.error("[web] boot failed", error);
});
