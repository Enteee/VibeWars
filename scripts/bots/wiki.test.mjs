import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  ARCHIVE_ORIGIN,
  LIVE_ORIGIN,
  MAX_DIFF_CELLS,
  MAX_PAGE_BYTES,
  USER_AGENT,
  cdxUrl,
  extractText,
  isMaintenance,
  liveUrl,
  parseCdx,
  parseWikiRequest,
  runWiki,
  snapshotUrl,
  unifiedDiff,
} from "./wiki.mjs";

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "wiki");
/** @param {string} name */
const fixture = (name) => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const MAINTENANCE = fixture("maintenance.html");
const FIREBALL_NOW = fixture("fireball-2026-09-08.html");
const FIREBALL_2007 = fixture("fireball-2007-05-18.html");
const CDX = fixture("cdx-fireball.json");

const ORIGINS = { live: LIVE_ORIGIN, archive: ARCHIVE_ORIGIN };
const LIVE = liveUrl("Fireball", ORIGINS);
/** @param {string} timestamp */
const snap = (timestamp) => snapshotUrl("Fireball", timestamp, ORIGINS);

/**
 * A stand-in `fetch`: each URL answers a page, an HTTP status, a redirect,
 * or never (until the request's own timeout aborts it). Anything unplanted
 * is a 404.
 *
 * @param {Record<string, string | number | "hang" | { location: string }>} routes
 */
function fakeFetch(routes) {
  /** @type {{ url: string, agent: string | undefined }[]} */
  const calls = [];
  /** @type {import("./wiki.mjs").WikiDeps["fetch"]} */
  const fetch = (url, init) => {
    calls.push({ url, agent: init.headers["User-Agent"] });
    const route = routes[url] ?? 404;
    if (route === "hang") {
      return new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          reject(new DOMException("timed out", "TimeoutError"));
        });
      });
    }
    if (typeof route === "object") {
      return Promise.resolve(new Response("", { status: 302, headers: route }));
    }
    const status = typeof route === "number" ? route : 200;
    const body = typeof route === "string" ? route : "";
    return Promise.resolve(new Response(body, { status }));
  };
  return { fetch, calls, timeoutMs: 50 };
}

/** Wayback with every snapshot the CDX fixture lists. The newest is the maintenance page. */
const WAYBACK = {
  [cdxUrl("Fireball", ORIGINS)]: CDX,
  [snap("20261020101500")]: MAINTENANCE,
  [snap("20260908144536")]: FIREBALL_NOW,
  [snap("20070518013811")]: FIREBALL_2007,
};

describe("parseWikiRequest (#1380)", () => {
  it("reads get, get --at, history and diff", () => {
    expect(parseWikiRequest(["get", "Fireball"])).toEqual({
      verb: "get",
      page: "Fireball",
      at: null,
    });
    expect(parseWikiRequest(["get", "Fiery Rebuke", "--at", "2010-02-28"])).toEqual({
      verb: "get",
      page: "Fiery Rebuke",
      at: "2010-02-28",
    });
    expect(parseWikiRequest(["history", "Fireball"])).toEqual({
      verb: "history",
      page: "Fireball",
    });
    expect(parseWikiRequest(["diff", "Fireball", "2007-06-01"])).toEqual({
      verb: "diff",
      page: "Fireball",
      from: "2007-06-01",
      to: "live",
    });
    expect(parseWikiRequest(["diff", "Fireball", "2007-06-01", "2026-01-01"])).toMatchObject({
      to: "2026-01-01",
    });
  });

  it("refuses an unknown verb, a bad date and stray words with the usage", () => {
    for (const argv of [
      [],
      ["get"],
      ["search", "Fireball"],
      ["get", "Fireball", "--at", "2010-02-30"],
      ["get", "Fireball", "--at", "yesterday"],
      ["get", "Fireball", "extra"],
      ["history", "Fireball", "2010-01-01"],
      ["diff", "Fireball"],
      ["diff", "Fireball", "live"],
      ["diff", "Fireball", "2010-01-01", "2011-01-01", "live"],
      ["get", "../../../x"],
      ["get", "Fireball/./x"],
    ]) {
      const parsed = parseWikiRequest(argv);
      expect("error" in parsed && parsed.error, argv.join(" ")).toMatch(
        /^usage: hub wiki get <Page>/,
      );
    }
  });
});

