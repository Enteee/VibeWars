/**
 * Static map art baked into cached chunk images (#3522, ADR-0054): the
 * drawing side of `baked-bands.ts`. The bake draws the very display
 * objects the map was drawn into, so baked and live are the same art,
 * then hides them while the chunks show.
 */

import * as Phaser from "phaser";

import {
  BAKES_PER_FRAME,
  type BakeEntry,
  type BakeRun,
  type Box,
  CHUNK_CAPACITY,
  CHUNK_PIXELS,
  type Chunk,
  ChunkLru,
  bakesDue,
  chunkBox,
  chunkKey,
  chunkSize,
  liveDepths,
  overlaps,
  planRuns,
  wantedChunks,
} from "./baked-bands.js";
import type { StaticGraphicsCull } from "./graphics-cull.js";

/** `?nobake`: draw the map live, as before #3522, to measure and compare against. */
export function bakingBands(search: string): boolean {
  return !new URLSearchParams(search).has("nobake");
}

type Member = Phaser.GameObjects.GameObject &
  Phaser.GameObjects.Components.Depth &
  Phaser.GameObjects.Components.Visible;

/** A run of static objects, and its baked chunks. */
interface Run {
  readonly index: number;
  readonly members: readonly Member[];
  /** Where the run draws: its chunk images go just under its first member. */
  readonly anchor: Member;
  readonly depth: number;
  readonly lastDepth: number;
  /** What its members cover; `undefined` for anywhere. */
  readonly covers: readonly Box[] | undefined;
  baked: boolean;
}

interface Baked {
  readonly run: Run;
  readonly image: Phaser.GameObjects.Image;
  readonly texture: Phaser.Textures.DynamicTexture;
}

let bakedTextures = 0;

/** Whether a scene object is drawn in depth order, with a visibility of its own. */
function isMember(object: Phaser.GameObjects.GameObject): object is Member {
  return "depth" in object && "visible" in object && "setVisible" in object;
}

export class BandBake {
  /** The objects drawn once a map, as `plan` was given them. */
  private statics: ReadonlySet<Member> = new Set();
  /** Those of them in a run. */
  private members: ReadonlySet<Member> = new Set();
  /** The chunks' images, which `moved` does not count. */
  private readonly images = new Set<Phaser.GameObjects.GameObject>();
  private runs: Run[] = [];
  private zoom = 1;
  private layerCount = 1;
  /** Live objects as the plan saw them, by their depth then. */
  private readonly seen = new Map<Phaser.GameObjects.GameObject, number>();
  private readonly chunks = new ChunkLru<Baked>(CHUNK_CAPACITY);
  private planned = false;

  private readonly scene: Phaser.Scene;
  private readonly cull: StaticGraphicsCull;

  public constructor(scene: Phaser.Scene, cull: StaticGraphicsCull) {
    this.scene = scene;
    this.cull = cull;
    scene.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
  }

  /**
   * The map was drawn again: drop every chunk, and plan from `members`,
   * the objects drawn once and shown unchanged until the next redraw.
   */
  public plan(
    members: Iterable<Phaser.GameObjects.GameObject>,
    layerCount: number,
    zoom: number,
  ): void {
    this.drop();
    this.statics = new Set([...members].filter(isMember));
    this.layerCount = layerCount;
    this.zoom = zoom;
    this.planned = false;
  }

  /** Bake what `view` wants, and show each run baked or live. */
  public update(view: Box): void {
    if (!this.planned || this.moved()) {
      this.replan();
    }
    const size = chunkSize(this.zoom);
    const { shown, margin } = wantedChunks(view, size);
    let room = CHUNK_CAPACITY;
    const shownWanted: { run: Run; chunk: Chunk }[] = [];
    const marginWanted: { run: Run; chunk: Chunk }[] = [];
    const kept: Run[] = [];
    for (const run of this.runs) {
      const needs = shown.filter((chunk) => this.covers(run, chunkBox(chunk, size)));
      // A run whose shown chunks do not fit stays live, rather than thrash.
      if (needs.length > room) {
        run.baked = false;
        continue;
      }
      room -= needs.length;
      kept.push(run);
      shownWanted.push(...needs.map((chunk) => ({ run, chunk })));
    }
    for (const chunk of margin) {
      for (const run of kept) {
        if (this.covers(run, chunkBox(chunk, size))) {
          marginWanted.push({ run, chunk });
        }
      }
    }
    const keyOf = ({ run, chunk }: { run: Run; chunk: Chunk }): string =>
      `${String(run.index)}:${chunkKey(chunk)}`;
    for (const wanted of bakesDue(
      [...shownWanted, ...marginWanted.slice(0, Math.max(room, 0))],
      (wanted) => this.chunks.has(keyOf(wanted)),
      BAKES_PER_FRAME,
    )) {
      const baked = this.bake(wanted.run, chunkBox(wanted.chunk, size));
      for (const out of this.chunks.admit(keyOf(wanted), baked)) {
        this.destroy(out);
      }
    }
    // Shown last, so the margin is the first out.
    for (const wanted of shownWanted) {
      this.chunks.touch(keyOf(wanted));
    }
    const ready = new Set(this.runs);
    for (const wanted of shownWanted) {
      if (!this.chunks.has(keyOf(wanted))) {
        ready.delete(wanted.run);
      }
    }
    for (const run of this.runs) {
      run.baked = kept.includes(run) && ready.has(run);
      for (const member of run.members) {
        member.setVisible(!run.baked);
      }
    }
    for (const baked of this.chunks.values()) {
      baked.image.setVisible(baked.run.baked);
    }
  }

