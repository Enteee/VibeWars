/**
 * `claude-llc-init`'s runner disk step (#2766, ADR-0045): run the
 * supervisor's own disk-cap check and, with the operator's explicit yes and
 * sudo password, set the cap up. Every command is printed before it runs.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";

import { gib } from "./disk.mjs";

export const RUNNER_IMAGE = "/var/lib/vibewars-runners.img";
const DEFAULT_GIB = 64;
const MIN_GIB = 8;
const FSTAB = "/etc/fstab";

/** `statfs` magic numbers of the filesystems a scratch disk is likely to be. */
const FS_NAMES = new Map([
  [0xef53, "ext4"],
  [0x58465342, "xfs"],
  [0x01021994, "tmpfs"],
  [0x9123683e, "btrfs"],
  [0x2fc12fc1, "zfs"],
]);

/** Pooled: passing the device check proves no quota (ADR-0045). */
const POOLED = new Set(["btrfs", "zfs"]);

/**
 * @typedef {object} RunnerDiskHost
 * @property {(file: string) => { dev: number }} stat
 * @property {(dir: string) => { type: number, bsize: number, blocks: number }} statfs
 * @property {(argv: string[], input?: string) => { code: number }} run
 * @property {(question: string) => Promise<string>} ask
 * @property {(line: string) => void} say
 * @property {boolean} canAsk stdin is a tty and sudo is on PATH
 * @property {boolean} nixos
 * @property {(file: string) => number | null} imageBytes a file's size, null if it is missing
 * @property {(dir: string) => string[] | null} entries a directory's names, none if it is missing, null if it cannot be read
 * @property {() => string | null} fstab null if it cannot be read
 * @property {number} uid
 * @property {number} gid
 */

/**
 * @param {Pick<typeof process, "stdin" | "getuid" | "getgid">} proc
 * @param {(question: string) => Promise<string>} ask
 * @param {(line: string) => void} say
 * @returns {RunnerDiskHost}
 */
export function realRunnerDiskHost(proc, ask, say) {
  return {
    stat: fs.statSync,
    statfs: (dir) => fs.statfsSync(dir),
    run: (argv, input) => {
      const [command = "", ...args] = argv;
      const result = spawnSync(command, args, {
        input,
        // tee echoes what it appends; sudo asks on the terminal.
        stdio: input === undefined ? "inherit" : ["pipe", "ignore", "inherit"],
      });
      return { code: result.status ?? 1 };
    },
    ask,
    say,
    canAsk: proc.stdin.isTTY && spawnSync("sudo", ["--version"], { stdio: "ignore" }).status === 0,
    nixos: fs.existsSync("/etc/NIXOS"),
    imageBytes: (file) => (fs.existsSync(file) ? fs.statSync(file).size : null),
    entries: (dir) => {
      if (!fs.existsSync(dir)) {
        return [];
      }
      try {
        return fs.readdirSync(dir);
      } catch {
        return null;
      }
    },
    fstab: () => {
      try {
        return fs.readFileSync(FSTAB, "utf8");
      } catch {
        return null;
      }
    },
    uid: proc.getuid?.() ?? 0,
    gid: proc.getgid?.() ?? 0,
  };
}

/**
 * A command as the operator could paste it.
 *
 * @param {readonly string[]} argv
 * @returns {string}
 */
