import type { PlayerBuild } from "@vibewars/game-core";
import type { WallDescriptor } from "@vibewars/game-protocol";

import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { connectToMatch, type MatchTarget } from "./net/match-client.js";
import type { MatchConnection, MatchSnapshot, SkillSlot } from "./net/match-connection.js";
import { actorAtPoint, type ArenaSnapshot, type RenderableWall } from "./render/arena-snapshot.js";
import { createArenaViewport } from "./render/arena-viewport.js";
import { showCombatFeedback } from "./render/combat-feedback.js";
import { createHud, describeRefusal, flashMessage, renderSkillBar, updateHud } from "./ui/hud.js";

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
  skillBar: readonly SkillSlot[],
): ArenaSnapshot {
  const self = match.players.find((player) => player.sessionId === match.selfSessionId);
  const activationById = new Map(skillBar.map((slot) => [slot.id, slot.activationSeconds]));

  return {
    walls,
    // Render the target the *server* confirmed, not whatever was last
    // clicked — a click is only a request (brief §32).
    targetId: self?.targetSessionId,
    actors: match.players.map((player) => {
      const activation = activationById.get(player.castingSkillId ?? "") ?? 0;
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
          player.castingSkillId !== undefined && activation > 0
            ? Math.max(0, Math.min(1, 1 - player.castRemaining / activation))
            : undefined,
        statuses: player.statuses,
      };
    }),
  };
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

  const detachMovement = attachKeyboardMoveInput(window, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      callbacks.onLeave();
      return;
    }
    if (!/^[0-9]$/.test(event.key)) {
      return;
    }
    const slot = event.key === "0" ? 9 : Number.parseInt(event.key, 10) - 1;
    if (slot < connection.skillBar.length) {
      useSkill(slot);
    }
  };
  window.addEventListener("keydown", handleKeyDown);

  let latestMatch = connection.getSnapshot();
  let latestArena = toArenaSnapshot(latestMatch, walls, connection.skillBar);

  if (callbacks.onConnectionChange !== undefined) {
    connection.onConnectionChange(callbacks.onConnectionChange);
  }

  connection.onCombat((message) => {
    showCombatFeedback(scene, message, latestMatch);
  });
  // A key that does nothing reads as a broken game; say why (issue #51).
  connection.onCastRefused((message) => {
    flashMessage(hud, describeRefusal(message.reason));
  });

  const offFrame = viewport.onFrame(() => {
    latestMatch = connection.getSnapshot();
    latestArena = toArenaSnapshot(latestMatch, walls, connection.skillBar);
    scene.setSnapshot(latestArena);

    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    // `latestMatch` carries the score, clock and outcome. Omitting it
    // here left the scoreboard, the match clock and the victory banner
    // permanently blank: the server tracked all three and the HUD could
    // draw all three, and nothing connected them.
    updateHud(hud, self, target, connection.skillBar, latestMatch);
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
      hud.root.remove();
      viewport.destroy();
      await connection.disconnect();
    },
  };
}
