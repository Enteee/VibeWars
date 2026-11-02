/**
 * The secret files behind turn-user (#2240): what a file must be before its
 * content reaches turnadmin or a link. The userdb half runs against the real
 * server in server.test.mjs.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { files, parseSettings } from "./settings.mjs";
import { allUsers, checkSecret, mintLogin, userSecret } from "./users.mjs";

const HEX64 = "0123456789abcdef".repeat(4);

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/** Settings whose shared/ dir exists, in a temp dir. */
function temp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibewars-turn-users-"));
  dirs.push(dir);
  const s = parseSettings({
    realm: "turn.example",
    host: "turn.example",
    externalIp: null,
    externalIp6: null,
    listeningIps: [],
    listeningPort: 3478,
    tlsPort: 5349,
    relayPorts: { min: 49160, max: 49200 },
    cert: null,
    key: null,
    stateDir: path.join(dir, "state"),
    userQuota: 12,
    totalQuota: 100,
    maxBps: 100000,
    bpsCapacity: 0,
    prometheusPort: 9641,
    stunProbe: null,
  });
  fs.mkdirSync(files(s).shared, { recursive: true, mode: 0o700 });
  return s;
}

describe("checkSecret", () => {
  it("takes 64 hex digits and one trailing newline", () => {
    expect(checkSecret(HEX64)).toBe(HEX64);
    expect(checkSecret(`${HEX64}\n`)).toBe(HEX64);
  });

  it("refuses anything else, so nothing rides in on a secret", () => {
    for (const bad of [
      "",
      HEX64.slice(1),
      HEX64.toUpperCase(),
      `${HEX64}\n\n`,
      `${HEX64}\nallowed-peer-ip=10.0.0.0-10.255.255.255`,
    ]) {
      expect(() => checkSecret(bad)).toThrow(/64 hex digits/);
    }
  });
});

describe("a user's secret file", () => {
  it("is read back when it is a 0600 file of ours", () => {
    const s = temp();
    fs.writeFileSync(path.join(files(s).shared, "alice.secret"), `${HEX64}\n`, { mode: 0o600 });
    expect(userSecret(s, "alice")).toBe(HEX64);
    expect(allUsers(s)).toEqual(["alice"]);
  });

  it("is an error when malformed, never quietly replaced", () => {
    const s = temp();
    const file = path.join(files(s).shared, "alice.secret");
    fs.writeFileSync(file, `${HEX64}\nallowed-peer-ip=10.0.0.0-10.255.255.255\n`, { mode: 0o600 });
    expect(() => userSecret(s, "alice")).toThrow(/64 hex digits/);
    fs.writeFileSync(file, "");
    expect(() => userSecret(s, "alice")).toThrow(/64 hex digits/);
    expect(fs.readFileSync(file, "utf8")).toBe("");
  });

  it("is refused when others may read it, through a link, or too long", () => {
    const s = temp();
    const file = path.join(files(s).shared, "alice.secret");
    fs.writeFileSync(file, `${HEX64}\n`, { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    expect(() => userSecret(s, "alice")).toThrow(/mode 0600/);
    fs.rmSync(file);
    const elsewhere = path.join(s.stateDir, "elsewhere");
    fs.writeFileSync(elsewhere, `${HEX64}\n`, { mode: 0o600 });
    fs.symlinkSync(elsewhere, file);
    expect(() => userSecret(s, "alice")).toThrow(/ELOOP/);
    fs.rmSync(file);
    fs.writeFileSync(file, "a".repeat(300), { mode: 0o600 });
    expect(() => userSecret(s, "alice")).toThrow(/too long/);
  });
});

describe("mintLogin", () => {
  it("is coturn's REST login: <expiry>:<tag>, base64 HMAC-SHA1 of it", () => {
    const login = mintLogin(HEX64, 1_800_000_000, "x");
    expect(login.username).toBe("1800000000:x");
    expect(login.password).toBe(
      crypto.createHmac("sha1", HEX64).update("1800000000:x").digest("base64"),
    );
  });
});
