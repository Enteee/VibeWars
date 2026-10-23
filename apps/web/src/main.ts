import Phaser from "phaser";

import { vec2 } from "@vibewars/game-core";

import { ArenaScene, type ArenaSnapshot } from "./render/arena-scene.js";

/**
 * Sprint 0/2 browser shell.
 *
 * Boots Phaser 4 into the `#viewport` element and renders a static geometric
 * scene. Networking is wired in Sprint 3; until then this proves the renderer,
 * the build pipeline and the HTML shell work together.
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

const DEMO_SNAPSHOT: ArenaSnapshot = {
  walls: [
    { x: 260, y: 140, width: 220, height: 24 },
    { x: 260, y: 300, width: 24, height: 180 },
    { x: 560, y: 260, width: 180, height: 24 },
  ],
  actors: [
    { id: "self", position: vec2(180, 240), radius: 14, team: "self" },
    { id: "ally-1", position: vec2(140, 310), radius: 14, team: "ally" },
    { id: "enemy-1", position: vec2(620, 200), radius: 14, team: "enemy" },
    { id: "enemy-2", position: vec2(680, 330), radius: 14, team: "enemy" },
  ],
  targetId: "enemy-1",
};

function boot(): void {
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

  game.events.once(Phaser.Core.Events.READY, () => {
    const scene = game.scene.getScene(ArenaScene.KEY);
    if (scene instanceof ArenaScene) {
      scene.setSnapshot(DEMO_SNAPSHOT);
    }
    setStatus("renderer ready", "online");
  });
}

try {
  boot();
} catch (error: unknown) {
  setStatus("failed to start", "error");
  console.error("[web] boot failed", error);
}
