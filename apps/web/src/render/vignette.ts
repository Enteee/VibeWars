import Phaser from "phaser";

import type { Vec2 } from "@vibewars/game-core";

import type { MapStructure } from "./arena-snapshot.js";
import { type Box, shapeOutline } from "./layer-surfaces.js";
import { deckFades } from "./lighting-pass.js";
import { elevationOf, renderOrder } from "./render-order.js";
import { boxOfPoints } from "./wall-tops.js";

/**
 * The gothic look's vignette (#4057): the view darkens towards its
 * corners, as in the mock (`docs/art/spikes/3977-sprite-stacking`).
 * `alpha` is the darkening at a corner; `clear` is how far from the centre,
 * as a share of the way to a corner, nothing darkens: the centre third.
 */
export const VIGNETTE = { alpha: 0.6, clear: 1 / 3 } as const;

const TEXTURE = "vignette";
/** The texture's side in pixels: the ramp is smooth, so stretched it shows no steps. */
const TEXTURE_SIZE = 128;
/** Enough stops that the smooth ramp shows no bands. */
const GRADIENT_STOPS = 24;

/**
 * How dark the vignette is at `(x, y)` of a view `width` by `height`: 0 in
 * the centre third, rising smoothly to `VIGNETTE.alpha` at the corners.
 * The view's sides are scaled to one, so a wide view's vignette is as wide.
 */
export function vignetteAlpha(x: number, y: number, width: number, height: number): number {
  const across = (2 * x) / width - 1;
  const down = (2 * y) / height - 1;
  return alphaOut(Math.hypot(across, down) / Math.SQRT2);
}

/** How dark the vignette is `out` of the way from the centre to a corner, 0 to 1. */
function alphaOut(out: number): number {
  const ramp = Math.min(1, Math.max(0, (out - VIGNETTE.clear) / (1 - VIGNETTE.clear)));
  return VIGNETTE.alpha * ramp * ramp * (3 - 2 * ramp);
}

/**
 * The deck tops the vignette darkens (#4070), by deck layer, as drawn:
 * lifted by their layer's height. A deck that fades off a body under it,
 * or with a tunnel's cover, is left out: darkened, a body seen through it
 * would darken too, and the ground under it twice.
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

/** A rectangle of the vignette's texture, in its pixels. */
export interface TextureCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The part of the texture stretched over `view` that falls on `box`, both
 * in world units, so a deck pass shades each point as the full view does;
 * undefined when the box is out of view.
 */
export function deckCrop(box: Box, view: Box): TextureCrop | undefined {
  const left = Math.max(box.left, view.left);
  const right = Math.min(box.right, view.right);
  const top = Math.max(box.top, view.top);
  const bottom = Math.min(box.bottom, view.bottom);
  if (left >= right || top >= bottom) {
    return undefined;
  }
  const across = TEXTURE_SIZE / (view.right - view.left);
  const down = TEXTURE_SIZE / (view.bottom - view.top);
  return {
    x: (left - view.left) * across,
    y: (top - view.top) * down,
    width: (right - left) * across,
    height: (bottom - top) * down,
  };
}

/** One deck layer's vignette: its tops' box, and the image drawn through their stencil. */
interface DeckPass {
  readonly box: Box;
  readonly image: Phaser.GameObjects.Image;
  readonly objects: readonly Phaser.GameObjects.GameObject[];
}

/**
 * The vignette over the world and under every gameplay layer (#4057): one
 * texture, painted once, stretched over the view. It follows the camera,
 * so it is placed in world units wherever the camera points. Each deck
 * layer gets the same texture again over its tops (#4070), kept to them by
 * a stencil and cropped to their box, so ground and decks fall off as one.
 */
export class Vignette {
  private readonly scene: Phaser.Scene;
  private readonly image: Phaser.GameObjects.Image;
  private decks: DeckPass[] = [];
  private view: Box | undefined;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    paintTexture(scene.textures);
    this.image = scene.add
      .image(0, 0, TEXTURE)
      .setOrigin(0.5)
      .setDepth(renderOrder({ kind: "vignette" }));
  }

  /** Cover the view centred on `centre`, `size` CSS px at `zoom` CSS px per world unit. */
  public place(centre: Vec2, zoom: number, size: { width: number; height: number }): void {
    const [width, height] = [size.width / zoom, size.height / zoom];
    this.image.setPosition(centre.x, centre.y).setDisplaySize(width, height);
    this.view = {
      left: centre.x - width / 2,
      top: centre.y - height / 2,
      right: centre.x + width / 2,
      bottom: centre.y + height / 2,
    };
    for (const deck of this.decks) {
      this.crop(deck);
    }
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
      const image = add.image(0, 0, TEXTURE).setOrigin(0.5).setDepth(depth);
      const release = region(0, rect);
      const deck = { box, image, objects: [shut, open, image, release] };
      this.decks.push(deck);
      this.crop(deck);
    }
  }

  public destroy(): void {
    this.dropDecks();
    this.image.destroy();
  }

  /** Lay `deck`'s image over the view as the full one is, showing only its box. */
  private crop(deck: DeckPass): void {
    const crop = this.view === undefined ? undefined : deckCrop(deck.box, this.view);
    deck.image.setVisible(crop !== undefined);
    if (crop !== undefined) {
      deck.image
        .setPosition(this.image.x, this.image.y)
        .setDisplaySize(this.image.displayWidth, this.image.displayHeight)
        .setCrop(crop.x, crop.y, crop.width, crop.height);
    }
  }

  private dropDecks(): void {
    for (const object of this.decks.flatMap(({ objects }) => objects)) {
      object.destroy();
    }
    this.decks = [];
  }
}

function paintTexture(textures: Phaser.Textures.TextureManager): void {
  if (textures.exists(TEXTURE)) {
    return;
  }
  const canvas = textures.createCanvas(TEXTURE, TEXTURE_SIZE, TEXTURE_SIZE);
  if (canvas === null) {
    throw new Error("vignette: could not create its texture");
  }
  // A circle to the corners of a square: stretched over the view, the ramp `vignetteAlpha` draws.
  const middle = TEXTURE_SIZE / 2;
  const gradient = canvas.context.createRadialGradient(
    middle,
    middle,
    0,
    middle,
    middle,
    middle * Math.SQRT2,
  );
  for (let stop = 0; stop <= GRADIENT_STOPS; stop += 1) {
    const out = stop / GRADIENT_STOPS;
    gradient.addColorStop(out, `rgba(0,0,0,${String(alphaOut(out))})`);
  }
  canvas.context.fillStyle = gradient;
  canvas.context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  canvas.refresh();
}
