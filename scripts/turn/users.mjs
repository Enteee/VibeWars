/**
 * TURN users (#974): one long-term credential per friend in coturn's SQLite
 * userdb, managed through turnadmin. The userdb holds only the key,
 * MD5(user:realm:password); the password is printed once and kept nowhere,
 * except the health user's, which turn-check needs every time.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import process from "node:process";

import { checkSharedSecret, files } from "./settings.mjs";

/** The user turn-check allocates as. turn-user list does not show it. */
export const HEALTH_USER = "vibewars-health";

/**
 * @param {string} name
 * @returns {boolean}
 */
export function validName(name) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name);
}

/** 24 random bytes, base64url. */
export function newPassword() {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string[]} args
 * @returns {string} stdout
 */
function turnadmin(s, args) {
  fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
  const res = spawnSync("turnadmin", [...args, "-b", files(s).db], { encoding: "utf8" });
  if (res.error !== undefined)
    throw new Error(`turnadmin: ${res.error.message} (is coturn on PATH?)`);
  if (res.status !== 0)
    throw new Error(`turnadmin ${String(args[0])} failed (exit ${String(res.status)})`);
  return res.stdout;
}

/**
 * Adds the user, or sets a new password for one that exists.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 * @param {string} password
 */
export function setUser(s, name, password) {
  turnadmin(s, ["-a", "-u", name, "-r", s.realm, "-p", password]);
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 */
export function removeUser(s, name) {
  turnadmin(s, ["-d", "-u", name, "-r", s.realm]);
}

/**
 * Every user of this realm, the health user included.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string[]}
 */
export function allUsers(s) {
  return parseUserList(turnadmin(s, ["-l"]), s.realm);
}

/**
 * The users turnadmin -l prints, `name[realm]` per line, for one realm.
 *
 * @param {string} out
 * @param {string} realm
 * @returns {string[]}
 */
export function parseUserList(out, realm) {
  /** @type {string[]} */
  const names = [];
  for (const line of out.split("\n")) {
    const m = /^(\S+)\[([^\]]*)\]$/.exec(line.trim());
    if (m !== null && m[2] === realm) names.push(/** @type {string} */ (m[1]));
  }
  return names.sort();
}

/**
 * The health user's password, creating the user and its secret file
 * (mode 0600) the first time, and re-adding the user when the userdb lost it.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string}
 */
export function healthPassword(s) {
  const file = files(s).healthSecret;
  let password;
  try {
    password = fs.readFileSync(file, "utf8").trim();
  } catch {
    password = "";
  }
  if (password === "") {
    password = newPassword();
    fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, `${password}\n`, { mode: 0o600 });
    setUser(s, HEALTH_USER, password);
  } else if (!allUsers(s).includes(HEALTH_USER)) {
    setUser(s, HEALTH_USER, password);
  }
  return password;
}

/** More than a secret and its newline: a file this long is not one. */
const MAX_SECRET_FILE = 256;

/**
 * Reads a secret file without following a link, and only when it is a
 * regular file of ours that nobody else may read.
 *
 * @param {string} file
 * @returns {string}
 */
function readSecretFile(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.uid !== process.getuid?.() || (st.mode & 0o077) !== 0) {
      throw new Error(`${file} must be a regular file of yours, mode 0600`);
    }
    const buf = Buffer.alloc(MAX_SECRET_FILE + 1);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n > MAX_SECRET_FILE) throw new Error(`${file} is too long for a secret`);
    return checkSharedSecret(buf.subarray(0, n).toString("utf8"));
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Creates `file` at 0600 with `secret`, never over an existing file or
 * through a link: EEXIST when it is there.
 *
 * @param {string} file
 * @param {string} secret
 */
function createSecretFile(file, secret) {
  const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
  const fd = fs.openSync(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
  try {
    fs.writeSync(fd, `${secret}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** @returns {string} 32 random bytes, hex */
function newSharedSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * The shared relay's secret (#2240, coturn use-auth-secret), created the
 * first time it is needed. A malformed file is an error, never replaced:
 * a new secret would kill every host's offers without a word. Two first
 * creates racing end with the same secret: the loser reads the winner's.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string}
 */
export function sharedSecret(s) {
  const file = files(s).sharedSecret;
  fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
  try {
    return readSecretFile(file);
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "ENOENT")) throw e;
  }
  const secret = newSharedSecret();
  try {
    createSecretFile(file, secret);
    return secret;
  } catch (e) {
    if (!(e instanceof Error && "code" in e && e.code === "EEXIST")) throw e;
    return readSecretFile(file);
  }
}

/**
 * A new shared secret, written to a 0600 temp file and renamed over the
 * old one, so a crash mid-rotate leaves the old secret or the new one.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string}
 */
export function rotateSharedSecret(s) {
  const file = files(s).sharedSecret;
  const secret = checkSharedSecret(newSharedSecret());
  fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${String(process.pid)}.tmp`;
  fs.rmSync(tmp, { force: true });
  createSecretFile(tmp, secret);
  fs.renameSync(tmp, file);
  return secret;
}