describe("the wiki's pages (#1380)", () => {
  it("tells the maintenance page, which answers 200, from a page", () => {
    expect(isMaintenance(MAINTENANCE)).toBe(true);
    expect(isMaintenance(FIREBALL_NOW)).toBe(false);
  });

  it("takes a page as typed, spaces as underscores", () => {
    expect(liveUrl("Fiery Rebuke", ORIGINS)).toBe("https://wiki.guildwars.com/wiki/Fiery_Rebuke");
    expect(snapshotUrl("Rodgort's Invocation", "20260101000000", ORIGINS)).toBe(
      "https://web.archive.org/web/20260101000000id_/https://wiki.guildwars.com/wiki/Rodgort's_Invocation",
    );
  });

  it("turns the skill infobox into key: value lines, then the article", () => {
    const text = extractText(FIREBALL_NOW);

    expect(text.split("\n").slice(0, 9)).toEqual([
      "name: Fireball",
      "Energy: 10",
      "Activation: 1½",
      "Recharge: 7",
      "Profession: Elementalist",
      "Attribute: Fire Magic",
      "Type: Spell",
      "Campaign: Core",
      "Animation: Click to view",
    ]);
    expect(text).toContain(
      "Spell. Send out a ball of fire that strikes target foe and all nearby foes for 7...91...112 fire damage.",
    );
    expect(text).toContain("Fire damage: 7 14 21 28 35 42 49 56 63 70 77 84 91 98 105 112");
    expect(text).toContain("== Notes ==");
    // Edit links, navigation, the hidden sort key and the popup copy are gone.
    expect(text).not.toContain("edit");
    expect(text).not.toContain("Jump to");
    expect(text).not.toContain("01.5");
    expect(text.match(/Send out a ball of fire/g)).toHaveLength(1);
    expect(text).not.toContain("Categories");
  });

  it("reads the 2007 markup the same way", () => {
    const text = extractText(FIREBALL_2007);

    expect(text).toMatch(/^name: Fireball\nEnergy: 10\nActivation: 2\nRecharge: 7\n/);
    expect(text).toContain("Fire damage: 7 14 21 28");
    expect(text).toContain("== Acquisition ==");
  });
});

describe("unifiedDiff (#1380)", () => {
  it("shows a changed line with its context, and null for no change", () => {
    const before = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].join("\n");
    const after = ["a", "b", "c", "d", "E", "f", "g", "h", "i"].join("\n");

    expect(unifiedDiff(before, after, "old", "new")).toEqual({
      ok: true,
      diff: [
        "--- old",
        "+++ new",
        "@@ -2,7 +2,7 @@",
        " b",
        " c",
        " d",
        "-e",
        "+E",
        " f",
        " g",
        " h",
      ].join("\n"),
    });
    expect(unifiedDiff(before, before, "old", "new")).toEqual({ ok: true, diff: null });
  });

  it("compares only what differs, and refuses past MAX_DIFF_CELLS", () => {
    /** @param {string} tag @param {number} count */
    const lines = (tag, count) => Array.from({ length: count }, (_, k) => `${tag}${String(k)}`);
    const side = Math.ceil(Math.sqrt(MAX_DIFF_CELLS)) + 1;
    const long = lines("same", 50_000);
    const edited = [...long.slice(0, 25_000), "changed", ...long.slice(25_001)];

    const near = unifiedDiff(long.join("\n"), edited.join("\n"), "old", "new");

    expect(near.ok && near.diff).toContain("@@ -24998,7 +24998,7 @@\n");
    expect(
      unifiedDiff(lines("a", side).join("\n"), lines("b", side).join("\n"), "old", "new"),
    ).toEqual({ ok: false, reason: "too long to diff" });
  });
});

describe("a large page (#1380)", () => {
  it("reads tens of thousands of hidden spans in one pass", () => {
    const hidden = '<span style="display:none">x</span>'.repeat(60_000);
    const page = FIREBALL_NOW.replace("<!-- start content -->", `<!-- start content -->${hidden}`);

    expect(page.length).toBeLessThan(MAX_PAGE_BYTES);
    expect(extractText(page)).toBe(extractText(FIREBALL_NOW));
  });
});

