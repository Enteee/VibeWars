/**
 * TURN users (#974, #2240): one REST secret per friend (coturn
 * `use-auth-secret`), in the SQLite userdb's secret table, managed through
 * turnadmin. coturn reads that table on each request, so adding or removing
 * a friend needs no restart. A friend's invite link carries their secret and
 * the game mints short logins from it. turnadmin keeps no names, so
 * `<stateDir>/shared/<name>.secret` maps each friend to their secret.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { files } from "./settings.mjs";

/** The user turn-check mints its logins for. turn-user list does not show it. */
export const HEALTH_USER = "health";

/** What a secret file holds: 32 random bytes, hex. */
const SECRET = /^[0-9a-f]{64}$/;
/** More than a secret and its newline: a file this long is not one. */
const MAX_SECRET_FILE = 256;
const SUFFIX = ".secret";

/**
 * @param {string} name
 * @returns {boolean}
 */
export function validName(name) {
  return /^[a-z0-9][a-z0-9_-]{0,31}$/.test(name);
}

/**
 * Whether `name` may be a friend: a valid name that is not the health user.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function friendName(name) {
  return validName(name) && name !== HEALTH_USER;
}

/** @returns {string} 32 random bytes, hex */
export function newSecret() {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * `text` as a secret, one trailing newline trimmed, or an error: never
 * anything turnadmin or a link would take as something else.
 *
 * @param {string} text
 * @returns {string}
 */
export function checkSecret(text) {
  const secret = text.endsWith("\n") ? text.slice(0, -1) : text;
  if (!SECRET.test(secret)) throw new Error("a secret file does not hold 64 hex digits");
  return secret;
}

/**
 * A coturn REST login from `secret`, valid until `expiry` (unix seconds):
 * username `<expiry>:<tag>`, credential base64(HMAC-SHA1(secret, username)).
 *
 * @param {string} secret
 * @param {number} expiry
 * @param {string} tag
 * @returns {{ username: string, password: string }}
 */
export function mintLogin(secret, expiry, tag) {
  const username = `${String(expiry)}:${tag}`;
  return {
    username,
    password: crypto.createHmac("sha1", secret).update(username).digest("base64"),
  };
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string[]} args
 * @returns {string} stdout
 */
function turnadmin(s, args) {
  fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
  // turnadmin reads a secret from argv only: a short, local call. Under
  // umask 077, so a userdb it makes is 0600 whoever runs it.
  const argv = [...args, "-r", s.realm, "-b", files(s).db];
  const res = spawnSync("sh", ["-c", 'umask 077 && exec turnadmin "$@"', "turnadmin", ...argv], {
    encoding: "utf8",
  });
  if (res.error !== undefined) throw new Error(`turnadmin: ${res.error.message}`);
  if (res.status === 127) throw new Error("turnadmin: not found (is coturn on PATH?)");
  if (res.status !== 0)
    throw new Error(`turnadmin ${String(args[0])} failed (exit ${String(res.status)})`);
  return res.stdout;
}

/**
 * The secrets turnadmin -S prints, `secret[realm]` per line, for one realm.
 *
 * @param {string} out
 * @param {string} realm
 * @returns {string[]}
 */
export function parseSecretList(out, realm) {
  /** @type {string[]} */
  const secrets = [];
  for (const line of out.split("\n")) {
    const m = /^([0-9a-f]{64})\[([^\]]*)\]$/.exec(line.trim());
    if (m !== null && m[2] === realm) secrets.push(/** @type {string} */ (m[1]));
  }
  return secrets;
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 */
function secretFile(s, name) {
  return path.join(files(s).shared, `${name}${SUFFIX}`);
}

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
    try {
      return checkSecret(buf.subarray(0, n).toString("utf8"));
    } catch (e) {
      throw new Error(`${file}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Creates `file` at 0600 holding `secret`, never over an existing file or
 * through a link: EEXIST when it is there.
 *
 * @param {string} file
 * @param {string} secret
 */
function createSecretFile(file, secret) {
  const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = fs.constants;
  const fd = fs.openSync(file, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
  try {
    fs.writeSync(fd, `${checkSecret(secret)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** @param {import("./settings.mjs").TurnSettings} s */
function sharedDir(s) {
  fs.mkdirSync(s.stateDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(files(s).shared, { recursive: true, mode: 0o700 });
}

/**
 * @param {unknown} e
 * @param {string} code
 */
function isCode(e, code) {
  return e instanceof Error && "code" in e && e.code === code;
}

/**
 * Every user of this realm, the health user included, by their secret file.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string[]}
 */
export function allUsers(s) {
  /** @type {string[]} */
  let names;
  try {
    names = fs.readdirSync(files(s).shared);
  } catch (e) {
    if (isCode(e, "ENOENT")) return [];
    throw e;
  }
  return names
    .filter((n) => n.endsWith(SUFFIX))
    .map((n) => n.slice(0, -SUFFIX.length))
    .filter(validName)
    .sort();
}

/**
 * `name`'s secret, from their file.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 * @returns {string}
 */
export function userSecret(s, name) {
  return readSecretFile(secretFile(s, name));
}

/**
 * Adds `name` with a new secret, in their file and the userdb.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 * @returns {string} the secret
 */
export function addUser(s, name) {
  sharedDir(s);
  const secret = newSecret();
  const file = secretFile(s, name);
  createSecretFile(file, secret);
  try {
    turnadmin(s, ["-s", secret]);
  } catch (e) {
    fs.rmSync(file);
    throw e;
  }
  return secret;
}

/**
 * Gives `name` a new secret: the new one is in the userdb before the old one
 * leaves it, and the file is replaced by a rename, so a crash leaves one of
 * the two.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 * @returns {string} the new secret
 */
export function relinkUser(s, name) {
  const file = secretFile(s, name);
  const old = readSecretFile(file);
  const secret = newSecret();
  const tmp = `${file}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  createSecretFile(tmp, secret);
  turnadmin(s, ["-s", secret]);
  fs.renameSync(tmp, file);
  turnadmin(s, ["-X", old]);
  return secret;
}

/**
 * Removes `name`'s secret from the userdb, then their file. No login from
 * it works after; a relay already open on one runs on until it ends.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} name
 */
export function removeUser(s, name) {
  const file = secretFile(s, name);
  turnadmin(s, ["-X", readSecretFile(file)]);
  fs.rmSync(file);
}

/**
 * The secrets of `listed` (the userdb's, for this realm) that no file in
 * shared/ holds: what a turnadmin -X that failed left behind, with no name
 * to remove it by. A pending turn-link's temp file counts as holding its
 * secret. A file that is not a secret is an error, so nothing is revoked
 * on a guess.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string[]} listed
 * @returns {string[]}
 */
export function orphanSecrets(s, listed) {
  sharedDir(s);
  const dir = files(s).shared;
  const held = new Set(fs.readdirSync(dir).map((n) => readSecretFile(path.join(dir, n))));
  return listed.filter((secret) => !held.has(secret));
}

/**
 * Revokes every orphan secret (see orphanSecrets). turn-user and turn-link
 * run it first, so a revoke that failed is finished by the next command.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {number} how many it revoked
 */
export function reconcileUsers(s) {
  const orphans = orphanSecrets(s, parseSecretList(turnadmin(s, ["-S"]), s.realm));
  for (const secret of orphans) turnadmin(s, ["-X", secret]);
  return orphans.length;
}

/**
 * The health user's secret, made the first time and put back into the
 * userdb when it lost it. Two first makes racing end with the same secret:
 * the loser reads the winner's file.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {string}
 */
export function healthSecret(s) {
  sharedDir(s);
  const file = secretFile(s, HEALTH_USER);
  let secret;
  try {
    secret = readSecretFile(file);
  } catch (e) {
    if (!isCode(e, "ENOENT")) throw e;
    secret = newSecret();
    try {
      createSecretFile(file, secret);
    } catch (made) {
      if (!isCode(made, "EEXIST")) throw made;
      secret = readSecretFile(file);
    }
  }
  if (!parseSecretList(turnadmin(s, ["-S"]), s.realm).includes(secret))
    turnadmin(s, ["-s", secret]);
  return secret;
}
