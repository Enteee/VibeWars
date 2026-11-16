import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateMapData, type MapData } from "./schema.js";

/** The training arenas (#2985) or the tutorial's maps (#3245), which `loadAllMaps` does not see. */
export function mapsIn(dir: "training" | "tutorial"): MapData[] {
  const root = fileURLToPath(new URL(`../${dir}/`, import.meta.url));
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) =>
      validateMapData(JSON.parse(readFileSync(join(root, entry.name, "map.json"), "utf8"))),
    );
}
