/**
 * A CI runner jail's proxy (#1889): CONNECT to port 443 of an allowlisted
 * host, and nothing else.
 */
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_TUNNELS,
  REFUSALS_LOGGED_A_MINUTE,
  createRunnerProxy,
  isInternal,
  parseAllowlist,
  refusalLog,
  tunnelTarget,
} from "./runner-proxy.mjs";

const ALLOW = parseAllowlist(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "runner-proxy-allow.json"),
    "utf8",
  ),
);

describe("tunnelTarget", () => {
  it("allows an allowlisted host, exactly or below a dotted entry", () => {
    expect(tunnelTarget("github.com:443", ALLOW)).toEqual({ host: "github.com" });
    expect(tunnelTarget("API.GitHub.com:443", ALLOW)).toEqual({ host: "api.github.com" });
    expect(tunnelTarget("github.com.:443", ALLOW)).toEqual({ host: "github.com" });
    expect(tunnelTarget("objects.githubusercontent.com:443", ALLOW)).toEqual({
      host: "objects.githubusercontent.com",
    });
    expect(tunnelTarget("productionresultssa0.blob.core.windows.net:443", ALLOW)).toEqual({
      host: "productionresultssa0.blob.core.windows.net",
    });
  });

  it("refuses a host off the list, and the suffix tricks", () => {
    for (const host of [
      "example.com",
      "github.com.evil.io",
      "evilgithub.com",
      "githubusercontent.com.evil.io",
      "evilgithubusercontent.com",
      "sub.github.com",
      "github.com.evil.io.",
    ]) {
      expect(tunnelTarget(`${host}:443`, ALLOW), host).toEqual({
        refused: `host refused: ${host.replace(/\.$/, "")}`,
      });
    }
  });

  it("refuses userinfo and a raw IDN, and logs no control character", () => {
    for (const host of ["user@objects.githubusercontent.com", "gіthub.com", "github..com"]) {
      expect(tunnelTarget(`${host}:443`, ALLOW), host).toEqual({
        refused: `not a host name: ${host}`,
      });
    }
    expect(tunnelTarget("github.com\u001b[2K:443", ALLOW)).toEqual({
      refused: "not a host name: github.com?[2k",
    });
    expect(tunnelTarget("github.com:443\nrefused: x", ALLOW)).toEqual({
      refused: "not host:port: github.com:443?refused: x",
    });
  });

  it("refuses IP literals", () => {
    for (const host of ["140.82.121.4", "127.0.0.1", "[::1]", "[2606:50c0:8000::153]"]) {
      expect(tunnelTarget(`${host}:443`, ALLOW), host).toEqual({
        refused: `IP literal refused: ${host}`,
      });
    }
  });

  it("refuses any port but 443, and a target that is not host:port", () => {
    expect(tunnelTarget("github.com:22", ALLOW)).toEqual({
      refused: "port 22 refused: github.com",
    });
    expect(tunnelTarget("github.com:80", ALLOW)).toEqual({
      refused: "port 80 refused: github.com",
    });
    for (const target of ["github.com", "/path", "http://github.com:443", undefined]) {
      expect(tunnelTarget(target, ALLOW), String(target)).toEqual({
        refused: `not host:port: ${String(target)}`,
      });
    }
  });
});

describe("parseAllowlist", () => {
  it("refuses anything but a non-empty list of host names", () => {
    for (const json of [
      "[]",
      "{}",
      '["*.github.com"]',
      '["github.com/x"]',
      '["Github.com"]',
      "[1]",
    ]) {
      expect(() => parseAllowlist(json), json).toThrow(/runner-proxy/);
    }
  });
});

describe("isInternal", () => {
  it("is true for loopback, private, link-local and mapped addresses only", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.1.1"]) {
      expect(isInternal(address), address).toBe(true);
    }
    for (const address of ["::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isInternal(address), address).toBe(true);
    }
    for (const address of [
      "192.0.0.8",
      "198.18.0.1",
      "198.19.255.1",
      "224.0.0.251",
      "240.0.0.1",
      "255.255.255.255",
      "64:ff9b::a00:1",
      "2002:a00:1::1",
    ]) {
      expect(isInternal(address), address).toBe(true);
    }
    for (const address of ["140.82.121.4", "2606:50c0:8000::153", "::ffff:140.82.121.4"]) {
      expect(isInternal(address), address).toBe(false);
    }
  });
});

describe("refusalLog", () => {
  it("logs so many refusals a minute, then says how many it dropped", () => {
    /** @type {string[]} */
    const lines = [];
    let now = 0;
    const log = refusalLog(
      (line) => lines.push(line),
      () => now,
    );
    for (let i = 0; i < REFUSALS_LOGGED_A_MINUTE + 5; i++) {
      log(`refused ${String(i)}`);
    }
    expect(lines).toHaveLength(REFUSALS_LOGGED_A_MINUTE);
    now = 60_000;
    log("next minute");
    expect(lines.slice(-2)).toEqual(["runner-proxy: 5 refusals not logged", "next minute"]);
  });
});

