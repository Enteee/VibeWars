import { chromium } from "playwright-core";
const base = process.argv[2] ?? "https://enteee.github.io/VibeWars/";
const browser = await chromium.launch({ executablePath: process.env.VIBEWARS_CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
const failed = [], errors = [];
page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base);
await page.locator(".roster").waitFor();
await page.getByRole("button", { name: "new character" }).click();
await page.locator(".editor-row select").first().selectOption("elementalist");
await page.locator(".skill-box", { hasText: "Fireball" }).click();
await page.locator(".training canvas").waitFor();
await page.waitForTimeout(1500);
const canvas = await page.locator(".training canvas").boundingBox();
const idb = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
await page.reload();
await page.locator(".roster").waitFor();
const rosterAfterReload = await page.locator(".roster").innerText();
// Trystero's relays from the https origin, no special headers.
const relays = await page.evaluate(async () => {
  const ok = [];
  for (const u of ["wss://nos.lol", "wss://relay.damus.io", "wss://nostr.mom"]) {
    ok.push(await new Promise((r) => { const ws = new WebSocket(u); const t = setTimeout(() => r(u + " timeout"), 8000); ws.onopen = () => { clearTimeout(t); ws.close(); r(u + " open"); }; ws.onerror = () => { clearTimeout(t); r(u + " error"); }; }));
  }
  return { ok, isSecureContext, crossOriginIsolated, rtc: typeof RTCPeerConnection };
});
console.log(JSON.stringify({ failed, errors, canvas, idb, rosterAfterReload: rosterAfterReload.slice(0, 80), relays }, null, 1));
await browser.close();
