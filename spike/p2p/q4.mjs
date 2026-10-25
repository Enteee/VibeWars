import { chromium } from "playwright-core";
const durationMs = Number(process.argv[2] ?? 120000);
const browser = await chromium.launch({ executablePath: process.env.VIBEWARS_CHROMIUM });
const roomId = `spike-q4-${Date.now()}`;
const pages = [];
for (let p = 0; p < 4; p++) {
  const page = await (await browser.newContext()).newPage();
  await page.goto("http://127.0.0.1:26431/index.html");
  await page.waitForSelector("body[data-ready]", { state: "attached" });
  pages.push(page);
}
const ids = [];
for (const page of pages) ids.push(await page.evaluate((r) => window.spike.joinTrystero({ appId: "vibewars-spike-16", roomId: r, password: "pw" }), roomId));
const [host, ...peers] = pages;
const t0 = Date.now();
while ((await host.evaluate(() => window.spike.peers().length)) < 3) {
  if (Date.now() - t0 > 60000) throw new Error("host never saw 3 peers");
  await new Promise((r) => setTimeout(r, 200));
}
console.log("host saw 3 peers after", Date.now() - t0, "ms");
const pings = [];
const pinger = setInterval(async () => {
  for (const id of ids.slice(1)) { const ms = await host.evaluate((p) => window.spike.ping(p), id).catch(() => null); if (ms != null) pings.push(ms); }
}, 5000);
const sent = await host.evaluate(([ms]) => window.spike.stream(20, 2048, ms), [durationMs]);
await new Promise((r) => setTimeout(r, 2000));
clearInterval(pinger);
console.log("sent", sent, "snapshots of 2 KB");
for (const [i, peer] of peers.entries()) console.log("peer", i + 1, JSON.stringify(await peer.evaluate(() => window.spike.recvStats())));
pings.sort((a, b) => a - b);
console.log("ping RTT ms: n", pings.length, "p50", pings[Math.floor(pings.length / 2)]?.toFixed(1), "max", pings.at(-1)?.toFixed(1));
// Host leave: how fast do peers see it?
const leaveAt = await host.evaluate(async () => { const t = window.spike.now(); await window.spike.leave(); return t; });
await new Promise((r) => setTimeout(r, 15000));
for (const [i, peer] of peers.entries()) {
  const l = await peer.evaluate(() => window.spike.leaves());
  const h = l.find((x) => x.id === ids[0]);
  console.log("peer", i + 1, "saw host leave after", h ? (h.at - leaveAt).toFixed(0) + " ms" : "NOT within 15 s");
}
await browser.close();
