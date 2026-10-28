/**
 * The support jail's proxy (#148): the API and nothing else, the company's
 * credential and never the jail's, and a budget on the hour.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  API_HOST,
  OAUTH_BETA,
  accessToken,
  admitRequest,
  createSupportProxy,
  refusal,
  upstreamHeaders,
} from "./support-proxy.mjs";

const NOW = 1_700_000_000_000;

/** @param {number} expiresAt */
const credentials = (expiresAt) =>
  JSON.stringify({ claudeAiOauth: { accessToken: "company-token", expiresAt } });

describe("accessToken", () => {
  it("reads a valid token", () => {
    expect(accessToken(credentials(NOW + 1), NOW)).toEqual({ token: "company-token" });
  });

  it("pauses support on an expired token, and on a missing or malformed file", () => {
    expect(accessToken(credentials(NOW), NOW)).toEqual({
      refused: "support paused: credential expired",
    });
    for (const text of [null, "", "{", "{}", '{"claudeAiOauth":{"accessToken":"x"}}']) {
      expect(accessToken(text, NOW), String(text)).toEqual({
        refused: "support paused: no credential",
      });
    }
  });
});

describe("refusal", () => {
  it("forwards the API requests Claude Code makes only", () => {
    expect(refusal("POST", "/v1/messages")).toBeNull();
    expect(refusal("POST", "/v1/messages?beta=true")).toBeNull();
    expect(refusal("POST", "/v1/messages/count_tokens?beta=true")).toBeNull();
    for (const [method, url] of [
      ["POST", "http://example.com/v1/messages"],
      ["POST", "//example.com/v1/messages"],
      ["POST", "/api/oauth/profile"],
      ["POST", "/v1/../api/oauth/profile"],
      ["POST", "/v1/./../api/oauth/profile"],
      ["POST", "/v1/%2e%2e/api/oauth/profile"],
      ["POST", "/v1/messages/../../api/oauth/profile"],
      ["POST", "/v1//messages"],
      ["POST", "/v1/messages?x=/../a"],
      ["POST", "/v1/models"],
      ["GET", "/v1/messages"],
      ["DELETE", "/v1/messages"],
      ["POST", "/"],
      ["CONNECT", "example.com:443"],
      ["POST", undefined],
      [undefined, "/v1/messages"],
    ]) {
      expect(refusal(method, url), `${String(method)} ${String(url)}`).not.toBeNull();
    }
  });
});

describe("admitRequest", () => {
  it("admits up to the budget in an hour, then refuses until the oldest is an hour old", () => {
    let admitted = /** @type {number[]} */ ([]);
    for (let i = 0; i < 3; i += 1) {
      const step = admitRequest(admitted, NOW + i, 3);
      expect(step.admit).toBe(true);
      admitted = step.admitted;
    }
    expect(admitRequest(admitted, NOW + 10, 3).admit).toBe(false);
    expect(admitRequest(admitted, NOW + 3_600_000, 3).admit).toBe(true);
  });
});

describe("upstreamHeaders", () => {
  it("drops the jail's credentials, and sends the company's with the OAuth beta", () => {
    const headers = upstreamHeaders(
      {
        authorization: "Bearer jail-token",
        "x-api-key": "sk-jail",
        cookie: "a=b",
        host: "127.0.0.1:8080",
        "anthropic-beta": "tools-1",
        "content-type": "application/json",
      },
      "company-token",
    );
    expect(headers).toEqual({
      authorization: "Bearer company-token",
      host: API_HOST,
      "anthropic-beta": `tools-1,${OAUTH_BETA}`,
      "content-type": "application/json",
    });
  });
});

describe("createSupportProxy", () => {
  /** @type {(() => void)[]} */
  const cleanups = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A proxy on a unix socket, in front of a fake API that records what
   * reached it.
   *
   * @param {{ text: string | null, perHour?: number }} options
   */
  async function proxy({ text, perHour = 10 }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "support-proxy-"));
    /** @type {{ method?: string, url?: string, headers: http.IncomingHttpHeaders, body: string }[]} */
    const reached = [];
    const api = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += String(chunk)));
      req.on("end", () => {
        reached.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(200, { "content-type": "application/json", "set-cookie": "x=y" });
        res.end('{"ok":true}');
      });
    });
    const apiSocket = path.join(dir, "api.sock");
    await new Promise((resolve) =>
      api.listen(apiSocket, () => {
        resolve(null);
      }),
    );
    /** @type {string[]} */
    const logs = [];
    const server = createSupportProxy({
      readCredentials: () => text,
      perHour,
      now: () => NOW,
      upstream: (options) => http.request({ ...options, socketPath: apiSocket }),
      log: (line) => logs.push(line),
    });
    const socket = path.join(dir, "proxy.sock");
    await new Promise((resolve) =>
      server.listen(socket, () => {
        resolve(null);
      }),
    );
    cleanups.push(() => {
      server.close();
      api.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });

    /**
     * @param {string} url
     * @param {http.OutgoingHttpHeaders} [headers]
     * @returns {Promise<{ status: number | undefined, headers: http.IncomingHttpHeaders, body: string }>}
     */
    const send = (url, headers = {}) =>
      new Promise((resolve, reject) => {
        const req = http.request(
          { socketPath: socket, method: "POST", path: url, headers },
          (res) => {
            let body = "";
            res.on("data", (chunk) => (body += String(chunk)));
            res.on("end", () => {
              resolve({ status: res.statusCode, headers: res.headers, body });
            });
          },
        );
        req.on("error", reject);
        req.end('{"model":"x"}');
      });
    return { send, reached, logs };
  }

  it("forwards an API request with the company's credential, never the jail's", async () => {
    const { send, reached } = await proxy({ text: credentials(NOW + 60_000) });
    const answer = await send("/v1/messages", {
      "x-api-key": "sk-jail",
      authorization: "Bearer jail",
    });
    expect(answer).toMatchObject({ status: 200, body: '{"ok":true}' });
    expect(answer.headers["set-cookie"]).toBeUndefined();
    expect(reached).toHaveLength(1);
    expect(reached[0]).toMatchObject({
      method: "POST",
      url: "/v1/messages",
      body: '{"model":"x"}',
    });
    expect(reached[0]?.headers.authorization).toBe("Bearer company-token");
    expect(reached[0]?.headers["x-api-key"]).toBeUndefined();
    expect(reached[0]?.headers.host).toBe(API_HOST);
  });

  it("refuses anything but the API, forwarding nothing", async () => {
    const { send, reached } = await proxy({ text: credentials(NOW + 60_000) });
    expect((await send("/api/oauth/profile")).status).toBe(403);
    expect(reached).toEqual([]);
  });

  it("pauses support on an expired credential, saying so once", async () => {
    const { send, reached, logs } = await proxy({ text: credentials(NOW - 1) });
    const answer = await send("/v1/messages");
    expect(answer).toMatchObject({ status: 503, body: "support paused: credential expired\n" });
    await send("/v1/messages");
    expect(reached).toEqual([]);
    expect(logs).toEqual(["support-proxy: support paused: credential expired"]);
  });

  it("refuses over the hour's budget", async () => {
    const { send, reached } = await proxy({ text: credentials(NOW + 60_000), perHour: 2 });
    expect((await send("/v1/messages")).status).toBe(200);
    expect((await send("/v1/messages")).status).toBe(200);
    expect((await send("/v1/messages")).status).toBe(429);
    expect(reached).toHaveLength(2);
  });
});
