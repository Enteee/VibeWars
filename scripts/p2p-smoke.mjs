#!/usr/bin/env node
/**
 * `node scripts/p2p-smoke.mjs` — does a real peer-to-peer join work (#707)?
 * Not part of CI: it needs the internet, the Nostr relays and the network
 * between two browsers, none of which a runner promises. e2e plays over a
 * BroadcastChannel (ADR-0022), so this is the only run of the real path.
 *
 * Builds the static client with the Trystero transport, serves it on
 * 127.0.0.1 (or measures `--url`), and for each pair hosts a lobby in one
 * browser context and joins its code from another, as a second window or a
 * private window does. Prints, for each side of each pair:
 *
 *   relays   the relay sockets the page opened, and how many were open
 *            when the join ended
 *   peer     how far WebRTC got: the peer connections made, their last
 *            ICE and connection states, and the local candidate types
 *            gathered (`host`, `host(mdns)` for a `.local` name, `srflx`)
 *   error    what the page logged: Trystero's onJoinError text, and the
 *            notice the joiner was shown
 *   joined   the seconds to the lobby screen, or "no"
 *
 * Exit code 0 only if every pair joined.
 *
 *   --pairs <list>   comma-separated, from: firefox-firefox,
 *                    firefox-private, chromium-chromium, firefox-chromium
 *                    (default: all four)
 *   --url <url>      join on a client already served there; its host
 *                    decides whether it is on loopback
 *   --timeout <s>    how long a join may take before it counts as failed
 *                    (default 45, past the client's own timeout)
 *
 * `firefox-private` runs the joiner with the prefs a Firefox private window
 * sets: strict Enhanced Tracking Protection. Every Firefox context keeps
 * Firefox's defaults that matter here, which Playwright otherwise changes:
 * host candidates hidden behind mDNS names, and no loopback candidates.
 *
 * Browsers: VIBEWARS_CHROMIUM (as for e2e) and VIBEWARS_FIREFOX (a
 * Playwright Firefox build); the defaults are Playwright's own. Firefox runs
 * with its content sandbox off (MOZ_DISABLE_CONTENT_SANDBOX), as Chromium
 * runs --no-sandbox: the jail and the runner have no user namespaces for it.
 */
/* global window, RTCPeerConnection -- in addInitScript, which runs in the page */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";

import { chromium, firefox } from "@playwright/test";

const PORT = 4320;
/** @typedef {"chromium" | "firefox" | "firefox-private"} Kind */
/** @typedef {{ ice: string, connection: string, candidates: string[] }} PeerSeen */

/**
 * Each pair: who hosts, and who joins.
 *
 * @type {Map<string, [Kind, Kind]>}
 */
const SIDES = new Map([
  ["firefox-firefox", ["firefox", "firefox"]],
  ["firefox-private", ["firefox", "firefox-private"]],
  ["chromium-chromium", ["chromium", "chromium"]],
  ["firefox-chromium", ["firefox", "chromium"]],
]);
const PAIRS = [...SIDES.keys()];
const { values: options } = parseArgs({
  options: {
    pairs: { type: "string", default: PAIRS.join(",") },
    url: { type: "string" },
    timeout: { type: "string", default: "45" },
  },
});
const TIMEOUT_MS = Number(options.timeout) * 1000;

/**
 * Firefox's own defaults for WebRTC, which Playwright's Firefox changes
 * for its tests: host addresses obfuscated behind mDNS names, no loopback
 * candidates. Without these the run would test a Firefox nobody uses.
 */
const FIREFOX_DEFAULTS = {
  "media.peerconnection.ice.obfuscate_host_addresses": true,
  "media.peerconnection.ice.loopback": false,
  "media.navigator.permission.disabled": false,
};

/** What a private window adds: strict Enhanced Tracking Protection. */
const FIREFOX_PRIVATE = {
  "browser.contentblocking.category": "strict",
  "privacy.trackingprotection.enabled": true,
  "privacy.trackingprotection.socialtracking.enabled": true,
  "privacy.trackingprotection.cryptomining.enabled": true,
  "privacy.trackingprotection.fingerprinting.enabled": true,
  "network.cookie.cookieBehavior": 5,
};

/**
 * Serve the static client, built with the Trystero transport, and resolve
 * once it answers.
 *
 * @returns {Promise<{ url: string, stop: () => void }>}
 */
