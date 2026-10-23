import Phaser from "phaser";

import { vec2 } from "@vibewars/game-core";
import type { WallDescriptor } from "@vibewars/game-protocol";

import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import type { CombatMessage, MatchSnapshot, SkillSlot } from "./net/match-client.js";
import { connectToMatch, endpointFromLocation } from "./net/match-client.js";
import {
  ArenaScene,
  actorAtPoint,
  type ArenaSnapshot,
  type RenderableWall,
} from "./render/arena-scene.js";
import { createHud, renderSkillBar, updateHud } from "./ui/hud.js";

/**
 * The browser client: Phaser 4 viewport for the arena, HTML/CSS for the
 * HUD, WASD to move, click to target, number keys to cast.
 *
 * There is no lobby yet (Sprint 19) — the page joins the match room
 * directly on load, which is enough for two people on a LAN to open the
 * same URL and fight.
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

function toRenderableWall(wall: WallDescriptor): RenderableWall {
  return wall.kind === "rect"
    ? { kind: "rect", x: wall.x, y: wall.y, width: wall.width, height: wall.height }
    : { kind: "polygon", points: wall.points };
}

/** Project the wire snapshot onto the renderer's own shape (ADR-0001). */
function toArenaSnapshot(
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
function showCombatFeedback(
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
        // Status applications/removals are already visible as markers on
        // the actor; adding text for them too would just be noise.
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

async function boot(): Promise<void> {
  const viewport = requireElement("#viewport");

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

  setStatus("connecting…", "offline");
  const connection = await connectToMatch(endpointFromLocation(window.location));
  setStatus(`online as ${connection.selfSessionId.slice(0, 6)} · ${connection.map.name}`, "online");

  const walls = connection.map.walls.map(toRenderableWall);
  const hud = createHud(requireElement("#app"));
  const useSkill = (slot: number): void => {
    connection.sendIntent({ kind: "use-skill", slot });
  };
  renderSkillBar(hud, connection.skillBar, useSkill);

  attachKeyboardMoveInput(window, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

  // Number keys 1-9 and 0 cast the matching skill-bar slot.
  window.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!/^[0-9]$/.test(event.key)) {
      return;
    }
    const slot = event.key === "0" ? 9 : Number.parseInt(event.key, 10) - 1;
    if (slot < connection.skillBar.length) {
      useSkill(slot);
    }
  });

  let latestMatch = connection.getSnapshot();
  let latestArena = toArenaSnapshot(latestMatch, walls, connection.skillBar);

  connection.onCombat((message) => {
    showCombatFeedback(scene, message, latestMatch);
  });

  // One place decides when to redraw: the Phaser step.
  game.events.on(Phaser.Core.Events.STEP, () => {
    latestMatch = connection.getSnapshot();
    latestArena = toArenaSnapshot(latestMatch, walls, connection.skillBar);
    scene.setSnapshot(latestArena);

    const self = latestMatch.players.find((p) => p.sessionId === connection.selfSessionId);
    const target = latestMatch.players.find((p) => p.sessionId === self?.targetSessionId);
    updateHud(hud, self, target, connection.skillBar);
  });

  // Click-to-target: hit-test the clicked world point. Clicking empty
  // space clears the target.
  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    const hit = actorAtPoint(latestArena, vec2(pointer.worldX, pointer.worldY));
    connection.sendIntent({ kind: "target", targetSessionId: hit?.id ?? null });
  });
}

boot().catch((error: unknown) => {
  setStatus("failed to start", "error");
  console.error("[web] boot failed", error);
});
