import Phaser from "phaser";

import { vec2 } from "@vibewars/game-core";

import type { MatchSnapshot } from "./net/match-client.js";
import { connectToMatch, endpointFromLocation } from "./net/match-client.js";
import { attachKeyboardMoveInput } from "./input/keyboard-move.js";
import { ArenaScene, actorAtPoint, type ArenaSnapshot } from "./render/arena-scene.js";

/**
 * Sprint 2-4 browser client: boots Phaser 4 into `#viewport`, connects to
 * the match room, moves with WASD, and renders the server's authoritative
 * state. There is no lobby/menu yet (Sprint 19) — the page connects
 * directly to the match room on load.
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

/** Project the wire-level snapshot onto the renderer's own shape (ADR-0001:
 *  the renderer never depends on network/protocol types directly). */
function toArenaSnapshot(match: MatchSnapshot): ArenaSnapshot {
  const self = match.players.find((player) => player.sessionId === match.selfSessionId);
  return {
    walls: [],
    // Render *my* current target, as the server has authoritatively
    // confirmed it — not whatever was last clicked, which may have been
    // rejected (brief §32: the client only sends intent).
    targetId: self?.targetSessionId,
    actors: match.players.map((player) => ({
      id: player.sessionId,
      position: { x: player.x, y: player.y },
      radius: 14,
      team: player.sessionId === match.selfSessionId ? "self" : "ally",
    })),
  };
}

async function boot(): Promise<void> {
  const viewport = requireElement("#viewport");

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: viewport,
    backgroundColor: "#0e1116",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
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
  setStatus(`online as ${connection.selfSessionId.slice(0, 6)}`, "online");

  attachKeyboardMoveInput(window, (direction) => {
    if (direction.x === 0 && direction.y === 0) {
      connection.sendIntent({ kind: "stop" });
    } else {
      connection.sendIntent({ kind: "move", dirX: direction.x, dirY: direction.y });
    }
  });

  // Rendering is driven by the scene's own Phaser update loop; push a fresh
  // snapshot from the latest server state on every scene update rather than
  // on a separate timer, so there is exactly one place "when do we redraw"
  // is decided.
  let latestSnapshot = toArenaSnapshot(connection.getSnapshot());
  game.events.on(Phaser.Core.Events.STEP, () => {
    latestSnapshot = toArenaSnapshot(connection.getSnapshot());
    scene.setSnapshot(latestSnapshot);
  });

  // Click-to-target (brief §5): hit-test the clicked world point against
  // the most recently rendered actors. Clicking empty space clears the
  // target. The server is the one that decides whether a target id is
  // actually valid (brief §32) — this only ever sends a request.
  scene.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    const hit = actorAtPoint(latestSnapshot, vec2(pointer.worldX, pointer.worldY));
    connection.sendIntent({ kind: "target", targetSessionId: hit?.id ?? null });
  });
}

boot().catch((error: unknown) => {
  setStatus("failed to start", "error");
  console.error("[web] boot failed", error);
});
