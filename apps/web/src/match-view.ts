import type { PlayerBuild, Vec2 } from "@vibewars/game-core";
import type { WallDescriptor } from "@vibewars/game-protocol";

import { attachMatchSounds } from "./audio/match-sounds.js";
import { saveMuted } from "./audio/mute-preference.js";
import { soundPlayer } from "./audio/sound-player.js";
import {
  attackClickIntents,
  attackKeyIntents,
  isAttacking,
  isCasting,
} from "./input/attack-key.js";
import { createDoubleClick } from "./input/double-click.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { loadLayoutLabeller } from "./input/key-labels.js";
import { actionForCode, isShortcut } from "./input/keymap.js";
import { loadKeymap } from "./input/keymap-preference.js";
import { attachNameReveal } from "./input/name-reveal.js";
import { nextTabTarget } from "./input/tab-target.js";
import { skillSlotForKeyDown } from "./input/skill-keys.js";
import { connectToMatch, type MatchTarget } from "./net/match-client.js";
import type { MatchConnection, MatchSnapshot } from "./net/match-connection.js";
import {
  ACTOR_RADIUS,
  actorAtPoint,
  withNames,
  teamColour,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-snapshot.js";
import { createArenaViewport } from "./render/arena-viewport.js";
import { showCombatFeedback } from "./render/combat-feedback.js";
import { projectileSprite } from "./render/projectiles.js";
import {
  createHud,
  describeRefusal,
  flashMessage,
  renderLeave,
  renderKeyLabels,
  renderMute,
  renderSkillBar,
  updateHud,
  updateRecharges,
} from "./ui/hud.js";
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
  /** Which match on the game server: Quick Match unless a lobby says otherwise. */
  readonly target?: MatchTarget | undefined;
  /**
   * The build to request. The server validates it and may refuse it, so
   * this is what the player *asked* to play, never what they got.
   */
  readonly build?: PlayerBuild | undefined;
  /**
   * Where the match comes from. Defaults to the game server, with `target`
   * and `build`; the Training Ground passes a local simulation instead.
   */
  readonly connect?: (() => Promise<MatchConnection>) | undefined;
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
        sprite: projectileSprite(shot.weaponId),
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
  endpoint: string,
  callbacks: MatchViewCallbacks,
  options: MatchViewOptions = {},
): Promise<MatchView> {
  const viewport = await createArenaViewport(parent, { mode: "resize" });
  const { scene } = viewport;

  const connect =
    options.connect ??
    (() => connectToMatch(endpoint, options.target ?? { kind: "quick" }, options.build));
  const connection = await connect();
  const walls = connection.map.walls.map(toRenderableWall);

  const hud = createHud(parent);
  const useSkill = (slot: number): void => {
    connection.sendIntent({ kind: "use-skill", slot });
  };
  renderSkillBar(hud, connection.skillBar, useSkill);
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
  const toggleMute = (): void => {
    sounds.setMuted(!sounds.muted);
    saveMuted(sounds.muted);
    renderMute(hud, sounds.muted);
  };
  renderMute(hud, sounds.muted);
  hud.mute.addEventListener("click", toggleMute);
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
      // Cancel Action (#300): the cast and the attack, whichever run.
      const snapshot = connection.getSnapshot();
      if (!event.repeat && (isCasting(snapshot) || isAttacking(snapshot))) {
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
      const slot = skillSlotForKeyDown(event, keymap, connection.skillBar.length);
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
  // In world units. The camera never moves, so a still cursor stays over
  // the same spot while bodies walk under it.
  let pointer: Vec2 | undefined;

  connection.onConnectionChange((state) => {
    matchSounds.connectionChanged(state);
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
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  connection.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message));
  });

  const offFrame = viewport.onFrame(() => {
    latestMatch = connection.getSnapshot();
    matchSounds.snapshot(latestMatch);
    guardUnload(latestMatch.phase !== "finished");
    // Hover is hit-tested every frame, not every move, so a body that
    // walks under a still cursor shows its name.
    latestArena = withNames(toArenaSnapshot(latestMatch, walls), pointer, nameReveal.held());
    scene.setSnapshot(latestArena);

    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    // `latestMatch` carries the score, clock and outcome. Omitting it
    // here left the scoreboard, the match clock and the victory banner
    // permanently blank: the server tracked all three and the HUD could
    // draw all three, and nothing connected them.
    updateHud(hud, self, target, connection.skillBar, latestMatch);
    updateRecharges(hud, connection.skillBar, connection.getRecharges());
  });

  // A body is targeted, and a double-click on an enemy attacks it, as
  // Space would (#298). The ground is walked to, and the target kept, as
  // in GW1 (#310).
  const doubleClick = createDoubleClick();
  const offPointer = viewport.onPointerDown((world) => {
    const hit = actorAtPoint(latestArena, world);
    const double = doubleClick.press(hit?.id, performance.now());
    if (hit === undefined) {
      connection.sendIntent({ kind: "walk-to", x: world.x, y: world.y });
      viewport.scene.showWalkMarker(world);
      return;
    }
    connection.sendIntent({ kind: "target", targetSessionId: hit.id });
    if (double) {
      for (const intent of attackClickIntents(latestMatch, hit.id)) {
        connection.sendIntent(intent);
      }
    }
  });
  const offPointerMove = viewport.onPointerMove((world) => {
    pointer = world;
  });

  return {
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      disposed = true;
      offFrame();
      guardUnload(false);
      offPointer();
      offPointerMove();
      nameReveal.detach();
      window.removeEventListener("keydown", handleKeyDown);
      detachMovement();
      matchSounds.dispose();
      // The scoreboard, result and mute button sit beside the HUD root, in
      // the shared viewport, so they go one by one or pile up per match.
      hud.root.remove();
      hud.scoreboard.remove();
      hud.result.remove();
      hud.mute.remove();
      hud.leave.remove();
      viewport.destroy();
      await connection.disconnect();
    },
  };
}
