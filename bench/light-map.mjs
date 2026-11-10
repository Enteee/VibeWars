import fs from "node:fs";
const cfg = process.argv[2];
const m = JSON.parse(fs.readFileSync("/tmp/lb-map-orig.json", "utf8"));
const L = (id, x, y, layer, radius, flicker) => ({ id, position: { x, y }, layer, radius, colour: 0xffcc88, intensity: 0.8, flicker });
let lights;
if (cfg === "A") {
  const pts = [[400,330,0],[800,330,0],[400,580,0],[800,580,0],[600,460,0],[650,450,1],[760,530,1],[600,220,2]];
  lights = pts.map(([x,y,l],i) => L("a"+i, x, y, l, 150 + (i%3)*50, i%2 ? 0.4 : 0));
} else {
  lights = [];
  // 16 on layer 0 around walls / bridge edges
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lights.push([600 + Math.cos(a) * 220, 455 + Math.sin(a) * 140, 0]);
  }
  // 10 on layer 1 around the box wall and over the bridge
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    lights.push([720 + Math.cos(a) * 70, 490 + Math.sin(a) * 50, 1]);
  }
  // 6 on layer 2 on/around the platform
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    lights.push([600 + Math.cos(a) * 70, 215 + Math.sin(a) * 45, 2]);
  }
  lights = lights.map(([x,y,l],i) => L("b"+i, Math.round(x), Math.round(y), l, 300, i%2 ? 0.4 : 0));
}
m.lighting = {
  ambient: { colour: 0x8090a0, intensity: 0.6 },
  indoorAmbient: { colour: 0x404050, intensity: 0.4 },
  indoor: [],
  sun: { directionDeg: 135, elevationDeg: 25, colour: 0xfff0d0, intensity: 0.7 },
  lights,
};
fs.writeFileSync("packages/game-maps/training/training-heights/map.json", JSON.stringify(m, null, 2) + "\n");
