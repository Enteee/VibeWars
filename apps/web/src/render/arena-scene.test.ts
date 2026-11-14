import { describe, expect, it, vi } from "vitest";

import { ARENA_ATLAS_JSON, ARENA_ATLAS_SVG } from "./arena-atlas.js";

// Phaser probes for a browser when it loads: the scene only needs a base class.
vi.mock("phaser", () => ({ default: { Scene: Object } }));

const { ArenaScene } = await import("./arena-scene.js");

describe("ArenaScene preload (#1671)", () => {
  it("queues the icon sheet and its map, and nothing else, whatever the catalog", () => {
    const queued: string[] = [];
    const load = {
      svg: (_key: string, url: string) => queued.push(url),
      json: (_key: string, url: string) => queued.push(url),
      image: (_key: string, url: string) => queued.push(url),
    };
    ArenaScene.prototype.preload.call(Object.assign(Object.create(ArenaScene.prototype), { load }));
    expect(queued).toEqual([`/${ARENA_ATLAS_SVG}`, `/${ARENA_ATLAS_JSON}`]);
  });
});

describe("ArenaScene shutdown (#3087)", () => {
  it("forgets every lever, so the next match's first sight of one throws nothing", () => {
    const scene = new ArenaScene() as unknown as {
      readonly leverFlips: Map<string, { readonly up: boolean; readonly at: number | undefined }>;
      shutdown(): void;
    };
    scene.leverFlips.set("side-room-lever", { up: false, at: 12 });
    scene.shutdown();
    expect(scene.leverFlips.size).toBe(0);
  });
});

describe("ArenaScene tunnel cutaway (#3272)", () => {
  it("fades the paving over the viewer's tunnel with its cover, and back once they leave", async () => {
    const { mapStructure } = await import("../net/maps.js");
    const { structure } = mapStructure("arena-long-hall");
    const fading = (): { alpha: number; setAlpha(alpha: number): unknown } => ({
      alpha: 1,
      setAlpha(alpha: number) {
        this.alpha = alpha;
        return this;
      },
    });
    const cover = { ground: fading(), seam: fading() };
    const over = fading();
    const elsewhere = fading();
    const self = { team: "self", position: { x: 1620, y: 1450 }, layer: structure.ground - 1 };
    const scene = Object.assign(new ArenaScene(), {
      snapshot: { structure, actors: [self] },
      tunnelCovers: new Map([[0, cover]]),
      pavingDrawn: {
        overTunnels: new Map([
          [0, [over]],
          [1, [elsewhere]],
        ]),
      },
      reducedMotion: true,
    }) as unknown as { cutAwayTunnels(dt: number): void };

    scene.cutAwayTunnels(0.016);
    expect(over.alpha).toBe(cover.ground.alpha);
    expect(over.alpha).toBeLessThan(1);
    expect(elsewhere.alpha).toBe(1);

    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    expect(over.alpha).toBe(1);
  });
});