function shown(argv) {
  return argv
    .map((arg) => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", `'\\''`)}'`))
    .join(" ");
}

/**
 * @param {string} scratch
 * @param {string} image
 * @param {number} size GiB
 * @param {number | null} imageBytes the image's size if it exists
 * @param {{ uid: number, gid: number }} owner
 * @returns {string[][]} the root steps, in order
 */
function setupSteps(scratch, image, size, imageBytes, { uid, gid }) {
  return [
    // Reserved, not sparse: a sparse image lets a job fill the host disk past
    // its free space, which is what the cap is for. mkfs would punch the
    // reservation back out without nodiscard.
    ...(imageBytes !== null
      ? [["sudo", "fallocate", "-l", String(imageBytes), image]]
      : [
          ["sudo", "fallocate", "-l", `${String(size)}G`, image],
          // Root's 0644 would let any local user read the runners' scratch.
          ["sudo", "chmod", "600", image],
          ["sudo", "mkfs.ext4", "-q", "-F", "-E", "nodiscard", image],
        ]),
    ["mkdir", "-p", scratch],
    ["sudo", "mount", "-o", "loop,nosuid,nodev", image, scratch],
    ["sudo", "chown", `${String(uid)}:${String(gid)}`, scratch],
    ["chmod", "700", scratch],
  ];
}

/**
 * @param {RunnerDiskHost} host
 * @returns {Promise<number>} the image size in GiB
 */
async function askSize(host) {
  for (;;) {
    const answer = (await host.ask(`  Size in GiB [${String(DEFAULT_GIB)}]: `)).trim();
    if (answer === "") {
      return DEFAULT_GIB;
    }
    if (/^\d{1,6}$/.test(answer) && Number(answer) >= MIN_GIB) {
      return Number(answer);
    }
    host.say(`  A whole number of GiB, ${String(MIN_GIB)} or more, please.`);
  }
}

/**
 * @param {RunnerDiskHost} host
 * @param {readonly string[][]} steps
 */
function sayManual(host, steps) {
  host.say("  Runners stay off until scratch is a filesystem of its own. To set it up by hand:");
  for (const step of steps) {
    host.say(`    ${shown(step)}`);
  }
}

/**
 * The passing line, and the warning a pooled filesystem needs.
 *
 * @param {RunnerDiskHost} host
 * @param {string} scratch
 */
function sayPassed(host, scratch) {
  const { type, bsize, blocks } = host.statfs(scratch);
  const name = FS_NAMES.get(type) ?? `0x${type.toString(16)}`;
  host.say(`  runner disk: ${scratch} (${name}, ${gib(bsize * blocks)} GiB)`);
  if (POOLED.has(name)) {
    host.say(`  ${name} shares its pool: giving ${scratch} a quota is still your part (ADR-0045).`);
  }
}

/**
 * Make the mount survive a reboot: printed on NixOS, whose fstab is
 * generated, and offered through sudo elsewhere.
 *
 * @param {RunnerDiskHost} host
 * @param {string} scratch
 * @param {string} image
 */
async function persist(host, scratch, image) {
  if (host.nixos) {
    host.say("  This mount is gone after a reboot until you add this and rebuild:");
    host.say(
      `    fileSystems."${scratch}" = { device = "${image}"; fsType = "ext4"; options = [ "loop" "nofail" "nosuid" "nodev" "X-fstrim.notrim" ]; };`,
    );
    return;
  }
  const mountPoint = scratch.replaceAll(" ", "\\040");
  // nofail: a missing image must not stop the host booting for an optional disk.
  // X-fstrim.notrim: a periodic fstrim would punch holes in the image and wear down its reservation.
  const entry = `${image.replaceAll(" ", "\\040")} ${mountPoint} ext4 loop,nofail,nosuid,nodev,X-fstrim.notrim 0 0`;
  const fstab = host.fstab();
  if (fstab === null) {
    host.say(`  Cannot read ${FSTAB}: this mount is gone after a reboot until it has this line:`);
    host.say(`    ${entry}`);
    return;
  }
  const listed = fstab
    .split("\n")
    .some(
      (line) => !line.trimStart().startsWith("#") && line.trim().split(/\s+/)[1] === mountPoint,
    );
  if (listed) {
    return;
  }
  const answer = await host.ask(`  Append "${entry}" to ${FSTAB}? [y/N] `);
  if (answer.trim().toLowerCase() !== "y") {
    host.say(`  This mount is gone after a reboot until ${FSTAB} has that line.`);
    return;
  }
  const argv = ["sudo", "tee", "-a", FSTAB];
  host.say(`  $ ${shown(argv)}`);
  if (host.run(argv, `${entry}\n`).code !== 0) {
    host.say(`  That failed: this mount is gone after a reboot until ${FSTAB} has that line.`);
  }
}

/**
 * Check the runners' disk cap and offer to set it up. Whatever happens here,
 * init goes on: a missing cap only keeps the runners off.
 *
 * @param {object} options
 * @param {number} options.cap the most runners on this machine; 0 skips all of this
 * @param {string} options.scratch
 * @param {readonly string[]} options.shared
 * @param {(scratch: string, shared: readonly string[], stat: RunnerDiskHost["stat"]) => string | null} options.refusal
 * @param {RunnerDiskHost} options.host
 * @param {string} [options.image]
 * @returns {Promise<void>}
 */
export async function setUpRunnerDisk({
  cap,
  scratch,
  shared,
  refusal,
  host,
  image = RUNNER_IMAGE,
}) {
  if (cap === 0) {
    return;
  }
  const refused = refusal(scratch, shared, host.stat);
  if (refused === null) {
    sayPassed(host, scratch);
    return;
  }
  host.say(`  ${refused}`);

  const imageBytes = host.imageBytes(image);
  const defaults = setupSteps(scratch, image, DEFAULT_GIB, imageBytes, host);
  const entries = host.entries(scratch);
  if (entries === null || entries.length > 0) {
    host.say(
      `  ${scratch} is ${entries === null ? "not a directory init can read" : "not empty"}, and init does not mount over it.`,
    );
    sayManual(host, defaults);
    return;
  }
  if (!host.canAsk) {
    sayManual(host, defaults);
    return;
  }
  const question =
    imageBytes !== null
      ? `  Mount the existing disk image ${image} at ${scratch}? [y/N] `
      : `  Create a disk image for the runners at ${image} and mount it at ${scratch}? [y/N] `;
  if ((await host.ask(question)).trim().toLowerCase() !== "y") {
    sayManual(host, defaults);
    return;
  }

  const size = imageBytes !== null ? DEFAULT_GIB : await askSize(host);
  const steps = setupSteps(scratch, image, size, imageBytes, host);
  for (const [index, step] of steps.entries()) {
    host.say(`  $ ${shown(step)}`);
    if (host.run(step).code !== 0) {
      host.say("  That failed.");
      sayManual(host, steps.slice(index));
      return;
    }
  }

  const still = refusal(scratch, shared, host.stat);
  if (still !== null) {
    host.say(`  ${still}`);
    host.say("  Runners stay off.");
    return;
  }
  sayPassed(host, scratch);
  await persist(host, scratch, image);
}
