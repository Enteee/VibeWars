import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";

import type { MapStructure } from "./arena-snapshot.js";
import { type Box, shapeOutline } from "./layer-surfaces.js";
import { deckFades } from "./lighting-pass.js";
import { elevationOf, renderOrder } from "./render-order.js";
import { type VignetteCell, vignetteCells } from "./vignette-model.js";
import { boxOfPoints } from "./wall-tops.js";

/**
 * The deck tops the vignette darkens (#4070), by deck layer, as drawn:
 * lifted by their layer's height. A deck that fades off a body under it,
 * or with a tunnel's cover, is left out: darkened, a body seen through it
 * would darken too, and the ground under it twice. So is a lowered
 * switched deck: what is left of it does not cover its footprint, and the
 * ground seen round it is darkened already.
 */
export function deckVignetteTops(
  structure: MapStructure,
): ReadonlyMap<number, readonly (readonly Vec2[])[]> {
  const tops = new Map<number, (readonly Vec2[])[]>();
  for (const deck of structure.decks) {
    if (deckFades(structure, deck)) {
      continue;
    }
    const lift = elevationOf(deck.layer, structure.ground);
    const top = shapeOutline(deck.footprint).map(({ x, y }) => ({ x, y: y - lift }));
    tops.set(deck.layer, [...(tops.get(deck.layer) ?? []), top]);
  }
  return tops;
}

/** One deck layer's vignette: its tops' box, and the cells drawn through their stencil. */
interface DeckPass {
  readonly box: Box;
  readonly cells: Phaser.GameObjects.Graphics;
  readonly objects: readonly (Phaser.GameObjects.Stencil | Phaser.GameObjects.Graphics)[];
}

/** The whole view, centred on the origin, one unit a side: the ground pass, scaled to the view. */
const UNIT_VIEW: Box = { left: -0.5, top: -0.5, right: 0.5, bottom: 0.5 };

/**
 * The vignette over the world and under every gameplay layer (#4057): its
 * cells (`vignetteCells`), drawn once over a unit view and scaled over the
 * view. It follows the camera, so it is placed in world units wherever the
 * camera points. Each deck layer gets the cells again over its tops
 * (#4070), cut to their box and kept to them by a stencil, so ground and
 * decks fall off as one. A deck pass with no cell darkened, its box in the
 * clear centre or out of view, is not drawn at all (#4130).
 */
export class Vignette {
  private readonly scene: Phaser.Scene;
  private readonly ground: Phaser.GameObjects.Graphics;
  private decks: DeckPass[] = [];
  private view: Box | undefined;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ground = scene.add.graphics().setDepth(renderOrder({ kind: "vignette" }));
    fillCells(this.ground, vignetteCells(UNIT_VIEW));
  }

  /** Cover the view centred on `centre`, `size` CSS px at `zoom` CSS px per world unit. */
  public place(centre: Vec2, zoom: number, size: { width: number; height: number }): void {
    const [width, height] = [size.width / zoom, size.height / zoom];
    const view = {
      left: centre.x - width / 2,
      top: centre.y - height / 2,
      right: centre.x + width / 2,
      bottom: centre.y + height / 2,
    };
    if (
      view.left === this.view?.left &&
      view.top === this.view.top &&
      view.right === this.view.right &&
      view.bottom === this.view.bottom
    ) {
      return;
    }
    this.ground.setPosition(centre.x, centre.y).setScale(width, height);
    this.view = view;
    for (const deck of this.decks) {
      this.shade(deck);
    }
  }

  /** Draw the vignette over the view, or not (#4129); its deck tops are `setDecks`'. */
  public setShown(shown: boolean): void {
    this.ground.setVisible(shown);
  }

  /** Darken `tops`, by deck layer, as `deckVignetteTops` gives them; replaces the last ones. */
  public setDecks(tops: ReadonlyMap<number, readonly (readonly Vec2[])[]>): void {
    this.dropDecks();
    const { add, make } = this.scene;
    for (const [layer, polygons] of tops) {
      const box = boxOfPoints(...polygons);
      if (box === undefined) {
        continue;
      }
      const depth = renderOrder({ kind: "deck-vignette", deckLayer: layer });
      // Shut the box, open the tops, draw, and open the box again: the
      // stencil never fills more than the box, as the wall tops' does.
      const region = (value: number, fill: (g: Phaser.GameObjects.Graphics) => void) => {
        const g = make.graphics({}, false);
        g.fillStyle(0xffffff, 1);
        fill(g);
        return add
          .stencil(0, 0, [g], { stencilLayerMode: "clearRegion", stencilClearValue: value })
          .setDepth(depth);
      };
      const rect = (g: Phaser.GameObjects.Graphics) =>
        g.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
      const shut = region(1, rect);
      const open = region(0, (g) => {
        for (const polygon of polygons) {
          g.fillPoints(
            polygon.map(({ x, y }) => new Phaser.Math.Vector2(x, y)),
            true,
          );
        }
      });
      const cells = add.graphics().setDepth(depth);
      const release = region(0, rect);
      const deck = { box, cells, objects: [shut, open, cells, release] };
      this.decks.push(deck);
      this.shade(deck);
    }
  }

  public destroy(): void {
    this.dropDecks();
    this.ground.destroy();
  }

  /** Draw `deck`'s cells for the view as it is now; skip the pass when none is dark. */
  private shade(deck: DeckPass): void {
    const cells = this.view === undefined ? [] : vignetteCells(this.view, deck.box);
    deck.cells.clear();
    fillCells(deck.cells, cells);
    for (const object of deck.objects) {
      object.setVisible(cells.length > 0);
    }
  }

  private dropDecks(): void {
    for (const object of this.decks.flatMap(({ objects }) => objects)) {
      object.destroy();
    }
    this.decks = [];
  }
}

/** `cells` into `g`, black, each shading between its corners. */
function fillCells(g: Phaser.GameObjects.Graphics, cells: readonly VignetteCell[]): void {
  for (const { box, topLeft, topRight, bottomLeft, bottomRight } of cells) {
    g.fillGradientStyle(0, 0, 0, 0, topLeft, topRight, bottomLeft, bottomRight).fillRect(
      box.left,
      box.top,
      box.right - box.left,
      box.bottom - box.top,
    );
  }
}
