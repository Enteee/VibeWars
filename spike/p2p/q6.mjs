import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: process.env.VIBEWARS_CHROMIUM });
async function run(sameContext) {
  const c1 = await browser.newContext();
  const c2 = sameContext ? c1 : await browser.newContext();
  const pages = [await c1.newPage(), await c2.newPage()];
  for (const p of pages) { await p.goto("http://127.0.0.1:26431/index.html"); await p.waitForSelector("body[data-ready]", { state: "attached" }); }
  const ids = [];
  for (const p of pages) ids.push(await p.evaluate(() => window.spike.joinBroadcast("room-1")));
  await new Promise((r) => setTimeout(r, 300));
  const joins = await Promise.all(pages.map((p) => p.evaluate(() => window.spike.peers().map((x) => x.id))));
  const sent = await pages[0].evaluate(() => window.spike.stream(20, 2048, 3000));
  // a directed message
  await pages[1].evaluate((to) => window.spike.send("snap", { seq: 0, sent: window.spike.now() }, to), ids[0]);
  await new Promise((r) => setTimeout(r, 300));
  const stats = await pages[1].evaluate(() => window.spike.recvStats());
  const back = await pages[0].evaluate(() => window.spike.recvStats());
  await pages[1].close();
  await new Promise((r) => setTimeout(r, 300));
  const leaves = await pages[0].evaluate(() => window.spike.leaves().map((x) => x.id));
  console.log(sameContext ? "same context:" : "two contexts:", JSON.stringify({ joins, sent, stats, back, leaveOnClose: leaves }));
  await c1.close(); if (!sameContext) await c2.close();
}
await run(true);
await run(false);
await browser.close();