async function serve() {
  const url = `http://127.0.0.1:${String(PORT)}/`;
  // Outside the checkout, so the build leaves nothing behind to ignore.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "p2p-smoke-"));
  const command =
    `pnpm --filter @vibewars/web exec vite build --outDir ${out} --emptyOutDir && ` +
    `pnpm --filter @vibewars/web exec vite preview --outDir ${out} ` +
    `--host 127.0.0.1 --port ${String(PORT)} --strictPort`;
  const env = { ...process.env };
  // Every build but e2e's plays over Trystero.
  delete env.VITE_VIBEWARS_TRANSPORT;
  const child = spawn("sh", ["-c", command], {
    stdio: ["ignore", "ignore", "inherit"],
    env,
    detached: true,
  });
  // `exitCode` stays null while it runs, as a server should.
  const stop = () => {
    if (child.exitCode === null && child.pid !== undefined) {
      process.kill(-child.pid);
    }
    fs.rmSync(out, { recursive: true, force: true });
  };
  for (let waited = 0; waited < 180 && child.exitCode === null; waited += 1) {
    try {
      if ((await fetch(url)).ok) {
        return { url, stop };
      }
    } catch {
      // Not up yet.
    }
    await sleep(1000);
  }
  stop();
  throw new Error(`the client did not come up at ${url}; is the port taken?`);
}

/** @type {Map<string, import("@playwright/test").Browser>} */
const browsers = new Map();

/**
 * One browser per kind and prefs, shared by every pair that wants it.
 *
 * @param {Kind} kind
 * @returns {Promise<import("@playwright/test").Browser>}
 */
async function launch(kind) {
  const open = browsers.get(kind);
  if (open !== undefined) {
    return open;
  }
  let browser;
  if (kind === "chromium") {
    const executablePath = process.env.VIBEWARS_CHROMIUM;
    browser = await chromium.launch({
      ...(executablePath === undefined ? {} : { executablePath }),
      args: ["--no-sandbox"],
    });
  } else {
    const executablePath = process.env.VIBEWARS_FIREFOX;
    browser = await firefox.launch({
      ...(executablePath === undefined ? {} : { executablePath }),
      firefoxUserPrefs: {
        ...FIREFOX_DEFAULTS,
        ...(kind === "firefox-private" ? FIREFOX_PRIVATE : {}),
      },
      env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: "1" },
    });
  }
  browsers.set(kind, browser);
  return browser;
}

/**
 * @typedef {{
 *   relays: Map<string, "opening" | "open" | "closed">,
 *   logs: string[],
 * }} Watch
 */

/**
 * A page that records its relay sockets, its peer connections and what it
 * logs, for `report`.
 *
 * @param {Kind} kind
 * @param {string} url
 * @returns {Promise<{ page: import("@playwright/test").Page, watch: Watch, close: () => Promise<void> }>}
 */
async function openSide(kind, url) {
  const browser = await launch(kind);
  // Its own context, as a second window's storage is its own.
  const context = await browser.newContext();
  const page = await context.newPage();
  /** @type {Watch} */
  const watch = { relays: new Map(), logs: [] };
  page.on("websocket", (socket) => {
    const name = socket.url();
    watch.relays.set(name, "opening");
    socket.on("framereceived", () => {
      watch.relays.set(name, "open");
    });
    socket.on("framesent", () => {
      watch.relays.set(name, "open");
    });
    socket.on("close", () => {
      watch.relays.set(name, "closed");
    });
  });
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "warning" || message.type() === "error" || text.includes("trystero")) {
      watch.logs.push(text);
    }
  });
  page.on("pageerror", (error) => {
    watch.logs.push(`pageerror: ${error.message}`);
  });
  // Every peer connection the page makes, its states and the types of
  // the candidates it gathered.
  await page.addInitScript(() => {
    /** @type {{ ice: string, connection: string, candidates: string[] }[]} */
    const seen = [];
    Object.assign(window, { p2pSmokePeers: seen });
    const Original = RTCPeerConnection;
    class Watched extends Original {
      /** @param {RTCConfiguration} [config] */
      constructor(config) {
        super(config);
        const entry = { ice: "new", connection: "new", candidates: /** @type {string[]} */ ([]) };
        seen.push(entry);
        this.addEventListener("iceconnectionstatechange", () => {
          entry.ice = this.iceConnectionState;
        });
        this.addEventListener("connectionstatechange", () => {
          entry.connection = this.connectionState;
        });
        this.addEventListener("icecandidate", (event) => {
          const candidate = event.candidate?.candidate;
          if (candidate === undefined || candidate === "") {
            return;
          }
          const type = / typ (\w+)/.exec(candidate)?.[1] ?? "?";
          const address = candidate.split(" ")[4] ?? "";
          const label = type === "host" && address.endsWith(".local") ? "host(mdns)" : type;
          if (!entry.candidates.includes(label)) {
            entry.candidates.push(label);
          }
        });
      }
    }
    Object.assign(window, { RTCPeerConnection: Watched });
  });
  await page.goto(url);
  await page.locator(".screen-menu").waitFor();
  return { page, watch, close: () => context.close() };
}

