// Layout study for a 2.5D map rebuild (#3064): the plan of a map.json, by
// layer, with its routes, pits and tunnels, water, zones, lights, levers and
// spawns, 800 px wide. The rebuild cards post one before data is final.
// Usage: [VIBEWARS_CHROMIUM=<chromium>] node scripts/assets/map-study.mjs <map-id> <out.png> [route "x,y x,y ..."]...
import { planSvg, readMap, renderPngs } from "./map-plan-lib.mjs";

const [id, out, ...routes] = process.argv.slice(2);
if (id === undefined || out === undefined) {
  throw new Error("usage: map-study.mjs <map-id> <out.png> [route]...");
}
await renderPngs([{ ...planSvg(readMap(id), { routes }), out }]);