  public destroy(baked?: Baked): void {
    if (baked !== undefined) {
      this.images.delete(baked.image);
      baked.image.destroy();
      baked.texture.destroy();
      return;
    }
    this.drop();
    this.scene.renderer.off(Phaser.Renderer.Events.RESTORE_WEBGL, this.onRestore, this);
  }

  /** A lost context lost every chunk: bake them again from the live objects. */
  private onRestore(): void {
    this.drop();
    this.planned = false;
  }

  /** Every chunk dropped, every member shown live again. */
  private drop(): void {
    for (const baked of this.chunks.drain()) {
      this.destroy(baked);
    }
    for (const run of this.runs) {
      for (const member of run.members) {
        member.setVisible(true);
      }
    }
    this.runs = [];
    this.seen.clear();
  }

  /** Whether something live came, or moved, into a run's depths since the plan. */
  private moved(): boolean {
    for (const object of this.scene.children.list) {
      if (
        isMember(object) &&
        !this.members.has(object) &&
        !this.images.has(object) &&
        this.seen.get(object) !== object.depth
      ) {
        const { depth } = object;
        if (this.runs.some((run) => depth >= run.depth && depth <= run.lastDepth)) {
          return true;
        }
      }
    }
    return false;
  }

  private replan(): void {
    this.drop();
    this.planned = true;
    const children = this.scene.children;
    children.queueDepthSort();
    children.depthSort();
    const list = children.list.filter(isMember);
    const entries: BakeEntry[] = list.map((object) => ({
      depth: object.depth,
      bakeable: this.statics.has(object) && object.visible,
      ...(object instanceof Phaser.GameObjects.Stencil
        ? { stencil: object.stencilLayerMode === "clear" ? "clear" : "write" }
        : {}),
    }));
    const runs = planRuns(entries, liveDepths(this.layerCount));
    this.runs = runs.flatMap((run, index) => this.runOf(run, index, list));
    const inRuns = new Set(this.runs.flatMap((run) => run.members));
    for (const object of list) {
      if (!inRuns.has(object)) {
        this.seen.set(object, object.depth);
      }
    }
    this.members = inRuns;
  }

  private runOf({ first, last }: BakeRun, index: number, list: readonly Member[]): Run[] {
    const members = list.slice(first, last + 1);
    const anchor = members[0];
    const end = members[members.length - 1];
    if (anchor === undefined || end === undefined) {
      return [];
    }
    const covers: Box[] = [];
    let anywhere = false;
    for (const member of members) {
      const boxes = this.coverOf(member);
      if (boxes === undefined) {
        anywhere = true;
      } else {
        covers.push(...boxes);
      }
    }
    return [
      {
        index,
        members,
        anchor,
        depth: anchor.depth,
        lastDepth: end.depth,
        covers: anywhere ? undefined : covers,
        baked: false,
      },
    ];
  }

  /** What `member` draws over, in world units; `undefined` when that is not known. */
  private coverOf(member: Member): readonly Box[] | undefined {
    if (member instanceof Phaser.GameObjects.Graphics) {
      return this.cull.covers(member);
    }
    if (
      member instanceof Phaser.GameObjects.Image ||
      member instanceof Phaser.GameObjects.TileSprite
    ) {
      const { left, top, right, bottom } = member.getBounds();
      return [{ left, top, right, bottom }];
    }
    return undefined;
  }

  private covers(run: Run, box: Box): boolean {
    return run.covers === undefined || run.covers.some((cover) => overlaps(cover, box));
  }

  /** `run` drawn into a texture of the chunk at `box`, shown as an image there. */
  private bake(run: Run, box: Box): Baked {
    const key = `band-bake-${String(bakedTextures)}`;
    bakedTextures += 1;
    const texture = this.scene.textures.addDynamicTexture(key, CHUNK_PIXELS, CHUNK_PIXELS);
    if (texture === null) {
      throw new Error("band bake: could not create a chunk's texture");
    }
    texture.camera.setOrigin(0, 0).setZoom(this.zoom).setScroll(box.left, box.top);
    // Only what reaches the chunk is drawn into it; the cut comes back after.
    const restore = this.cull.cutTo(
      run.members.filter((member) => member instanceof Phaser.GameObjects.Graphics),
      box,
    );
    texture.draw([...run.members]);
    texture.render();
    restore();
    const image = this.scene.add
      .image(box.left, box.top, key)
      .setOrigin(0, 0)
      .setScale(1 / this.zoom)
      .setDepth(run.depth)
      .setVisible(false);
    this.scene.children.moveBelow(image, run.anchor);
    this.images.add(image);
    return { run, image, texture };
  }
}
