import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

import { CREATURE_LOOKS, PROFESSIONS, type ProfessionId } from "@vibewars/game-core";

import {
  ARENA_ATLAS_JSON,
  ARENA_ATLAS_SVG,
  BODY_GLYPH_TEXTURE_SIZE,
  CAST_BADGE_TEXTURE_SIZE,
  CREATURE_GLYPH,
  GROUND_EFFECT_SKILLS,
  GROUND_ICON_TEXTURE_SIZE,
  PROFESSION_GLYPH_SIZE,
  PROJECTILE_HEIGHT,
  PROJECTILE_WIDTH,
  STATUS_ICON_SIZE,
  bodyProfessionFrame,
  creatureFrame,
  groundFrame,
  professionFrame,
  projectileFrame,
  skillTypeFrame,
  statusFrame,
  type AtlasFrame,
  type AtlasMap,
} from "../src/render/arena-atlas.js";
import { PROJECTILE_SPRITES } from "../src/render/projectiles.js";

/**
 * The arena's icon sheet (#1671): every icon the scene draws, each a nested
 * `<svg>` at its texture size, packed in rows with a 1 px gap, plus the frame
 * map the scene cuts it with. Composed at build and dev-server time from the
 * committed `public/icons/<family>/*.svg`, never committed itself, so two
 * PRs that each add a status never conflict on it. Sizes, frame names and
 * the ground skills come from `src/render/arena-atlas.ts`, as the scene's do.
 */

/** One icon to pack: its frame name, its SVG file's text and its texture size. */
export interface AtlasIcon {
  readonly frame: string;
  readonly svg: string;
  readonly w: number;
  readonly h: number;
}

/** A packed sheet and the frame map that cuts it. */
export interface ArenaAtlas {
  readonly sheet: string;
  readonly map: AtlasMap;
}

const ATLAS_WIDTH = 512;
const ATLAS_GAP = 1;

/** Packs `icons` into one SVG sheet, tallest first so each row wastes little under its shorter icons. */
export function packAtlas(icons: readonly AtlasIcon[]): ArenaAtlas {
  const sorted = [...icons].sort((a, b) => b.h - a.h || b.w - a.w);
  const frames: Record<string, AtlasFrame> = {};
  let body = "";
  let height = 0;
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const { frame, svg, w, h } of sorted) {
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += rowHeight + ATLAS_GAP;
      rowHeight = 0;
    }
    const icon = svg.trimEnd();
    const open = /^<svg ([^>]*)>/.exec(icon);
    const viewBox = open && /viewBox="([^"]+)"/.exec(open[1] ?? "");
    if (!open || !viewBox?.[1] || !icon.endsWith("</svg>")) {
      throw new Error(`${frame}: not a single root <svg> with a viewBox`);
    }
    const inner = icon.slice(open[0].length, -"</svg>".length);
    body += `<svg x="${String(x)}" y="${String(y)}" width="${String(w)}" height="${String(h)}" viewBox="${viewBox[1]}">${inner}</svg>`;
    frames[frame] = { x, y, w, h };
    x += w + ATLAS_GAP;
    rowHeight = Math.max(rowHeight, h);
    height = Math.max(height, y + h);
  }
  return {
    sheet: `<svg xmlns="http://www.w3.org/2000/svg" width="${String(ATLAS_WIDTH)}" height="${String(height)}">${body}</svg>\n`,
    map: { frames },
  };
}

