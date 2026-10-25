import { chromium } from "playwright-core";
const tries = Number(process.argv[2] ?? 10);
const browser = await chromium.launch({ executablePath: process.env.VIBEWARS_CHROMIUM });
const results = [];
for (let i = 0; i < tries; i++) {
  const roomId = `spike-${Date.now()}-${i}`;
  const pages = [];
  for (let p = 0; p < 2; p++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") console.log(`  [${p}] ${m.text().slice(0, 160)}`); });
    await page.goto("http://127.0.0.1:26431/index.html");
    await page.waitForSelector("body[data-ready]", { state: "attached" });
    pages.push(page);
  }
  for (const page of pages) await page.evaluate((r) => window.spike.joinTrystero({ appId: "vibewars-spike-16", roomId: r, password: "code-" + r }), roomId);
  const t0 = Date.now();
  let ms = null;
  while (Date.now() - t0 < 30000) {
    const seen = await Promise.all(pages.map((p) => p.evaluate(() => window.spike.peers())));
    if (seen.every((s) => s.length > 0)) { ms = Math.max(...seen.map((s) => s[0].ms)); break; }
    await new Promise((r) => setTimeout(r, 100));
  }
  results.push(ms);
  console.log(`try ${i + 1}: ${ms === null ? "FAILED (30 s)" : ms.toFixed(0) + " ms"}`);
  for (const page of pages) { await page.evaluate(() => window.spike.leave()); await page.context().close(); }
}
const ok = results.filter((r) => r !== null).sort((a, b) => a - b);
console.log("ok", ok.length, "/", tries, "median", ok[Math.floor(ok.length / 2)]?.toFixed(0), "min", ok[0]?.toFixed(0), "max", ok.at(-1)?.toFixed(0));
await browser.close();