describe("parseCdx (#1380)", () => {
  it("keeps one entry per run of the same content, oldest first", () => {
    expect(parseCdx(CDX)?.map((s) => s.timestamp)).toEqual([
      "20070312185353",
      "20070518013811",
      "20260719095316",
      "20260908144536",
      "20261020101500",
    ]);
  });

  it("refuses an answer that is not CDX", () => {
    expect(parseCdx("<html>429 Too Many Requests</html>")).toBeNull();
    expect(parseCdx('{"archived_snapshots":{}}')).toBeNull();
    expect(parseCdx("")).toEqual([]);
  });
});

describe("runWiki (#1380)", () => {
  it("prints the live page, named as live, and asks politely", async () => {
    const deps = fakeFetch({ [LIVE]: FIREBALL_NOW });

    const answer = await runWiki(["get", "Fireball"], deps);

    expect(answer.code).toBe(0);
    expect(answer.stdout).toMatch(
      /^source: https:\/\/wiki\.guildwars\.com\/wiki\/Fireball \(live\)\n\nname: Fireball\n/,
    );
    expect(deps.calls).toEqual([{ url: LIVE, agent: USER_AGENT }]);
  });

  it("falls back from the live maintenance page to the newest snapshot that is a page", async () => {
    const deps = fakeFetch({ [LIVE]: MAINTENANCE, ...WAYBACK });

    const answer = await runWiki(["get", "Fireball"], deps);

    expect(answer.code).toBe(0);
    expect(answer.stdout.split("\n")[0]).toBe(
      `source: ${snap("20260908144536")} (snapshot 2026-09-08)`,
    );
    expect(answer.stdout).toContain("Activation: 1½");
  });

  it("falls back when live answers 5xx or times out", async () => {
    for (const live of [/** @type {const} */ (503), /** @type {const} */ ("hang")]) {
      const answer = await runWiki(["get", "Fireball"], fakeFetch({ [LIVE]: live, ...WAYBACK }));

      expect(answer.code, String(live)).toBe(0);
      expect(answer.stdout, String(live)).toContain("(snapshot 2026-09-08)");
    }
  });

  it("with --at, takes the newest snapshot on or before that day, and never live", async () => {
    const deps = fakeFetch({ [LIVE]: FIREBALL_NOW, ...WAYBACK });

    const answer = await runWiki(["get", "Fireball", "--at", "2007-05-18"], deps);

    expect(answer.stdout.split("\n")[0]).toBe(
      `source: ${snap("20070518013811")} (snapshot 2007-05-18)`,
    );
    expect(answer.stdout).toContain("Activation: 2\n");
    expect(deps.calls.map((c) => c.url)).not.toContain(LIVE);
  });

  it("lists the distinct snapshots, newest first", async () => {
    const answer = await runWiki(["history", "Fireball"], fakeFetch(WAYBACK));

    expect(answer.stdout).toBe(
      [
        "2026-10-20 MAINTENANCEPAGEDIGESTXXXXXXXXXXXX",
        "2026-09-08 5NXSMTALP2S7TDPEA2JLBLUXHGRKMJQK",
        "2026-07-19 F37B7XGKJZXSUOVUCSXUUNA3UG47HMF7",
        "2007-05-18 QJ34ZMDLXSLFNS6HVG4SENGELPHCCA6F",
        "2007-03-12 M6SDBMVZNC46IE5I3NYCUA4HOXVPWNAI",
        "",
      ].join("\n"),
    );
  });

  it("diffs a snapshot against live, showing the changed number", async () => {
    const answer = await runWiki(
      ["diff", "Fireball", "2007-06-01"],
      fakeFetch({ [LIVE]: FIREBALL_NOW, ...WAYBACK }),
    );

    expect(answer.code).toBe(0);
    expect(answer.stdout).toContain(`--- ${snap("20070518013811")} (snapshot 2007-05-18)\n`);
    expect(answer.stdout).toContain(`+++ ${LIVE} (live)\n`);
    expect(answer.stdout).toContain("\n-Activation: 2\n+Activation: 1½\n");
  });

  it("says no change when the two sides read the same", async () => {
    const answer = await runWiki(
      ["diff", "Fireball", "2026-09-30", "live"],
      fakeFetch({ [LIVE]: FIREBALL_NOW, ...WAYBACK }),
    );

    expect(answer).toEqual({ code: 0, stdout: "no change\n", stderr: "" });
  });

  it("exits 1 with no copy when neither live nor Wayback has the page", async () => {
    const answer = await runWiki(
      ["get", "Nowhere"],
      fakeFetch({ [liveUrl("Nowhere", ORIGINS)]: MAINTENANCE, [cdxUrl("Nowhere", ORIGINS)]: "" }),
    );

    expect(answer).toEqual({
      code: 1,
      stdout: "",
      stderr: "no copy of Nowhere: live maintenance, wayback none\n",
    });
  });

  it("says why Wayback could not answer", async () => {
    const answer = await runWiki(["get", "Fireball", "--at", "2006-01-01"], fakeFetch(WAYBACK));
    const limited = await runWiki(
      ["history", "Fireball"],
      fakeFetch({ [cdxUrl("Fireball", ORIGINS)]: 429 }),
    );

    expect(answer.stderr).toBe("no copy of Fireball: wayback none on or before 2006-01-01\n");
    expect(limited.stderr).toBe("no copy of Fireball: wayback HTTP 429\n");
  });

  it("follows a redirect that stays on the wiki or Wayback", async () => {
    const moved = `${LIVE_ORIGIN}/wiki/Fire_Ball`;
    const deps = fakeFetch({ [LIVE]: { location: "/wiki/Fire_Ball" }, [moved]: FIREBALL_NOW });

    const answer = await runWiki(["get", "Fireball"], deps);

    expect(answer.stdout).toMatch(/^source: .* \(live\)\n\nname: Fireball\n/);
    expect(deps.calls.map((c) => c.url)).toEqual([LIVE, moved]);
  });

  it("refuses a page past MAX_PAGE_BYTES, and a redirect loop", async () => {
    const huge = "x".repeat(MAX_PAGE_BYTES + 1);
    const large = await runWiki(
      ["history", "Fireball"],
      fakeFetch({ [cdxUrl("Fireball", ORIGINS)]: huge }),
    );
    const loop = await runWiki(
      ["get", "Fireball", "--at", "2007-05-18"],
      fakeFetch({
        [cdxUrl("Fireball", ORIGINS)]: { location: cdxUrl("Fireball", ORIGINS) },
      }),
    );

    expect(large.stderr).toBe("no copy of Fireball: wayback too large\n");
    expect(loop.stderr).toBe("no copy of Fireball: wayback too many redirects\n");
  });

  it("refuses bad words with the usage, exit 2", async () => {
    const answer = await runWiki(["get", "Fireball", "--at", "2010-13-01"], fakeFetch({}));

    expect(answer.code).toBe(2);
    expect(answer.stderr).toContain("usage:");
  });
});

describe("runWiki over HTTP (#1380)", () => {
  /** @type {http.Server[]} */
  const servers = [];
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
    );
  });

  /**
   * @param {http.RequestListener} answer
   * @returns {Promise<string>} its origin
   */
  const serve = async (answer) => {
    const server = http.createServer(answer);
    servers.push(server);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        resolve(undefined);
      });
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("no port");
    }
    return `http://127.0.0.1:${String(address.port)}`;
  };

  it("never follows a redirect off the two origins: the host's own ports stay unread", async () => {
    let inside = 0;
    const host = await serve((_, response) => {
      inside += 1;
      response.end("secret");
    });
    const wiki = await serve((_, response) => {
      response.writeHead(302, { location: `${host}/admin` }).end();
    });

    const answer = await runWiki(["get", "Fireball"], {
      fetch,
      origins: { live: wiki, archive: wiki },
    });

    expect(answer.stderr).toBe(
      "no copy of Fireball: live redirected off-site, wayback redirected off-site\n",
    );
    expect(inside).toBe(0);
  });
});