/** Every icon the arena draws, read from `publicDir`'s icon families. */
export function arenaAtlasIcons(publicDir: string): AtlasIcon[] {
  const icons = path.join(publicDir, "icons");
  const read = (family: string, name: string): string =>
    readFileSync(path.join(icons, family, `${name}.svg`), "utf8");
  const names = (family: string): string[] =>
    readdirSync(path.join(icons, family))
      .filter((file) => file.endsWith(".svg"))
      .map((file) => file.slice(0, -".svg".length))
      .sort();
  const skills = new Set(names("skill"));
  return [
    ...names("status").map((id) => ({
      frame: statusFrame(id),
      svg: read("status", id),
      w: STATUS_ICON_SIZE,
      h: STATUS_ICON_SIZE,
    })),
    ...(Object.keys(PROFESSIONS) as ProfessionId[]).flatMap((id) => [
      {
        frame: professionFrame(id),
        svg: read("profession", id),
        w: PROFESSION_GLYPH_SIZE,
        h: PROFESSION_GLYPH_SIZE,
      },
      {
        frame: bodyProfessionFrame(id),
        svg: read("profession", id),
        w: BODY_GLYPH_TEXTURE_SIZE,
        h: BODY_GLYPH_TEXTURE_SIZE,
      },
    ]),
    ...CREATURE_LOOKS.map((look) => ({
      frame: creatureFrame(look),
      svg: read(CREATURE_GLYPH[look].family, CREATURE_GLYPH[look].name),
      w: BODY_GLYPH_TEXTURE_SIZE,
      h: BODY_GLYPH_TEXTURE_SIZE,
    })),
    ...names("skill-type").map((type) => ({
      frame: skillTypeFrame(type),
      svg: read("skill-type", type),
      w: CAST_BADGE_TEXTURE_SIZE,
      h: CAST_BADGE_TEXTURE_SIZE,
    })),
    ...PROJECTILE_SPRITES.map((sprite) => ({
      frame: projectileFrame(sprite),
      svg: read("projectile", sprite),
      w: PROJECTILE_WIDTH,
      h: PROJECTILE_HEIGHT,
    })),
    ...GROUND_EFFECT_SKILLS.map((id) => ({
      frame: groundFrame(id),
      svg: read("skill", skills.has(id) ? id : "unknown"),
      w: GROUND_ICON_TEXTURE_SIZE,
      h: GROUND_ICON_TEXTURE_SIZE,
    })),
  ];
}

/** The sheet and map over `publicDir` as they are on disk now. */
export function composeArenaAtlas(publicDir: string): ArenaAtlas {
  return packAtlas(arenaAtlasIcons(publicDir));
}

function mapFile(atlas: ArenaAtlas): string {
  return `${JSON.stringify(atlas.map, null, 2)}\n`;
}

/**
 * Serves the sheet at `icons/atlas/` in dev, recomposed when an icon
 * changes, and emits it there in a build.
 */
export function arenaAtlasPlugin(): Plugin {
  let publicDir = "";
  return {
    name: "vibewars-arena-atlas",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    configureServer(server) {
      let atlas: ArenaAtlas | undefined;
      const icons = path.join(publicDir, "icons") + path.sep;
      const forget = (file: string): void => {
        if (file.startsWith(icons)) {
          atlas = undefined;
        }
      };
      server.watcher.on("add", forget).on("change", forget).on("unlink", forget);
      const sheetUrl = `${server.config.base}${ARENA_ATLAS_SVG}`;
      const mapUrl = `${server.config.base}${ARENA_ATLAS_JSON}`;
      server.middlewares.use((request, response, next) => {
        const url = request.url?.split("?")[0];
        if (url !== sheetUrl && url !== mapUrl) {
          next();
          return;
        }
        atlas ??= composeArenaAtlas(publicDir);
        response.setHeader("Content-Type", url === sheetUrl ? "image/svg+xml" : "application/json");
        response.setHeader("Cache-Control", "no-cache");
        response.end(url === sheetUrl ? atlas.sheet : mapFile(atlas));
      });
    },
    generateBundle() {
      const atlas = composeArenaAtlas(publicDir);
      this.emitFile({ type: "asset", fileName: ARENA_ATLAS_SVG, source: atlas.sheet });
      this.emitFile({ type: "asset", fileName: ARENA_ATLAS_JSON, source: mapFile(atlas) });
    },
  };
}
