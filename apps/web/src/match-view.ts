import { allWallSegments } from "@vibewars/game-maps/geometry";
import type { WallDescriptor } from "@vibewars/game-protocol";
import type { MatchConnection, MatchSnapshot } from "@vibewars/game-session";

import { attachMatchSounds } from "./audio/match-sounds.js";
import { onGlobalMute, setGlobalMute } from "./audio/global-mute.js";
import { soundPlayer } from "./audio/sound-player.js";
import { attackKeyIntents, hasActionToCancel } from "./input/attack-key.js";
import { createDoubleClick } from "./input/double-click.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { loadLayoutLabeller } from "./input/key-labels.js";
import { actionForCode, isShortcut } from "./input/keymap.js";
import { loadKeymap } from "./input/keymap-preference.js";
import { secondaryClickIntents } from "./input/mouse-intents.js";
import { attachNameReveal } from "./input/name-reveal.js";
import { nextTabTarget } from "./input/tab-target.js";
import { skillSlotForKeyDown } from "./input/skill-keys.js";
import { attachMatchMusic } from "./music/match-music.js";
import { music } from "./music/play-music.js";
import { TRACKS } from "./music/tracks/index.js";
import {
  ACTOR_RADIUS,
  withNames,
  teamColour,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-snapshot.js";
import { createArenaViewport } from "./render/arena-viewport.js";
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
  renderSkillBar,
  updateHud,
  updateRecharges,
} from "./ui/hud.js";
import { attachJukeboxPopover } from "./ui/jukebox.js";
import { attachReconnectCountdown, mountReconnectOverlay } from "./ui/reconnect-overlay.js";
import { flashSlot, slotFlashes } from "./ui/skill-slot-state.js";

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
}

export interface MatchViewOptions {
  /**
   * Where the match comes from: a lobby's match over its transport, or the
   * Training Ground's local simulation.
   */
  readonly connect: () => Promise<MatchConnection>;
}

export interface MatchView {
  dispose(): Promise<void>;
}

export function toRenderableWall(wall: WallDescriptor): RenderableWall {
  return wall.kind === "rect"
    ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
    : { kind: "polygon", points: wall.points };
}

