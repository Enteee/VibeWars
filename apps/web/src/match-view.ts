import Phaser from "phaser";

import { vec2 } from "@vibewars/game-core";
import type { WallDescriptor } from "@vibewars/game-protocol";

import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import type { CombatMessage, MatchSnapshot, SkillSlot } from "./net/match-client.js";
import { connectToMatch } from "./net/match-client.js";
import {
  ArenaScene,
  actorAtPoint,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-scene.js";
import { createHud, renderSkillBar, updateHud } from "./ui/hud.js";

/**
 * The in-match view: a Phaser viewport for the arena plus the DOM HUD,
 * wired to a live match connection.
 *
 * Owns its own teardown so the app shell can leave a match and come back
 * without leaking a Phaser game, a socket, or a keyboard listener.
 */

export interface MatchViewCallbacks {
  readonly onLeave: () => void;
}

export interface MatchView {
  dispose(): Promise<void>;
}

function toRenderableWall(wall: WallDescriptor): RenderableWall {
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

const DAMAGE_COLOUR = 0xff7b72;
const HEAL_COLOUR = 0x7ee787;
const NEUTRAL_COLOUR = 0xffd866;

let nextFloatingId = 0;

/** Turn server combat events into floating numbers above the right actor. */
export function showCombatFeedback(
  scene: ArenaScene,
  message: CombatMessage,
  snapshot: MatchSnapshot,
): void {
  for (const event of message.events) {
    const subject = snapshot.players.find((p) => p.sessionId === event.targetId);
    if (subject === undefined) {
      continue;
    }

    let text: string | undefined;
    let colour = NEUTRAL_COLOUR;
    switch (event.kind) {
      case "damage":
        text = `-${String(Math.round(event.amount ?? 0))}`;
        colour = DAMAGE_COLOUR;
        break;
      case "heal":
        text = `+${String(Math.round(event.amount ?? 0))}`;
        colour = HEAL_COLOUR;
        break;
      case "interrupted":
        text = "interrupted!";
        break;
      case "death":
        text = "defeated";
        colour = DAMAGE_COLOUR;
        break;
      default:
        // Status applications/removals already show as markers on the
        // actor; adding text for them too would just be noise.
        continue;
    }

    nextFloatingId += 1;
    scene.addFloatingText({
      id: nextFloatingId,
      text,
      position: vec2(subject.x, subject.y - 24),
      colour,
      remainingSeconds: 1.2,
    });
  }
}

export async function startMatchView(
  viewport: HTMLElement,
  endpoint: string,
  callbacks: MatchViewCallbacks,
): Promise<MatchView> {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: viewport,
    backgroundColor: "#0e1116",
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [ArenaScene],
  });

  const scene = await new Promise<ArenaScene>((resolve) => {
    game.events.once(Phaser.Core.Events.READY, () => {
      const candidate = game.scene.getScene(ArenaScene.KEY);
      if (candidate instanceof ArenaScene) {
        resolve(candidate);
      }
    });
  });

  const connection = await connectToMatch(endpoint);
  const walls = connection.map.walls.map(toRenderableWall);

  const hud = createHud(viewport);
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

  connection.onCombat((message) => {
    showCombatFeedback(scene, message, latestMatch);
  });

  const onStep = (): void => {
    latestMatch = connection.getSnapshot();
    latestArena = toArenaSnapshot(latestMatch, walls, connection.skillBar);
    scene.setSnapshot(latestArena);

    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    updateHud(hud, self, target, connection.skillBar);
  };
  game.events.on(Phaser.Core.Events.STEP, onStep);

  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    const hit = actorAtPoint(latestArena, vec2(pointer.worldX, pointer.worldY));
    connection.sendIntent({ kind: "target", targetSessionId: hit?.id ?? null });
  });

  return {
    async dispose(): Promise<void> {
      // Order matters: stop listening before tearing down, so a late
      // event cannot touch a destroyed scene.
      game.events.off(Phaser.Core.Events.STEP, onStep);
      window.removeEventListener("keydown", handleKeyDown);
      detachMovement();
      hud.root.remove();
      game.destroy(true);
      await connection.disconnect();
    },
  };
}
