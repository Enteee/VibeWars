import type { FlagField, RelicField } from "@vibewars/game-core";
import { allWallSegments } from "@vibewars/game-maps/geometry";
import type { MapDescriptor, WallDescriptor } from "@vibewars/game-protocol";
import type {
  CombatMessage,
  MatchConnection,
  MatchSnapshot,
  ObserverConnection,
} from "@vibewars/game-session";

import { attachMatchSounds } from "./audio/match-sounds.js";
import { onGlobalMute, setGlobalMute } from "./audio/global-mute.js";
import { soundPlayer } from "./audio/sound-player.js";
import { attackKeyIntents, escapeIntent } from "./input/attack-key.js";
import { createDoubleClick } from "./input/double-click.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { loadLayoutLabeller } from "./input/key-labels.js";
import { WEAPON_SET_ACTIONS, actionForCode, isShortcut } from "./input/keymap.js";
import { loadKeymap } from "./input/keymap-preference.js";
import {
  calledTargetIntent,
  callTargetCall,
  middleClickAction,
  pingCall,
  secondaryClickIntents,
} from "./input/mouse-intents.js";
import { attachNameReveal } from "./input/name-reveal.js";
import {
  closestTarget,
  firstFollowed,
  nextFollowed,
  nextTabTarget,
  selfTargetIntent,
} from "./input/tab-target.js";
import { skillSlotForKeyDown } from "./input/skill-keys.js";
import { weaponSetIntent } from "./input/weapon-set-keys.js";
import { attachMatchMusic } from "./music/match-music.js";
import { music } from "./music/play-music.js";
import { TRACKS } from "./music/tracks/index.js";
import {
  ACTOR_RADIUS,
  withCalls,
  withNames,
  teamColour,
  toRenderableGroundEffect,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-snapshot.js";
import { attackCastOf } from "./render/attack-clock.js";
import { CREATURE_ARMS } from "./render/creature-arms.js";
import { CREATURE_DRAWN_RADIUS } from "./render/creature-shape.js";
import { conditionCues } from "./render/body-conditions.js";
import { bodyFlags } from "./render/body-rings.js";
import { capeLook } from "./render/cape-shape.js";
import { castBadgeType } from "./render/cast-badge.js";
import { NoWebGlError, createArenaViewport, type ArenaViewport } from "./render/arena-viewport.js";
import { attachFollowCamera } from "./render/follow-camera.js";
import { showCombatFeedback } from "./render/combat-feedback.js";
import { projectileSprite } from "./render/projectiles.js";
import {
  createHud,
  describeRefusal,
  flashMessage,
  flashTargetCast,
  renderLeave,
  renderKeyLabels,
  renderMute,
  refreshSkillBar,
  objectiveScoreToast,
  ghostLeaderToast,
  ghostNameplate,
  renderSkillBar,
  standBoostToast,
  updateFollowed,
  updateHud,
  updateRecharges,
} from "./ui/hud.js";
import { labelWeaponSets, renderWeaponSets, weaponSetSlots } from "./ui/weapon-set-slots.js";
import { mapFlagField, mapMode, mapRelicField, mapShrines, type MapShrine } from "./net/maps.js";
import {
  renderableCapturePoints,
  renderableFlags,
  renderableRelics,
  renderableStand,
} from "./render/flag-objects.js";
import { compassReach, createCompass } from "./ui/compass.js";
import { noWebGlNotice, watchingNotice } from "./ui/arena-notice.js";
import { attachFullscreenButton, fullscreenTarget } from "./ui/fullscreen.js";
import { closeHelpOverlay, isHelpOverlayOpen, openHelpOverlay } from "./ui/help-screen.js";
import { attachJukeboxPopover } from "./ui/jukebox.js";
import {
  closeOptionsOverlay,
  isOptionsOverlayOpen,
  openOptionsOverlay,
} from "./ui/options-screen.js";
import { createPartyWindow } from "./ui/party-window.js";
import { attachReconnectCountdown, mountReconnectOverlay } from "./ui/reconnect-overlay.js";
import { renderSummary, summaryTables, type SummaryTable } from "./ui/match-summary.js";
import { flashSlot, slotFlashes } from "./ui/skill-slot-state.js";
import { button, setToastHost, toast } from "./ui/kit.js";

/**
 * The in-match view: a Phaser viewport for the arena plus the DOM HUD,
 * wired to a live match connection.
 *
 * Owns its own teardown so the app shell can leave a match and come back
 * without leaking a Phaser game, a socket, or a keyboard listener.
 */

export interface MatchViewCallbacks {
  readonly onLeave: () => void;
  /** Surfaces connection trouble so the shell can tell the player. */
  readonly onConnectionChange?: (state: "online" | "reconnecting" | "lost") => void;
  /** Once, on the first snapshot of the match finished (#881): how it ended for this player. */
  readonly onFinished?: (outcome: MatchOutcome) => void;
}

/** How a match ended, as `describeOutcome` reads it; `selfTeam` is undefined for a spectator. */
export interface MatchOutcome {
  readonly winningTeam: number | undefined;
  readonly endReason: string | undefined;
  readonly selfTeam: number | undefined;
  /** Each team's, on a Guild Battle (#1226); `[]` on any other. */
  readonly aggression: readonly number[];
}

/**
 * Where the match comes from: a seat in a lobby's match over its
 * transport, or watching it from no team (#480), with no skill bar and
 * nothing to send. A watcher's `selfSessionId` is its own in the lobby,
 * which no body in the match has.
 */
export type MatchViewOptions =
  | { readonly kind: "play"; readonly connect: () => Promise<MatchConnection> }
  | {
      readonly kind: "observe";
      readonly selfSessionId: string;
      readonly connect: () => Promise<ObserverConnection>;
    };

/**
 * The match as the view draws it, played or watched (#480). `seat` is a
 * player's own connection, for everything a body of its own sends and
 * has; a watcher has none, and its match is `undefined` until the first
 * delayed snapshot comes.
 */
interface ViewedMatch {
  readonly map: MapDescriptor;
  readonly timeLimitSeconds: number | null;
  readonly selfSessionId: string;
  readonly seat: MatchConnection | undefined;
  /** How far behind the match this is, s: 0 for a seat. */
  readonly delaySeconds: number;
  getSnapshot(): MatchSnapshot | undefined;
  onCombat(handler: (message: CombatMessage) => void): void;
  /** A watcher is never reconnecting: its host gone, it is lost. */
  onConnectionChange(handler: (state: "online" | "reconnecting" | "lost") => void): void;
  disconnect(): Promise<void>;
}

async function viewedMatch(options: MatchViewOptions): Promise<ViewedMatch> {
  if (options.kind === "play") {
    const seat = await options.connect();
    return {
      map: seat.map,
      timeLimitSeconds: seat.timeLimitSeconds,
      selfSessionId: seat.selfSessionId,
      seat,
      delaySeconds: 0,
      getSnapshot: () => seat.getSnapshot(),
      onCombat: (handler) => {
        seat.onCombat(handler);
      },
      onConnectionChange: (handler) => {
        seat.onConnectionChange(handler);
      },
      disconnect: () => seat.disconnect(),
    };
  }
  const { selfSessionId } = options;
  const watched = await options.connect();
  return {
    map: watched.map,
    timeLimitSeconds: watched.timeLimitSeconds,
    selfSessionId,
    seat: undefined,
    delaySeconds: watched.delaySeconds,
    getSnapshot: () => {
      const snapshot = watched.getSnapshot();
      // Seen from no body: the spectator's view every part already has.
      // A watcher is sent no team's traps.
      return snapshot === undefined ? undefined : { ...snapshot, selfSessionId, traps: [] };
    },
    onCombat: (handler) => {
      watched.onCombat(handler);
    },
    onConnectionChange: (handler) => {
      watched.onLost(() => {
        handler("lost");
      });
    },
    disconnect: () => watched.disconnect(),
  };
}

/** The line over a finished team match's result (#1997): what comes next, when, and one button. */
export interface EndLine {
  readonly text: string;
  readonly button: string;
  readonly onPress: () => void;
}

export interface MatchView {
  /** The match summary's tables once the host has sent them (#1057), for the queue screen. */
  summary(): readonly SummaryTable[] | undefined;
  /** Shows `line` over the result, or none. */
  setEndLine(line: EndLine | undefined): void;
  dispose(): Promise<void>;
}

export function toRenderableWall(wall: WallDescriptor): RenderableWall {
  return wall.kind === "rect"
    ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
    : { kind: "polygon", points: wall.points };
}

/** Every body's name by its id, for the names a Ghostly Hero's leader goes by (#1419). */
function playerNames(match: MatchSnapshot): ReadonlyMap<string, string> {
  return new Map(match.players.map((player) => [player.sessionId, player.name]));
}

/** Project the wire snapshot onto the renderer's own shape (ADR-0001). */
export function toArenaSnapshot(
  match: MatchSnapshot,
  walls: readonly RenderableWall[],
  shrines: readonly MapShrine[],
  flagField: FlagField | undefined,
  relicField: RelicField | undefined,
): ArenaSnapshot {
  const self = match.players.find((player) => player.sessionId === match.selfSessionId);
  const names = playerNames(match);
  // Drawn in the ally colour: your own side, or a watcher's team 1, as
  // the scoreboard reads it first (#1199, #480).
  const side = self?.team ?? 0;

  return {
    walls,
    flags: [
      ...renderableFlags(match.flags, flagField, match.players, self?.team),
      ...renderableRelics(match.relics, relicField, match.players, self?.team),
    ],
    stand: renderableStand(match.stand, flagField, self?.team),
    altar: match.altar,
    capturePoints: renderableCapturePoints(match.capturePoints, self?.team),
    shrines: shrines.map((shrine) => ({
      position: shrine.position,
      side: shrine.team === side ? "ally" : "enemy",
    })),
    clock: match.elapsedSeconds,
    projectiles: match.projectiles.map((shot) => {
      const shooter = match.players.find((player) => player.sessionId === shot.attackerId);
      return {
        id: shot.id,
        sprite: projectileSprite(shooter?.weaponId, shot.skillId),
        from: shot.from,
        to: shot.to,
        launchedAt: shot.launchedAt,
        flightSeconds: shot.flightSeconds,
        // Tinted by side; a shooter who has left counts as the other side.
        colour: teamColour(shooter?.team === side ? "ally" : "enemy"),
      };
    }),
    groundEffects: [
      ...match.groundEffects.map((effect) => toRenderableGroundEffect(effect, self?.team, "ward")),
      ...match.traps.map((effect) => toRenderableGroundEffect(effect, self?.team, "trap")),
    ],
    // Render the target the *server* confirmed, not whatever was last
    // clicked — a click is only a request (brief §32).
    targetId: self?.targetSessionId,
    // Whose names show is the caller's to say (`withNames`, #253).
    hoverId: undefined,
    showAllNames: false,
    // Your team's calls are the caller's (`withCalls`, #443).
    calledId: undefined,
    pings: [],
    actors: match.players.map((player) => {
      const statuses = player.statuses.map((status) => status.id);
      // Rings and condition cues for what the statuses already say (#1117,
      // #1138); a corpse wears none.
      const living = player.dead ? [] : statuses;
      const rings = bodyFlags(living);
      return {
        id: player.sessionId,
        name: ghostNameplate(player, self, names),
        guildTag: player.guildTag,
        cape: player.guildCape === undefined ? undefined : capeLook(player.guildCape),
        bot: player.bot,
        position: { x: player.x, y: player.y },
        facing: player.facing,
        // A creature carries what its look is armed with (#2047), or nothing.
        weaponId:
          player.creature === undefined
            ? player.weaponId
            : CREATURE_ARMS[player.creature.look]?.weapon,
        swingElapsed: player.swingElapsed,
        swingTotal: player.swingTotal,
        attackCast: attackCastOf(player.castingSkillId, player.castRemaining, player.castTotal),
        offhandId:
          player.creature === undefined
            ? player.offhandId
            : CREATURE_ARMS[player.creature.look]?.offHand,
        profession: player.primaryProfession,
        creatureLook: player.creature?.look,
        radius:
          player.creature === undefined
            ? ACTOR_RADIUS
            : CREATURE_DRAWN_RADIUS[player.creature.look],
        team:
          player.sessionId === match.selfSessionId
            ? ("self" as const)
            : player.team === side
              ? ("ally" as const)
              : ("enemy" as const),
        health: player.health,
        maxHealth: player.maxHealth,
        dead: player.dead,
        exploited: player.corpseExploited,
        // From the snapshot, not the event, so a dropped event or a late
        // joiner still draws it right, and it stands up the moment it is 0.
        knockedDown: player.knockdownRemaining > 0,
        castProgress:
          // The server's total, not the skill's activation time: dazed
          // doubles a cast, and the bar must fill over the real one.
          player.castingSkillId !== undefined && player.castTotal > 0
            ? Math.max(0, Math.min(1, 1 - player.castRemaining / player.castTotal))
            : undefined,
        castType: player.castTotal > 0 ? castBadgeType(player.castingSkillId) : undefined,
        statuses,
        enchanted: rings.enchanted,
        hexed: rings.hexed,
        invulnerable: !player.dead && player.invulnerableSeconds > 0,
        conditionCues: conditionCues(living),
      };
    }),
  };
}

/** Whether a key press is someone typing, which no match key may steal. */
function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable)
  );
}