/** Project the wire snapshot onto the renderer's own shape (ADR-0001). */
export function toArenaSnapshot(
  match: MatchSnapshot,
  walls: readonly RenderableWall[],
): ArenaSnapshot {
  const self = match.players.find((player) => player.sessionId === match.selfSessionId);

  return {
    walls,
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
        colour: teamColour(shooter !== undefined && shooter.team === self?.team ? "ally" : "enemy"),
      };
    }),
    // Render the target the *server* confirmed, not whatever was last
    // clicked — a click is only a request (brief §32).
    targetId: self?.targetSessionId,
    // Whose names show is the caller's to say (`withNames`, #253).
    hoverId: undefined,
    showAllNames: false,
    actors: match.players.map((player) => {
      return {
        id: player.sessionId,
        name: player.name,
        position: { x: player.x, y: player.y },
        facing: player.facing,
        weaponId: player.weaponId,
        swingElapsed: player.swingElapsed,
        swingTotal: player.swingTotal,
        offhandId: player.offhandId,
        profession: player.primaryProfession,
        radius: ACTOR_RADIUS,
        team:
          player.sessionId === match.selfSessionId
            ? ("self" as const)
            : player.team === self?.team
              ? ("ally" as const)
              : ("enemy" as const),
        health: player.health,
        maxHealth: player.maxHealth,
        dead: player.dead,
        castProgress:
          // The server's total, not the skill's activation time: dazed
          // doubles a cast, and the bar must fill over the real one.
          player.castingSkillId !== undefined && player.castTotal > 0
            ? Math.max(0, Math.min(1, 1 - player.castRemaining / player.castTotal))
            : undefined,
        statuses: player.statuses,
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

export async function startMatchView(
  parent: HTMLElement,
  callbacks: MatchViewCallbacks,
  options: MatchViewOptions,
): Promise<MatchView> {
  const viewport = await createArenaViewport(parent);
  const { scene } = viewport;

  let connection: MatchConnection;
  try {
    connection = await options.connect();
  } catch (error) {
    // Refused, or the host never answered: no arena to leave behind.
    viewport.destroy();
    throw error;
  }
  const walls = connection.map.walls.map(toRenderableWall);
  // Once per match, for the skill bar's line-of-sight hint (#485).
  const wallSegments = allWallSegments(connection.map.walls);
  const camera = attachFollowCamera(viewport, parent, connection.map);

  const hud = createHud(parent);
  // The arena's edge stops below the scoreboard and above the bars, not
  // under them (#440). From the bars, as the lines above them come and go.
  const measureCover = (): void => {
    camera.setCover({
      top: hud.scoreboard.offsetTop + hud.scoreboard.offsetHeight,
      bottom: hud.root.offsetHeight - hud.bars.offsetTop,
    });
  };
  const coverObserver = new ResizeObserver(measureCover);
  coverObserver.observe(hud.root);
  coverObserver.observe(hud.bars);
  coverObserver.observe(hud.scoreboard);
  const useSkill = (slot: number): void => {
    connection.sendIntent({ kind: "use-skill", slot });
  };
  renderSkillBar(hud, connection.skillBar, connection.ranks, useSkill);
  // Read once per match: a keymap changed elsewhere applies from the next.
  const keymap = loadKeymap();
  renderKeyLabels(hud, keymap);
  let disposed = false;
  void loadLayoutLabeller().then((label) => {
    if (label !== undefined && !disposed) {
      renderKeyLabels(hud, keymap, label);
    }
  });

  const sounds = soundPlayer();
  const matchSounds = attachMatchSounds(connection, sounds);
  const matchMusic = attachMatchMusic(connection, {
    screen: "match",
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

  const detachMovement = attachKeyboardMoveInput(window, keymap, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

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
      if (!event.repeat) {
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
    if (event.key === "Escape") {
      // Cancel Action (#300): the cast, the attack and a walk, whichever run.
      if (!event.repeat && hasActionToCancel(connection.getSnapshot())) {
        connection.sendIntent({ kind: "cancel" });
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
      const current = latestMatch.players.find(
        (player) => player.sessionId === connection.selfSessionId,
      )?.targetSessionId;
      const next = nextTabTarget(
        latestMatch.players,
        connection.selfSessionId,
        current,
        event.shiftKey ? -1 : 1,
      );
      if (next !== undefined && next !== current) {
        connection.sendIntent({ kind: "target", targetSessionId: next });
      }
    } else if (action === "attack") {
      for (const intent of attackKeyIntents(connection.getSnapshot())) {
        connection.sendIntent(intent);
      }
    } else if (action === "mute") {
      toggleMute();
    } else {
      const slot = skillSlotForKeyDown(event, keymap, connection.skillBar);
      if (slot !== undefined) {
        useSkill(slot);
      }
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  let latestMatch = connection.getSnapshot();
  let latestArena = toArenaSnapshot(latestMatch, walls);
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
  connection.onConnectionChange((state) => {
    reconnectCountdown.connectionChanged(state);
    matchSounds.connectionChanged(state);
    matchMusic.connectionChanged(state);
    callbacks.onConnectionChange?.(state);
  });

  connection.onCombat((message) => {
    showCombatFeedback(scene, message, latestMatch);
    // A cast of ours that never went off flashes its slot (#300).
    const buttons = hud.skillBar.querySelectorAll("button");
    for (const flash of slotFlashes(
      message.events,
      connection.selfSessionId,
      connection.skillBar,
    )) {
      const button = buttons[flash.slot];
      if (button !== undefined) {
        flashSlot(button, flash.kind);
      }
    }
    // So does the target's, in the target frame (#484).
    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    flashTargetCast(hud, message.events, self?.targetSessionId);
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  connection.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message));
  });

  const offFrame = viewport.onFrame((deltaSeconds) => {
    latestMatch = connection.getSnapshot();
    matchSounds.snapshot(latestMatch);
    matchMusic.snapshot(latestMatch);
    guardUnload(latestMatch.phase !== "finished");
    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    camera.frame(deltaSeconds, self === undefined ? undefined : { x: self.x, y: self.y });
    // Hover is hit-tested every frame, through the camera as it is now, so
    // a body that walks under a still cursor, or a camera that moves under
    // it, shows the right name.
    latestArena = withNames(
      toArenaSnapshot(latestMatch, walls),
      viewport.pointerWorld(),
      nameReveal.held(),
    );
    scene.setSnapshot(latestArena);

    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    // `latestMatch` carries the score, clock and outcome. Omitting it
    // here left the scoreboard, the match clock and the victory banner
    // permanently blank: the server tracked all three and the HUD could
    // draw all three, and nothing connected them.
    updateHud(hud, self, target, connection.skillBar, wallSegments, latestMatch);
    updateRecharges(hud, connection.skillBar, connection.getRecharges());
  });

  // A misclick must never move you (#438): the left button only walks,
  // bodies included, and keeps the target; the right one picks, on its
  // release, so a later drag can pan instead.
  const doubleClick = createDoubleClick();
  const offPointer = viewport.onButton(({ button, phase, world }) => {
    if (button === "left" && phase === "down") {
      connection.sendIntent({ kind: "walk-to", x: world.x, y: world.y });
      viewport.scene.showWalkMarker(world);
    } else if (button === "right" && phase === "up") {
      const intents = secondaryClickIntents(
        latestMatch,
        latestArena,
        world,
        doubleClick,
        performance.now(),
      );
      for (const intent of intents) {
        connection.sendIntent(intent);
      }
    }
  });

  return {
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      disposed = true;
      offFrame();
      guardUnload(false);
      offPointer();
      coverObserver.disconnect();
      camera.dispose();
      nameReveal.detach();
      window.removeEventListener("keydown", handleKeyDown);
      detachMovement();
      matchSounds.dispose();
      matchMusic.dispose();
      reconnectCountdown.dispose();
      reconnectOverlay.destroy();
      // The scoreboard, result and mute button sit beside the HUD root, in
      // the shared viewport, so they go one by one or pile up per match.
      hud.root.remove();
      hud.slotTips.dispose();
      hud.scoreboard.remove();
      hud.result.remove();
      hud.mute.remove();
      offMute();
      jukebox.dispose();
      hud.music.remove();
      hud.leave.remove();
      viewport.destroy();
      await connection.disconnect();
    },
  };
}
