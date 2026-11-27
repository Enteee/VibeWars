import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";

import type { MapStructure } from "./arena-snapshot.js";
import { type Box, shapeOutline } from "./layer-surfaces.js";
import { deckFades } from "./lighting-pass.js";
import { elevationOf, renderOrder } from "./render-order.js";
import {
  disjointPieces,
  type VignetteCell,
  vignetteCells,
  vignetteTriangles,
} from "./vignette-model.js";

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

/** One deck layer's vignette: its tops as convex pieces that do not overlap, and what they are drawn in. */
interface DeckPass {
  readonly pieces: readonly (readonly Vec2[])[];
  readonly graphics: Phaser.GameObjects.Graphics;
}

/** The whole view, centred on the origin, one unit a side: the ground pass, scaled to the view. */
const UNIT_VIEW: Box = { left: -0.5, top: -0.5, right: 0.5, bottom: 0.5 };

/**
 * The vignette over the world and under every gameplay layer (#4057): its
 * cells (`vignetteCells`), drawn once over a unit view and scaled over the
 * view. It follows the camera, so it is placed in world units wherever the
 * camera points. Each deck layer gets them again over its tops (#4070),
 * cut into pieces that do not overlap (`disjointPieces`) and along the
 * cells (`vignetteTriangles`), so ground and decks fall off as one. No stencil: on a software renderer each pass
 * over a deck's box cost a frame more than its shading (#4130).
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
    for (const [layer, polygons] of tops) {
      const graphics = this.scene.add
        .graphics()
        .setDepth(renderOrder({ kind: "deck-vignette", deckLayer: layer }));
      const deck = { pieces: deckPieces(polygons), graphics };
      this.decks.push(deck);
      this.shade(deck);
    }
  }

  public destroy(): void {
    this.dropDecks();
    this.ground.destroy();
  }

  /** Draw `deck`'s tops shaded for the view as it is now; skip the pass when none is dark. */
  private shade(deck: DeckPass): void {
    const triangles = this.view === undefined ? [] : vignetteTriangles(this.view, deck.pieces);
    deck.graphics.clear();
    for (const [first, second, third] of triangles) {
      deck.graphics
        .fillGradientStyle(0, 0, 0, 0, first.alpha, second.alpha, third.alpha, 0)
        .fillTriangle(first.x, first.y, second.x, second.y, third.x, third.y);
    }
    deck.graphics.setVisible(triangles.length > 0);
  }

  private dropDecks(): void {
    for (const { graphics } of this.decks) {
      graphics.destroy();
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

/** One deck layer's `tops` as convex pieces that do not overlap, each point of them in one. */
export function deckPieces(tops: readonly (readonly Vec2[])[]): (readonly Vec2[])[] {
  return disjointPieces(tops.flatMap(triangulate));
}

/** `polygon` as triangles, Phaser's earcut's. */
function triangulate(polygon: readonly Vec2[]): (readonly [Vec2, Vec2, Vec2])[] {
  const corners = Phaser.Geom.Polygon.Earcut(polygon.flatMap(({ x, y }) => [x, y]));
  const triangles: (readonly [Vec2, Vec2, Vec2])[] = [];
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const [a, b, c] = [corners[i], corners[i + 1], corners[i + 2]].map((index) =>
      index === undefined ? undefined : polygon[index],
    );
    if (a !== undefined && b !== undefined && c !== undefined) {
      triangles.push([a, b, c]);
    }
  }
  return triangles;
}