/**
 * One side's line: relays, peers and errors.
 *
 * @param {string} label
 * @param {import("@playwright/test").Page} page
 * @param {Watch} watch
 */
async function report(label, page, watch) {
  const sockets = [...watch.relays.values()];
  const open = sockets.filter((state) => state === "open").length;
  /** @type {PeerSeen[]} */
  const peers = await page
    .evaluate(() => {
      const seen = /** @type {unknown} */ (Reflect.get(window, "p2pSmokePeers"));
      return /** @type {PeerSeen[]} */ (seen);
    })
    .catch(() => /** @type {PeerSeen[]} */ ([]));
  const peerText =
    peers.length === 0
      ? "none"
      : peers
          .map((peer) => `${peer.connection}/${peer.ice} [${peer.candidates.join(" ")}]`)
          .join(", ");
  console.log(`  ${label.padEnd(7)} relays ${String(open)}/${String(sockets.length)} open`);
  console.log(`          peers  ${peerText}`);
  for (const line of watch.logs) {
    console.log(`          log    ${line}`);
  }
}

/**
 * Host in one context, join from another, and say how far it got.
 *
 * @param {string} pair
 * @param {string} url
 * @returns {Promise<boolean>} whether the joiner reached the lobby
 */
async function runPair(pair, url) {
  const sides = SIDES.get(pair);
  if (sides === undefined) {
    throw new Error(`unknown pair ${pair}; pick from ${PAIRS.join(", ")}`);
  }
  const [hostKind, joinerKind] = sides;
  console.log(`\n${pair} (host ${hostKind}, joiner ${joinerKind})`);
  const host = await openSide(hostKind, url);
  const joiner = await openSide(joinerKind, url);
  try {
    await host.page.locator(".screen-menu input.field-input").first().fill("Host");
    await host.page.getByRole("button", { name: "host a lobby" }).click();
    const codeText = host.page.locator(".lobby-code");
    try {
      await codeText.waitFor({ timeout: TIMEOUT_MS });
    } catch {
      await report("host", host.page, host.watch);
      const shown = host.page.locator(".screen-connection-problem");
      if ((await shown.count()) > 0) {
        console.log(`          shown  ${(await shown.first().innerText()).trim()}`);
      }
      console.log("  joined  no: the host never reached its own lobby");
      return false;
    }
    const code = (await codeText.textContent())?.trim() ?? "";

    await joiner.page.locator(".screen-menu input.field-input").first().fill("Joiner");
    await joiner.page.locator("input.code-input").fill(code);
    const started = Date.now();
    await joiner.page.getByRole("button", { name: "Join", exact: true }).click();
    // The lobby, or the menu back with a notice: whichever comes first.
    const lobby = joiner.page.locator(".screen-lobby");
    const notice = joiner.page.locator(".screen-connection-problem");
    await Promise.race([
      lobby.waitFor({ timeout: TIMEOUT_MS }),
      notice.first().waitFor({ timeout: TIMEOUT_MS }),
    ]).catch(() => undefined);
    const joined = await lobby.isVisible();
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    await report("host", host.page, host.watch);
    await report("joiner", joiner.page, joiner.watch);
    if (!joined && (await notice.count()) > 0) {
      console.log(`          shown  ${(await notice.first().innerText()).trim()}`);
    }
    console.log(`  joined  ${joined ? `in ${seconds} s` : `no (after ${seconds} s)`}`);
    return joined;
  } finally {
    await joiner.close();
    await host.close();
  }
}

const served = options.url === undefined ? await serve() : undefined;
const url = options.url ?? served?.url ?? "";
let allJoined = true;
try {
  for (const pair of options.pairs.split(",").filter(Boolean)) {
    if (!(await runPair(pair, url))) {
      allJoined = false;
    }
  }
} finally {
  for (const browser of browsers.values()) {
    await browser.close();
  }
  served?.stop();
}
process.exit(allJoined ? 0 : 1);
