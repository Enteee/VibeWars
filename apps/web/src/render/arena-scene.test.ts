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
    const cover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
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
    // Its grain and grid go with it (#3484).
    expect(cover.grain[0]?.alpha).toBe(cover.ground.alpha);
    expect(cover.lines.alpha).toBe(cover.ground.alpha);

    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    expect(over.alpha).toBe(1);
  });

  it("fades the water over the viewer's tunnel with its cover, and no other water (#3350)", async () => {
    const { mapStructure } = await import("../net/maps.js");
    const { structure } = mapStructure("arena-long-hall");
    const fading = (): { alpha: number; setAlpha(alpha: number): unknown } => ({
      alpha: 1,
      setAlpha(alpha: number) {
        this.alpha = alpha;
        return this;
      },
    });
    const cover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const otherCover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const over = { surface: fading(), ripples: fading() };
    const overOther = { surface: fading(), ripples: fading() };
    const outside = fading();
    const self = { team: "self", position: { x: 1620, y: 1450 }, layer: structure.ground - 1 };
    const scene = Object.assign(new ArenaScene(), {
      snapshot: { structure, actors: [self] },
      tunnelCovers: new Map([
        [0, cover],
        [1, otherCover],
      ]),
      waterOverTunnels: new Map([
        [0, over],
        [1, overOther],
      ]),
      structureGraphics: new Map([["water", outside]]),
      reducedMotion: true,
    }) as unknown as { cutAwayTunnels(dt: number): void };

    scene.cutAwayTunnels(0.016);
    expect(cover.ground.alpha).toBeLessThan(1);
    expect(over.surface.alpha).toBe(cover.ground.alpha);
    expect(over.ripples.alpha).toBe(cover.ground.alpha);
    expect(overOther.surface.alpha).toBe(1);
    expect(overOther.ripples.alpha).toBe(1);
    expect(outside.alpha).toBe(1);

    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    expect(over.surface.alpha).toBe(1);
  });

  it("fades the decks over the viewer's tunnel with its cover, and no other deck (#3352)", async () => {
    const { mapStructure } = await import("../net/maps.js");
    const { structure } = mapStructure("arena-long-hall");
    const fading = (): { alpha: number; setAlpha(alpha: number): unknown } => ({
      alpha: 1,
      setAlpha(alpha: number) {
        this.alpha = alpha;
        return this;
      },
    });
    const cover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const otherCover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const [top, side] = [fading(), fading()];
    const overOther = fading();
    const solid = fading();
    const self = { team: "self", position: { x: 1620, y: 1450 }, layer: structure.ground - 1 };
    const scene = Object.assign(new ArenaScene(), {
      snapshot: { structure, actors: [self] },
      tunnelCovers: new Map([
        [0, cover],
        [1, otherCover],
      ]),
      decksOverTunnels: new Map([
        [0, [top, side]],
        [1, [overOther]],
      ]),
      structureGraphics: new Map([["deck", solid]]),
      reducedMotion: true,
    }) as unknown as { cutAwayTunnels(dt: number): void };

    scene.cutAwayTunnels(0.016);
    expect(cover.ground.alpha).toBeLessThan(1);
    expect(top.alpha).toBe(cover.ground.alpha);
    expect(side.alpha).toBe(cover.ground.alpha);
    expect(overOther.alpha).toBe(1);
    expect(solid.alpha).toBe(1);

    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    expect(top.alpha).toBe(1);
    expect(side.alpha).toBe(1);
  });

  it("fades a wall and a breakable over the viewer's tunnel with its cover, and nothing else (#3418)", async () => {
    const { mapStructure } = await import("../net/maps.js");
    const { structure } = mapStructure("arena-long-hall");
    const fading = (): { alpha: number; setAlpha(alpha: number): unknown } => ({
      alpha: 1,
      setAlpha(alpha: number) {
        this.alpha = alpha;
        return this;
      },
    });
    const cover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const [wallOver, tunnelWall] = [fading(), fading()];
    const [iceOver, iceElsewhere] = [fading(), fading()];
    const style = (tunnels: readonly number[]) => ({ tunnels });
    const self = { team: "self", position: { x: 1620, y: 1450 }, layer: structure.ground - 1 };
    const scene = Object.assign(new ArenaScene(), {
      snapshot: { structure, actors: [self] },
      tunnelCovers: new Map([[0, cover]]),
      decksOverTunnels: new Map([[0, [wallOver]]]),
      structureGraphics: new Map([["wall", tunnelWall]]),
      breakableDrawings: new Map([
        ["ice-wall", { graphics: iceOver }],
        ["far-wall", { graphics: iceElsewhere }],
      ]),
      breakableStyle: {
        walls: new Map([
          ["ice-wall", style([0])],
          ["far-wall", style([])],
        ]),
      },
      reducedMotion: true,
    }) as unknown as { cutAwayTunnels(dt: number): void };

    scene.cutAwayTunnels(0.016);
    expect(cover.ground.alpha).toBeLessThan(1);
    expect(wallOver.alpha).toBe(cover.ground.alpha);
    expect(iceOver.alpha).toBe(cover.ground.alpha);
    expect(tunnelWall.alpha).toBe(1);
    expect(iceElsewhere.alpha).toBe(1);

    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    expect(wallOver.alpha).toBe(1);
    expect(iceOver.alpha).toBe(1);
  });

  it("gives a walked-under top over the viewer's tunnel the lower of its two fades (#3352)", async () => {
    const { mapStructure } = await import("../net/maps.js");
    const { OVERHANG_FADED_ALPHA } = await import("./overhang-art.js");
    const { structure } = mapStructure("arena-long-hall");
    const fading = (): { alpha: number; setAlpha(alpha: number): unknown } => ({
      alpha: 1,
      setAlpha(alpha: number) {
        this.alpha = alpha;
        return this;
      },
    });
    const cover = { ground: fading(), seam: fading(), lines: fading(), grain: [fading()] };
    const arch = fading();
    const self = {
      id: "me",
      team: "self",
      position: { x: 1620, y: 1450 },
      layer: structure.ground - 1,
    };
    const scene = Object.assign(new ArenaScene(), {
      snapshot: { structure, actors: [self] },
      tunnelCovers: new Map([[0, cover]]),
      coversDrawn: [
        {
          cover: {
            layer: structure.ground + 1,
            outline: [
              { x: 1570, y: 1400 },
              { x: 1670, y: 1400 },
              { x: 1670, y: 1500 },
              { x: 1570, y: 1500 },
            ],
            top: 40,
          },
          graphics: arch,
          tunnel: 0,
          overhang: 1,
        },
      ],
      drawnActors: [self],
      reducedMotion: true,
    }) as unknown as {
      cutAwayTunnels(dt: number): void;
      fadeOverhangs(dt: number): void;
    };

    // In the tunnel, under the arch: the cut-away is the lower.
    scene.cutAwayTunnels(0.016);
    scene.fadeOverhangs(0.016);
    expect(cover.ground.alpha).toBeLessThan(OVERHANG_FADED_ALPHA);
    expect(arch.alpha).toBe(cover.ground.alpha);

    // Out of the tunnel, still under the arch: the overhang's fade is.
    self.layer = structure.ground;
    scene.cutAwayTunnels(0.016);
    scene.fadeOverhangs(0.016);
    expect(arch.alpha).toBe(OVERHANG_FADED_ALPHA);

    self.position = { x: 2400, y: 600 };
    scene.cutAwayTunnels(0.016);
    scene.fadeOverhangs(0.016);
    expect(arch.alpha).toBe(1);
  });
});
