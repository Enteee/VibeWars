/**
 * Host-side file access inside a jail's writable directories (#329).
 *
 * The role directories, `.bots/bus/<role>` and `.bots/hub/<role>`, are
 * trusted: each is a bind-mount point in its jail, whose parent is
 * read-only there, so the jail cannot replace one. Everything below them is
 * the jail's: subdirectories, file names and file types. A host process
 * that writes there by path follows whatever symlink the jail planted, and
 * writes, as the operator, wherever it points.
 *
 * So a directory below a role directory is opened one component at a time,
 * each refusing a symlink, and pinned by its descriptor. Everything after
 * goes through `/proc/self/fd/<fd>/<name>`, which resolves to the directory
 * that was opened, whatever its path points to now. A file is created,
 * never reopened (O_EXCL), and never followed (O_NOFOLLOW). Linux only, as
 * the jails are.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";

const { O_APPEND, O_CREAT, O_DIRECTORY, O_EXCL, O_NOFOLLOW, O_NONBLOCK, O_RDONLY, O_WRONLY } =
  fs.constants;

/** A file or directory name the host will touch in a jail's directory. */
const NAME = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * @param {string} name
 * @returns {string} the name, if it is one a single directory can hold
 */
function checked(name) {
  if (!NAME.test(name) || name === "." || name === "..") {
    throw new Error(`jail-fs: refused name ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
function codeOf(error) {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

/** A directory in a jail, pinned by its descriptor. */
export class JailDir {
  /**
   * @param {number} fd
   * @param {string} where for messages only
   */
  constructor(fd, where) {
    this.fd = fd;
    this.where = where;
  }

  /**
   * @param {string} name
   * @returns {string}
   */
  at(name) {
    return `/proc/self/fd/${String(this.fd)}/${checked(name)}`;
  }

  /** @returns {string[]} the names in it */
  list() {
    return fs.readdirSync(`/proc/self/fd/${String(this.fd)}`);
  }

  /**
   * Write `name` whole: a fresh file under a random name, renamed over it.
   * The rename replaces a symlink at `name` without following it.
   *
   * @param {string} name
   * @param {string} contents
   * @returns {void}
   */
  writeAtomic(name, contents) {
    const target = this.at(name);
    const part = this.at(`.${randomBytes(8).toString("hex")}.part`);
    const fd = fs.openSync(part, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
    try {
      fs.writeSync(fd, contents);
    } finally {
      fs.closeSync(fd);
    }
    try {
      fs.renameSync(part, target);
    } catch (error) {
      fs.rmSync(part, { force: true });
      throw error;
    }
  }

  /**
   * Append to `name`, which must be a regular file with no other link.
   *
   * @param {string} name
   * @param {string} text
   * @returns {void}
   */
  append(name, text) {
    // O_NONBLOCK: a FIFO planted here must not hang the host.
    const fd = fs.openSync(this.at(name), O_WRONLY | O_APPEND | O_NOFOLLOW | O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1) {
        throw new Error(`jail-fs: ${this.where}/${name} is not a plain file`);
      }
      fs.writeSync(fd, text);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Make `name` an empty file, unless it already is a file.
   *
   * @param {string} name
   * @returns {void}
   */
  create(name) {
    try {
      fs.closeSync(fs.openSync(this.at(name), O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600));
    } catch (error) {
      if (codeOf(error) !== "EEXIST" || !fs.lstatSync(this.at(name)).isFile()) {
        throw error;
      }
    }
  }

  /**
   * Read `name`, a regular file of at most `maxBytes`.
   *
   * @param {string} name
   * @param {number} maxBytes
   * @returns {string}
   */
  readSmall(name, maxBytes) {
    const fd = fs.openSync(this.at(name), O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) {
        throw new Error(`jail-fs: ${this.where}/${name} is not a file`);
      }
      if (stat.size > maxBytes) {
        throw new Error(`jail-fs: ${this.where}/${name} is over ${String(maxBytes)} bytes`);
      }
      const buffer = Buffer.alloc(stat.size);
      const read = fs.readSync(fd, buffer, 0, stat.size, 0);
      return buffer.subarray(0, read).toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Remove `name`, whatever it is; a symlink goes, not what it points to.
   *
   * @param {string} name
   * @returns {void}
   */
  remove(name) {
    try {
      fs.unlinkSync(this.at(name));
    } catch (error) {
      if (codeOf(error) !== "ENOENT") {
        throw error;
      }
    }
  }

  /** @returns {void} */
  close() {
    fs.closeSync(this.fd);
  }
}

/**
 * Open `rel` below the trusted directory `root`, one component at a time,
 * refusing a symlink or anything not a directory at each. `rel` is "" for
 * `root` itself.
 *
 * @param {string} root a role directory, which no jail can replace
 * @param {string} rel e.g. "res", or "" for the role directory
 * @param {{ create?: boolean }} [options] make missing components
 * @returns {JailDir}
 */
export function openJailDir(root, rel, { create = false } = {}) {
  let fd = fs.openSync(root, O_RDONLY | O_DIRECTORY);
  try {
    for (const part of rel === "" ? [] : rel.split("/")) {
      const at = `/proc/self/fd/${String(fd)}/${checked(part)}`;
      if (create) {
        try {
          fs.mkdirSync(at);
        } catch (error) {
          if (codeOf(error) !== "EEXIST") {
            throw error;
          }
        }
      }
      const next = fs.openSync(at, O_RDONLY | O_DIRECTORY | O_NOFOLLOW);
      fs.closeSync(fd);
      fd = next;
    }
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
  return new JailDir(fd, rel === "" ? root : `${root}/${rel}`);
}

/**
 * Run `use` on a jail directory, and close it however `use` ends.
 *
 * @template T
 * @param {string} root
 * @param {string} rel
 * @param {{ create?: boolean }} options
 * @param {(dir: JailDir) => T} use
 * @returns {T}
 */
export function withJailDir(root, rel, options, use) {
  const dir = openJailDir(root, rel, options);
  try {
    return use(dir);
  } finally {
    dir.close();
  }
}