/**
 * Calls `handler` once per animation frame with the seconds since the
 * last, for a match with no arena to drive the frames (#655). Returns the
 * stop.
 */
function animationFrames(handler: (deltaSeconds: number) => void): () => void {
  let last: number | undefined;
  let request = 0;
  const step = (now: number): void => {
    handler(last === undefined ? 0 : (now - last) / 1000);
    last = now;
    request = requestAnimationFrame(step);
  };
  request = requestAnimationFrame(step);
  return () => {
    cancelAnimationFrame(request);
  };
}

export async function startMatchView(
  parent: HTMLElement,
  callbacks: MatchViewCallbacks,
  options: MatchViewOptions,
): Promise<MatchView> {
  // With no WebGL there is no arena, said plainly where it would be
  // (#655). The match itself goes on: the HUD still shows it, and a host
  // keeps hosting for its peers.
  let viewport: ArenaViewport | undefined;
  let notice: HTMLElement | undefined;
  try {
    viewport = await createArenaViewport(parent);
  } catch (error) {
    if (!(error instanceof NoWebGlError)) {
      throw error;
    }
    console.warn("[web] no arena in this match", error);
    notice = noWebGlNotice();
    parent.appendChild(notice);
  }

  let viewed: ViewedMatch;
  try {
    viewed = await viewedMatch(options);
  } catch (error) {
    // Refused, or the host never answered: no arena to leave behind.
    viewport?.destroy();
    notice?.remove();
    throw error;
  }
  // A watcher has none (#480): nothing below sends an intent without it.
  const { seat } = viewed;
  const walls = viewed.map.walls.map(toRenderableWall);
  // Once per match, for the skill bar's line-of-sight hint (#485).
  const wallSegments = allWallSegments(viewed.map.walls);
  const mode = mapMode(viewed.map.id);
  const shrines = mapShrines(viewed.map.id);
  const flagField = mapFlagField(viewed.map.id);
  const relicField = mapRelicField(viewed.map.id);
  const camera =
    viewport === undefined
      ? undefined
      : attachFollowCamera(viewport, parent, viewed.map, () => viewport.size());

  const hud = createHud(
    parent,
    (targetId, status) => {
      seat?.sendIntent({ kind: "end-upkeep", targetId, status });
    },
    () => {
      seat?.sendIntent({ kind: "drop-bundle" });
    },
  );
  // A toast goes under the target frame (#1465): at the bottom centre it
  // would sit on the skill bar.
  setToastHost(hud.top);
  // Your team's health, right middle (#1055); a row's click targets its member.
  const partyWindow = createPartyWindow(
    parent,
    (targetSessionId) => {
      seat?.sendIntent({ kind: "target", targetSessionId });
    },
    // Your pet's Guard, Fight and Heel (#1110).
    (creatureId, mode) => {
      seat?.sendIntent({ kind: "command", creatureId, order: { kind: "mode", mode } });
    },
  );
  // The compass (#486), top right under the match controls.
  const compass = createCompass(parent, compassReach(viewed.map));
  // A watcher has none (#480), from the start, not only once it updates.
  compass.element.hidden = seat === undefined;
  // A watcher (#480) has no body: no bars, effects or skill bar of its
  // own, and says how late what it sees is, under the score.
  hud.root.hidden = seat === undefined;
  if (seat === undefined) {
    const watching = document.createElement("div");
    watching.className = "hud-watching";
    watching.textContent = `Watching · ${String(viewed.delaySeconds)} s delay`;
    hud.top.insertBefore(watching, hud.carriers);
  }
  /** Whom a watcher's camera and target frame follow (#480). */
  let followedId: string | undefined;
  // The arena's edge stops below the target frame and above the bars, not
  // under them (#440, #1042). From the bars, as the lines above them come
  // and go; to the frame's bottom, as its effects row grows.
  const measureCover = (): void => {
    // The chat panel (#479) sits just above the HUD, wherever its top is.
    parent.style.setProperty("--hud-height", `${String(hud.root.offsetHeight)}px`);
    // The compass and the party window, from the parent the canvas fills
    // (#1424). A hidden party window has no size and keeps nothing out; a
    // hidden compass keeps its box, so it keeps markers out either way and
    // nothing goes stale when it shows.
    const origin = parent.getBoundingClientRect();
    const keepOut = [compass.element, partyWindow.element]
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => ({
        left: rect.left - origin.left,
        top: rect.top - origin.top,
        right: rect.right - origin.left,
        bottom: rect.bottom - origin.top,
      }));
    camera?.setCover({
      top: hud.top.offsetTop + hud.top.offsetHeight,
      bottom: hud.root.offsetHeight - hud.bars.offsetTop,
      keepOut,
    });
  };
  const coverObserver = new ResizeObserver(measureCover);
  coverObserver.observe(hud.root);
  coverObserver.observe(hud.bars);
  coverObserver.observe(hud.top);
  // The parent is the viewport: a height-only resize re-centres the party
  // window without resizing it.
  coverObserver.observe(parent);
  // The party window grows with its members; the compass with the window.
  coverObserver.observe(compass.element);
  coverObserver.observe(partyWindow.element);
  const useSkill = (slot: number): void => {
    seat?.sendIntent({ kind: "use-skill", slot });
  };
  const weaponSets = weaponSetSlots((set) => {
    const action = WEAPON_SET_ACTIONS[set];
    const intent =
      action === undefined || seat === undefined
        ? undefined
        : weaponSetIntent(action, seat.weaponSets);
    if (intent !== undefined) {
      seat?.sendIntent(intent);
    }
  });
  // Read once per match: a keymap changed elsewhere applies from the next.
  const keymap = loadKeymap();
  let disposed = false;
  if (seat !== undefined) {
    renderSkillBar(hud, () => seat.skillBar, seat.ranks, useSkill);
    hud.skillRow.prepend(weaponSets);
    renderKeyLabels(hud, keymap);
    labelWeaponSets(weaponSets, keymap);
    void loadLayoutLabeller().then((label) => {
      if (label !== undefined && !disposed) {
        renderKeyLabels(hud, keymap, label);
        labelWeaponSets(weaponSets, keymap, label);
      }
    });
  }

  const sounds = soundPlayer();
  // A watcher has no cast to be refused.
  const matchSounds = attachMatchSounds(seat ?? viewed, sounds);
  const matchMusic = attachMatchMusic(viewed, {
    screen: "match",
    menuDepth: null,
    mode: () => music().mode(),
    tracks: TRACKS,
    onChange: (state) => {
      music().follow(state);
    },
  });
  const toggleMute = (): void => {
    setGlobalMute(!sounds.muted);
  };
  // Also when the jukebox popover's Sound controls mute all (#424).
  const offMute = onGlobalMute((muted) => {
    renderMute(hud, muted);
  });
  renderMute(hud, sounds.muted);
  hud.mute.addEventListener("click", toggleMute);
  const jukebox = attachJukeboxPopover(hud.music, parent);
  // Esc cancels an attack now, so leaving is a button that asks first (#160).
  const leave = renderLeave(hud, callbacks.onLeave);
  // Options over the match (#454): the match goes on underneath.
  const openOptions = (): void => {
    openOptionsOverlay(parent, () => {
      hud.options.setAttribute("aria-expanded", "false");
      hud.options.focus();
    });
    hud.options.setAttribute("aria-expanded", "true");
  };
  hud.options.setAttribute("aria-expanded", "false");
  hud.options.addEventListener("click", openOptions);
  // Help over the match too (#1257), the same way.
  const openHelp = (): void => {
    openHelpOverlay(parent, () => {
      hud.help.setAttribute("aria-expanded", "false");
      hud.help.focus();
    });
    hud.help.setAttribute("aria-expanded", "true");
  };
  hud.help.setAttribute("aria-expanded", "false");
  hud.help.addEventListener("click", openHelp);
  const detachFullscreen = attachFullscreenButton(hud.fullscreen, fullscreenTarget());

  const detachMovement =
    seat === undefined
      ? undefined
      : attachKeyboardMoveInput(window, keymap, (direction) => {
          if (direction.x === 0 && direction.y === 0) {
            seat.sendIntent({ kind: "stop" });
          } else {
            seat.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
          }
        });

  /**
   * A watcher's keys (#480): Tab and Shift+Tab follow the next living
   * player, Esc leaves, and the mute key mutes. Nothing else is theirs.
   */
  const handleWatcherKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (!event.repeat) {
        callbacks.onLeave();
      }
      return;
    }
    if (isTyping(event.target)) {
      return;
    }
    const action = actionForCode(keymap, event.code);
    if (action === undefined) {
      return;
    }
    if (action !== "show-names") {
      event.preventDefault();
    }
    if (event.repeat) {
      return;
    }
    if (action === "target-next") {
      const players = viewed.getSnapshot()?.players ?? [];
      followedId = nextFollowed(players, followedId, event.shiftKey ? -1 : 1) ?? followedId;
    } else if (action === "mute") {
      toggleMute();
    }
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    // Ctrl, Alt and Meta are the browser's: Ctrl+R, Ctrl+W and the rest
    // do what they always do, and no game key fires with them (#302).
    if (isShortcut(event)) {
      return;
    }
    // F10, GW1's menu key, asks to leave (#221): the way out without a mouse.
    if (event.key === "F10") {
      // Some browsers focus their menu bar on F10.
      event.preventDefault();
      event.stopPropagation();
      // Not under Options (#454) or Help (#1257): their keys are their
      // own, so no question opens beneath them.
      if (!event.repeat && !isOptionsOverlayOpen() && !isHelpOverlayOpen()) {
        if (leave.isOpen()) {
          leave.close();
        } else {
          leave.open();
        }
      }
      return;
    }
    if (leave.isOpen()) {
      // While it asks, keys answer it and nothing else: Esc is "no" and
      // does not also cancel the attack, Tab moves between the answers,
      // and Enter or Space press the focused one, natively. No skill,
      // target or attack goes out. Movement keys still move.
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        leave.close();
      } else if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        leave.cycleFocus();
      } else if (event.key !== "Enter" && event.key !== " ") {
        event.stopPropagation();
      }
      return;
    }
    // Options or Help over the match (#454, #1257): keys are theirs, as for the leave
    // question. Its Esc closes it, on the screen bar's own listener, which
    // runs first, so an Esc it used is not also Cancel Action. Movement
    // keys still move.
    if (
      isOptionsOverlayOpen() ||
      isHelpOverlayOpen() ||
      (event.key === "Escape" && event.defaultPrevented)
    ) {
      return;
    }
    if (seat === undefined) {
      handleWatcherKey(event);
      return;
    }
    const match = seat.getSnapshot();
    if (event.key === "Escape") {
      // Cancel Action (#300): the cast, the attack and a walk, whichever
      // run. With none, your target is let go (#1151).
      const intent = event.repeat ? undefined : escapeIntent(seat.getSnapshot());
      if (intent === "cancel") {
        seat.sendIntent({ kind: "cancel" });
      } else if (intent === "clear-target") {
        seat.sendIntent({ kind: "target", targetSessionId: null });
      }
      return;
    }
    if (isTyping(event.target)) {
      return;
    }
    const action = actionForCode(keymap, event.code);
    if (action === undefined) {
      return;
    }
    if (action !== "show-names") {
      // A bound key is the game's: never the browser's focus cycle (#55),
      // nor a page scroll on the arrows or Space.
      event.preventDefault();
    }
    // Held keys auto-repeat; one press is one target, attack, toggle or
    // cast (#43, #160).
    if (event.repeat) {
      return;
    }
    if (action === "target-next") {
      const current = match.players.find(
        (player) => player.sessionId === seat.selfSessionId,
      )?.targetSessionId;
      const next = nextTabTarget(
        match.players,
        seat.selfSessionId,
        current,
        event.shiftKey ? -1 : 1,
      );
      if (next !== undefined && next !== current) {
        seat.sendIntent({ kind: "target", targetSessionId: next });
      }
    } else if (action === "target-closest") {
      const current = match.players.find(
        (player) => player.sessionId === seat.selfSessionId,
      )?.targetSessionId;
      const closest = closestTarget(match.players, seat.selfSessionId);
      if (closest !== undefined && closest !== current) {
        seat.sendIntent({ kind: "target", targetSessionId: closest });
      }
    } else if (action === "target-called") {
      const intent = calledTargetIntent(seat.getSnapshot(), seat.getCalls());
      if (intent !== undefined) {
        seat.sendIntent(intent);
      }
    } else if (action === "target-self") {
      const intent = selfTargetIntent(match.players, seat.selfSessionId);
      if (intent !== undefined) {
        seat.sendIntent(intent);
      }
    } else if (action === "attack") {
      for (const intent of attackKeyIntents(seat.getSnapshot())) {
        seat.sendIntent(intent);
      }
    } else if (action === "mute") {
      toggleMute();
    } else if (action === "drop-bundle") {
      seat.sendIntent({ kind: "drop-bundle" });
    } else if (WEAPON_SET_ACTIONS.includes(action)) {
      const intent = weaponSetIntent(action, seat.weaponSets);
      if (intent !== undefined) {
        seat.sendIntent(intent);
      }
    } else if (action === "call-target" || action === "ping") {
      // For a mouse without a wheel click (#443).
      const snapshot = seat.getSnapshot();
      const call =
        action === "call-target"
          ? callTargetCall(snapshot)
          : pingCall(snapshot, viewport?.pointerWorld());
      if (call !== undefined) {
        seat.sendCall(call);
      }
    } else {
      const slot = skillSlotForKeyDown(event, keymap, seat.skillBar);
      if (slot !== undefined) {
        useSkill(slot);
      }
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  /** The match as the last frame drew it; a watcher's is `undefined` until its first (#480). */
  let latestMatch: MatchSnapshot | undefined;
  let latestArena: ArenaSnapshot | undefined;
  // The names key shows every name; the cursor shows one (#253).
  const nameReveal = attachNameReveal(window, keymap);
  // While the match runs, closing or reloading the tab asks first: an
  // accidental Ctrl+W must not drop the player (#302). Not once the
  // result shows; then leaving is what they mean.
  const askBeforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
  };
  let guardingUnload = false;
  const guardUnload = (running: boolean): void => {
    if (running !== guardingUnload) {
      guardingUnload = running;
      if (running) {
        window.addEventListener("beforeunload", askBeforeUnload);
      } else {
        window.removeEventListener("beforeunload", askBeforeUnload);
      }
    }
  };
  const reconnectOverlay = mountReconnectOverlay(parent);
  const reconnectCountdown = attachReconnectCountdown(reconnectOverlay);
  viewed.onConnectionChange((state) => {
    reconnectCountdown.connectionChanged(state);
    matchSounds.connectionChanged(state);
    matchMusic.connectionChanged(state);
    callbacks.onConnectionChange?.(state);
  });

  viewed.onCombat((message) => {
    if (latestMatch === undefined) {
      return;
    }
    if (viewport !== undefined) {
      showCombatFeedback(viewport.scene, message, latestMatch);
    }
    // A cast of ours that never went off flashes its slot (#300).
    const buttons = hud.skillBar.querySelectorAll("button");
    for (const flash of seat === undefined
      ? []
      : slotFlashes(message.events, seat.selfSessionId, seat.skillBar)) {
      const button = buttons[flash.slot];
      if (button !== undefined) {
        flashSlot(button, flash.kind);
      }
    }
    // So does the target's, in the target frame (#484): a watcher's is
    // whom it follows.
    const self = latestMatch.players.find((p) => p.sessionId === viewed.selfSessionId);
    flashTargetCast(hud, message.events, seat === undefined ? followedId : self?.targetSessionId);
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  seat?.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message));
  });

  // Where the arena will be while a watcher's delay fills (#480). The
  // score and the target frame have nothing to show yet, so they wait
  // with it.
  let waiting: HTMLElement | undefined;
  let finished = false;
  /** The match as the last frame saw it, so an objective toasts once (#1226, #1387). */
  let lastMatch: MatchSnapshot | undefined;
  /** The summary (#1057), drawn once under the result banner when the host's `ended` lands. */
  let summary:
    { readonly tables: readonly SummaryTable[]; readonly panel: HTMLElement } | undefined;
  const onFrame = (deltaSeconds: number): void => {
    const match = viewed.getSnapshot();
    if (match === undefined) {
      if (waiting === undefined) {
        waiting = watchingNotice(viewed.delaySeconds);
        parent.appendChild(waiting);
        hud.top.hidden = true;
      }
      return;
    }
    if (waiting !== undefined) {
      waiting.remove();
      waiting = undefined;
      hud.top.hidden = false;
    }
    latestMatch = match;
    const previous = lastMatch ?? match;
    lastMatch = match;
    matchSounds.snapshot(match);
    matchMusic.snapshot(match);
    // A watcher leaving costs nobody anything.
    guardUnload(seat !== undefined && match.phase !== "finished");
    const self = match.players.find((p) => p.sessionId === viewed.selfSessionId);
    const objective =
      standBoostToast(previous, match, self?.team) ??
      objectiveScoreToast(previous, match, self?.team, mode);
    // Who your Ghostly Hero follows now (#1419): a toast, no sound.
    const leader = ghostLeaderToast(
      previous,
      match,
      viewed.selfSessionId,
      self?.team,
      playerNames(match),
    );
    if (leader !== undefined) {
      toast(leader);
    }
    if (objective !== undefined) {
      toast(objective.text);
      sounds.play(objective.side === "ours" ? "objective-ours" : "objective-theirs");
    }
    if (match.phase === "finished" && !finished) {
      finished = true;
      callbacks.onFinished?.({
        winningTeam: match.winningTeam,
        endReason: match.endReason,
        selfTeam: self?.team,
        aggression: match.aggression,
      });
    }
    // The snapshot that says "finished" may land a frame before the `ended` that carries it.
    if (match.phase === "finished" && summary === undefined && match.summary !== undefined) {
      const bots = new Set(
        match.players.filter((player) => player.bot).map((player) => player.sessionId),
      );
      const tables = summaryTables(match.summary, viewed.selfSessionId, self?.team, bots);
      const panel = renderSummary(parent, tables);
      panel.classList.add("hud-summary");
      summary = { tables, panel };
    }
    // A watcher follows one player (#480), the first seat until it picks
    // another, and keeps to a body that died. One gone, it starts over.
    if (seat === undefined && !match.players.some((p) => p.sessionId === followedId)) {
      followedId = firstFollowed(match.players);
    }
    const followed = match.players.find((p) => p.sessionId === followedId);
    camera?.frame(deltaSeconds, seat === undefined ? followed : self);
    // Hover is hit-tested every frame, through the camera as it is now, so
    // a body that walks under a still cursor, or a camera that moves under
    // it, shows the right name.
    partyWindow.update(match);
    const arena = withNames(
      toArenaSnapshot(match, walls, shrines, flagField, relicField),
      viewport?.pointerWorld(),
      nameReveal.held(),
    );
    // A watcher has no team, so nobody's calls.
    latestArena = seat === undefined ? arena : withCalls(arena, seat.getCalls());
    viewport?.scene.setSnapshot(latestArena);
    compass.update(latestArena, viewed.selfSessionId);
    // For the e2e specs: who your team has called.
    const called = latestArena.calledId ?? "";
    if (parent.dataset.called !== called) {
      parent.dataset.called = called;
    }

    if (seat === undefined) {
      // No self: the scoreboard, clock and result alone, and the target
      // frame shows the followed player.
      updateHud(
        hud,
        undefined,
        undefined,
        [],
        [],
        null,
        () => undefined,
        wallSegments,
        viewed.timeLimitSeconds,
        mode,
        match,
      );
      updateFollowed(hud, viewed.selfSessionId, followed, match);
      return;
    }
    const target = match.players.find((p) => p.sessionId === self?.targetSessionId);
    // `match` carries the score, clock and outcome. Omitting it
    // here left the scoreboard, the match clock and the victory banner
    // permanently blank: the server tracked all three and the HUD could
    // draw all three, and nothing connected them.
    refreshSkillBar(hud, seat.skillBar);
    updateHud(
      hud,
      self,
      target,
      seat.skillBar,
      seat.getAdrenaline(),
      seat.getAdrenalineLossIn(),
      (targetId) => seat.getChainMark(targetId),
      wallSegments,
      seat.timeLimitSeconds,
      mode,
      match,
    );
    updateRecharges(hud, seat.skillBar, seat.getRecharges(), seat.getQueuedSlot());
    renderWeaponSets(weaponSets, seat.weaponSets);
  };
  const offFrame = viewport?.onFrame(onFrame) ?? animationFrames(onFrame);

  // A misclick must never move you (#438): the left button only walks,
  // bodies included, and keeps the target; the right one picks, on its
  // release, so a later drag can pan instead. A watcher's drag still pans.
  const doubleClick = createDoubleClick();
  const offPointer =
    seat === undefined
      ? undefined
      : viewport?.onButton(({ button, phase, world }) => {
          if (button === "left" && phase === "down") {
            seat.sendIntent({ kind: "walk-to", x: world.x, y: world.y });
            viewport.scene.showWalkMarker(world);
          } else if (button === "middle" && phase === "down" && latestArena !== undefined) {
            // A wheel click calls a foe, or pings the point (#443, #1055).
            const action = middleClickAction(seat.getSnapshot(), latestArena, world);
            if (action.kind === "call") {
              seat.sendCall(action.call);
            }
          }
        });
  // An RMB drag pans; a click picks (#442).
  camera?.onSecondaryClick((world) => {
    if (seat === undefined || latestArena === undefined) {
      return;
    }
    const intents = secondaryClickIntents(
      seat.getSnapshot(),
      latestArena,
      world,
      doubleClick,
      performance.now(),
    );
    for (const intent of intents) {
      seat.sendIntent(intent);
    }
  });

  /** The end line (#1997), made the first time it is set. */
  let endLine:
    | { readonly root: HTMLElement; readonly text: HTMLElement; readonly press: HTMLElement }
    | undefined;
  let onEndPress: (() => void) | undefined;

  return {
    summary: () => summary?.tables,
    setEndLine(line) {
      if (line === undefined) {
        endLine?.root.remove();
        endLine = undefined;
        return;
      }
      if (endLine === undefined) {
        const root = document.createElement("div");
        root.className = "hud-end-line";
        const text = root.appendChild(document.createElement("span"));
        const press = root.appendChild(
          button("", "", () => {
            onEndPress?.();
          }),
        );
        parent.appendChild(root);
        endLine = { root, text, press };
      }
      onEndPress = line.onPress;
      endLine.text.textContent = line.text;
      endLine.press.textContent = line.button;
    },
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      disposed = true;
      offFrame();
      guardUnload(false);
      offPointer?.();
      coverObserver.disconnect();
      camera?.dispose();
      partyWindow.dispose();
      compass.dispose();
      delete parent.dataset.called;
      parent.style.removeProperty("--hud-height");
      nameReveal.detach();
      window.removeEventListener("keydown", handleKeyDown);
      detachMovement?.();
      matchSounds.dispose();
      matchMusic.dispose();
      reconnectCountdown.dispose();
      reconnectOverlay.destroy();
      // The scoreboard and target frame, result and mute button sit beside
      // the HUD root, in the shared viewport, so they go one by one or pile
      // up per match.
      hud.root.remove();
      hud.slotTips.dispose();
      hud.effects.dispose();
      hud.targetEffects.dispose();
      setToastHost(null);
      hud.top.remove();
      hud.result.remove();
      summary?.panel.remove();
      endLine?.root.remove();
      waiting?.remove();
      offMute();
      jukebox.dispose();
      closeOptionsOverlay();
      closeHelpOverlay();
      detachFullscreen();
      hud.controls.remove();
      viewport?.destroy();
      notice?.remove();
      await viewed.disconnect();
    },
  };
}
