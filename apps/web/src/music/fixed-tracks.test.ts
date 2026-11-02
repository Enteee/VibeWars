import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MAP_TRACKS, MENU_TRACK } from "./fixed-tracks.js";
import { TRACKS } from "./tracks/index.js";

const MAPS = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/game-maps",
);

/** Every arena the game ships; the Training Ground plays the menu's song (#2020). */
function mapIds(): string[] {
  return fs
    .readdirSync(path.join(MAPS, "maps"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

describe("fixed tracks (#1993)", () => {
  const shipped = new Set(TRACKS.map((track) => track.id));

  it("gives every map a song of its own row", () => {
    const ids = mapIds();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(MAP_TRACKS.has(id), id).toBe(true);
    }
  });

  it("has a row for no map but an arena", () => {
    const ids = new Set(mapIds());
    for (const mapId of MAP_TRACKS.keys()) {
      expect(ids.has(mapId), mapId).toBe(true);
    }
  });

  it("names only tracks the manifest ships, the menu's too", () => {
    for (const [mapId, trackId] of MAP_TRACKS) {
      expect(shipped.has(trackId), `${mapId}: ${trackId}`).toBe(true);
    }
    expect(shipped.has(MENU_TRACK)).toBe(true);
  });
});
