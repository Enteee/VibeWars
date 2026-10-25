import type { PlayerBuild } from "@vibewars/game-core";
import type { WallDescriptor } from "@vibewars/game-protocol";

import { attachMatchSounds } from "./audio/match-sounds.js";
import { saveMuted } from "./audio/mute-preference.js";
import { soundPlayer } from "./audio/sound-player.js";
import { attackKeyIntents, isAttacking } from "./input/attack-key.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { nextTabTarget } from "./input/tab-target.js";
import { skillSlotForKeyDown } from "./input/skill-keys.js";
import { connectToMatch, type MatchTarget } from "./net/match-client.js";
import type { MatchConnection, MatchSnapshot } from "./net/match-connection.js";
import { actorAtPoint, type ArenaSnapshot, type RenderableWall } from "./render/arena-snapshot.js";
import { createArenaViewport } from "./render/arena-viewport.js";
import { showCombatFeedback } from "./render/combat-feedback.js";
import {
  createHud,
  describeRefusal,
  flashMessage,
  renderLeave,
  renderMute,
  renderSkillBar,
  updateHud,
  updateRecharges,
} from "./ui/hud.js";

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
    // Render the target the *server* confirmed, not whatever was last
    // clicked — a click is only a request (brief §32).
    targetId: self?.targetSessionId,
    actors: match.players.map((player) => {
      return {
        id: player.sessionId,
        name: player.name,
        position: { x: player.x, y: player.y },
        radius: 14,
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
  renderLeave(hud, callbacks.onLeave);

  const detachMovement = attachKeyboardMoveInput(window, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Tab") {
      // Never the browser's focus cycle, during a match (#55).
      event.preventDefault();
      if (!event.repeat) {
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
      }
      return;
    }
    if (event.key === " ") {
      // Held Space auto-repeats; one attack is all it means (#160).
      if (!event.repeat && !isTyping(event.target)) {
        event.preventDefault();
        for (const intent of attackKeyIntents(connection.getSnapshot())) {
          connection.sendIntent(intent);
        }
      }
      return;
    }
    if (event.key === "Escape") {
      if (!event.repeat && isAttacking(connection.getSnapshot())) {
        connection.sendIntent({ kind: "cancel-attack" });
      }
      return;
    }
    if (event.key === "m" || event.key === "M") {
      if (!event.repeat && !isTyping(event.target)) {
        toggleMute();
      }
      return;
    }
    const slot = skillSlotForKeyDown(event, connection.skillBar.length);
    if (slot !== undefined) {
      useSkill(slot);
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  let latestMatch = connection.getSnapshot();
  let latestArena = toArenaSnapshot(latestMatch, walls);

  connection.onConnectionChange((state) => {
    matchSounds.connectionChanged(state);
    callbacks.onConnectionChange?.(state);
  });

  connection.onCombat((message) => {
    showCombatFeedback(scene, message, latestMatch);
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  connection.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message));
  });

  const offFrame = viewport.onFrame(() => {
    latestMatch = connection.getSnapshot();
    matchSounds.snapshot(latestMatch);
    latestArena = toArenaSnapshot(latestMatch, walls);
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

  const offPointer = viewport.onPointerDown((world) => {
    const hit = actorAtPoint(latestArena, world);
    connection.sendIntent({ kind: "target", targetSessionId: hit?.id ?? null });
  });

  return {
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      offFrame();
      offPointer();
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
