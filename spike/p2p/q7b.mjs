import { chromium } from "playwright-core";
import fs from "node:fs";
const dir = "dist/assets/";
const files = fs.readdirSync(dir);
const browser = await chromium.launch({ executablePath: process.env.VIBEWARS_CHROMIUM });
const room = `spike-q7-${Date.now()}`;
const pages = [];
for (let i = 0; i < 2; i++) {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  // Serve the spike bundle as if it were part of the site, from the github.io origin.
  await page.route("**/VibeWars/__spike/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop();
    route.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(dir + name) });
  });
  await page.goto("https://enteee.github.io/VibeWars/");
  await page.locator(".roster").waitFor();
  console.log("landed on", page.url());
  const entry = files.find((f) => f.startsWith("index-") && f.endsWith(".js"));
  await page.addScriptTag({ type: "module", url: `https://enteee.github.io/VibeWars/__spike/${entry}` });
  await page.waitForFunction(() => "spike" in window);
  await page.evaluate((r) => window.spike.joinTrystero({ appId: "vibewars-spike-16", roomId: r, password: "pw" }), room);
  pages.push(page);
}
const t0 = Date.now();
while ((await pages[0].evaluate(() => window.spike.peers().length)) < 1 && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 100));
await pages[0].evaluate(() => window.spike.stream(20, 2048, 2000));
await new Promise((r) => setTimeout(r, 300));
console.log("joined after", Date.now() - t0, "ms; peer got", JSON.stringify(await pages[1].evaluate(() => window.spike.recvStats())));
console.log("origin", await pages[1].evaluate(() => location.origin));
await browser.close();