describe("createRunnerProxy", () => {
  /** @type {(() => void)[]} */
  const cleanups = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /**
   * A proxy whose upstream is an echo server on loopback, whatever the
   * host resolves to.
   *
   * @param {string} address what every host resolves to
   */
  async function proxy(address) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-proxy-"));
    const echo = net.createServer((socket) => socket.pipe(socket));
    await new Promise((resolve) =>
      echo.listen(0, "127.0.0.1", () => {
        resolve(undefined);
      }),
    );
    const echoPort = /** @type {net.AddressInfo} */ (echo.address()).port;
    /** @type {string[]} */
    const logs = [];
    const server = createRunnerProxy({
      allow: ALLOW,
      resolve: async (host) =>
        host === "nowhere.githubusercontent.com" ? Promise.reject(new Error("ENOTFOUND")) : address,
      connect: () => net.connect(echoPort, "127.0.0.1"),
      log: (line) => logs.push(line),
    });
    const socket = path.join(dir, "proxy.sock");
    await new Promise((resolve) =>
      server.listen(socket, () => {
        resolve(undefined);
      }),
    );
    cleanups.push(() => {
      server.close();
      echo.close();
      fs.rmSync(dir, { recursive: true, force: true });
    });
    return { socket, logs };
  }

  /**
   * Sends a CONNECT, then `ping` once it is answered; resolves with all
   * the bytes the client got back.
   *
   * @param {string} socket
   * @param {string} target
   * @returns {Promise<string>}
   */
  function tunnel(socket, target) {
    return new Promise((resolve) => {
      const client = net.connect(socket);
      let got = "";
      client.on("data", (chunk) => {
        got += chunk.toString();
        if (got.startsWith("HTTP/1.1 200") && got.endsWith("\r\n\r\n")) {
          client.write("ping");
        }
        if (got.endsWith("ping")) {
          client.end();
        }
      });
      client.on("close", () => {
        resolve(got);
      });
      client.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
    });
  }

  it("holds at most MAX_TUNNELS connections", () => {
    const server = createRunnerProxy({
      allow: ALLOW,
      resolve: () => Promise.reject(new Error("unused")),
      connect: () => new net.Socket(),
      log: () => undefined,
    });
    expect(server.maxConnections).toBe(MAX_TUNNELS);
  });

  it("tunnels to an allowed host", async () => {
    const { socket, logs } = await proxy("140.82.121.4");
    expect(await tunnel(socket, "github.com:443")).toBe(
      "HTTP/1.1 200 Connection Established\r\n\r\nping",
    );
    expect(logs).toEqual([]);
  });

  it("refuses and logs a host off the list, a non-443 port and an IP literal", async () => {
    const { socket, logs } = await proxy("140.82.121.4");
    expect(await tunnel(socket, "github.com.evil.io:443")).toBe("HTTP/1.1 403 Forbidden\r\n\r\n");
    expect(await tunnel(socket, "github.com:22")).toBe("HTTP/1.1 403 Forbidden\r\n\r\n");
    expect(await tunnel(socket, "127.0.0.1:443")).toBe("HTTP/1.1 403 Forbidden\r\n\r\n");
    expect(logs).toEqual([
      "runner-proxy: host refused: github.com.evil.io",
      "runner-proxy: port 22 refused: github.com",
      "runner-proxy: IP literal refused: 127.0.0.1",
    ]);
  });

  it("refuses an allowed name that resolves into the host's network", async () => {
    const { socket, logs } = await proxy("127.0.0.1");
    expect(await tunnel(socket, "github.com:443")).toBe("HTTP/1.1 403 Forbidden\r\n\r\n");
    expect(logs).toEqual(["runner-proxy: internal address refused: github.com is 127.0.0.1"]);
  });

  it("refuses a name that does not resolve", async () => {
    const { socket, logs } = await proxy("140.82.121.4");
    expect(await tunnel(socket, "nowhere.githubusercontent.com:443")).toBe(
      "HTTP/1.1 403 Forbidden\r\n\r\n",
    );
    expect(logs).toEqual(["runner-proxy: unresolvable: nowhere.githubusercontent.com"]);
  });

  it("answers a plain HTTP request with 405, never forwarding it", async () => {
    const { socket, logs } = await proxy("140.82.121.4");
    const got = await new Promise(
      /** @param {(text: string) => void} resolve */ (resolve) => {
        const client = net.connect(socket);
        let text = "";
        client.on("data", (chunk) => {
          text += chunk.toString();
        });
        client.on("close", () => {
          resolve(text);
        });
        client.write(
          "GET http://github.com/ HTTP/1.1\r\nHost: github.com\r\nConnection: close\r\n\r\n",
        );
      },
    );
    expect(got).toMatch(/^HTTP\/1\.1 405/);
    expect(logs).toEqual(["runner-proxy: refused GET http://github.com/: CONNECT only"]);
  });
});
