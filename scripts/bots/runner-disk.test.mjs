import { describe, expect, it } from "vitest";

import { RUNNER_IMAGE, setUpRunnerDisk } from "./runner-disk.mjs";
import { diskCapRefusal } from "./runner-supervisor.mjs";

const SCRATCH = "/state/runners";
const SHARED = ["/bots", "/home"];
const MOUNT = ["sudo", "mount", "-o", "loop", RUNNER_IMAGE, SCRATCH];
const AFTER_IMAGE = [
  ["mkdir", "-p", SCRATCH],
  MOUNT,
  ["sudo", "chown", "1000:100", SCRATCH],
  ["chmod", "700", SCRATCH],
];
const ALL_STEPS = [
  ["sudo", "truncate", "-s", "64G", RUNNER_IMAGE],
  ["sudo", "chmod", "600", RUNNER_IMAGE],
  ["sudo", "mkfs.ext4", "-q", "-F", RUNNER_IMAGE],
  ...AFTER_IMAGE,
];

/**
 * Runs the step against a fake host: a successful `mount` gives scratch its
 * own device, as the real one does.
 *
 * @param {object} [options]
 * @param {number} [options.cap]
 * @param {string[]} [options.answers]
 * @param {boolean} [options.mounted] scratch already has its own filesystem
 * @param {boolean} [options.canAsk]
 * @param {boolean} [options.nixos]
 * @param {boolean} [options.imageExists]
 * @param {string[] | null} [options.entries]
 * @param {string | null} [options.fstab]
 * @param {number} [options.type] the `statfs` magic of scratch
 * @param {string} [options.failing] the command, after sudo, that exits 1
 */
async function setUp({
  cap = 4,
  answers = [],
  mounted = false,
  canAsk = true,
  nixos = false,
  imageExists = false,
  entries = [],
  fstab = "",
  type = 0xef53,
  failing = "",
} = {}) {
  /** @type {string[][]} */
  const ran = [];
  /** @type {string[]} */
  const inputs = [];
  /** @type {string[]} */
  const asked = [];
  /** @type {string[]} */
  const said = [];
  let checks = 0;
  let scratchDev = mounted ? 3 : 1;
  await setUpRunnerDisk({
    cap,
    scratch: SCRATCH,
    shared: SHARED,
    refusal: (scratch, shared, stat) => {
      checks += 1;
      return diskCapRefusal(scratch, shared, stat);
    },
    host: {
      stat: (file) => ({ dev: file === SCRATCH ? scratchDev : 1 }),
      statfs: () => ({ type, bsize: 4096, blocks: 16 * 1024 * 1024 }),
      run: (argv, input) => {
        ran.push(argv);
        if (input !== undefined) {
          inputs.push(input);
        }
        if ((argv[0] === "sudo" ? argv[1] : argv[0]) === failing) {
          return { code: 1 };
        }
        if (argv[1] === "mount") {
          scratchDev = 3;
        }
        return { code: 0 };
      },
      ask: (question) => {
        asked.push(question);
        return Promise.resolve(answers.shift() ?? "");
      },
      say: (line) => {
        said.push(line);
      },
      canAsk,
      nixos,
      exists: () => imageExists,
      entries: () => entries,
      fstab: () => fstab,
      uid: 1000,
      gid: 100,
    },
  });
  return { ran, inputs, asked, said: said.join("\n"), checks };
}

describe("the runner disk step of claude-llc-init (#2766)", () => {
  it("says one line and asks nothing when scratch has its own filesystem", async () => {
    const { ran, asked, said } = await setUp({ mounted: true });
    expect(said).toBe(`  runner disk: ${SCRATCH} (ext4, 64 GiB)`);
    expect(asked).toEqual([]);
    expect(ran).toEqual([]);
  });

  it("does no check at all at cap 0", async () => {
    const { checks, said } = await setUp({ cap: 0 });
    expect(checks).toBe(0);
    expect(said).toBe("");
  });

  it("prints the manual steps on no, and runs nothing", async () => {
    const { ran, said } = await setUp({ answers: ["n"] });
    expect(ran).toEqual([]);
    expect(said).toContain("Runners stay off");
    expect(said).toContain(`sudo mount -o loop ${RUNNER_IMAGE} ${SCRATCH}`);
  });

  it("treats no tty or no sudo as no, without asking", async () => {
    const { ran, asked, said } = await setUp({ canAsk: false });
    expect(asked).toEqual([]);
    expect(ran).toEqual([]);
    expect(said).toContain("Runners stay off");
  });

  it("on yes runs and prints the exact commands in order, then checks again", async () => {
    const { ran, said, checks } = await setUp({ answers: ["y", ""], nixos: true });
    expect(ran).toEqual(ALL_STEPS);
    for (const step of ALL_STEPS) {
      expect(said).toContain(`  $ ${step.join(" ")}`);
    }
    expect(checks).toBe(2);
    expect(said).toContain(`runner disk: ${SCRATCH} (ext4, 64 GiB)`);
  });

  it("asks the size again until it is whole and at least 8", async () => {
    const { ran, asked } = await setUp({ answers: ["y", "4", "1.5", "128"], nixos: true });
    expect(asked).toHaveLength(4);
    expect(ran[0]).toEqual(["sudo", "truncate", "-s", "128G", RUNNER_IMAGE]);
  });

  it("neither truncates nor formats an image that exists", async () => {
    const { ran, asked } = await setUp({ answers: ["y"], imageExists: true, nixos: true });
    expect(ran).toEqual(AFTER_IMAGE);
    expect(asked[0]).toContain("Mount the existing disk image");
  });

  it("does not mount over a non-empty directory", async () => {
    const { ran, asked, said } = await setUp({ entries: ["left-behind"] });
    expect(asked).toEqual([]);
    expect(ran).toEqual([]);
    expect(said).toContain("does not mount over it");
  });

  it("stops at a failed mount and prints the rest as manual steps", async () => {
    const { ran, said, checks } = await setUp({ answers: ["y", ""], failing: "mount" });
    expect(ran).toEqual(ALL_STEPS.slice(0, 5));
    expect(checks).toBe(1);
    const manual = said.slice(said.indexOf("That failed"));
    expect(manual).toContain(`sudo mount -o loop ${RUNNER_IMAGE} ${SCRATCH}`);
    expect(manual).toContain(`chmod 700 ${SCRATCH}`);
    expect(manual).not.toContain("truncate");
  });

  it("on NixOS prints the fileSystems snippet and leaves fstab alone", async () => {
    const { ran, asked, said } = await setUp({ answers: ["y", ""], nixos: true });
    expect(said).toContain(
      `fileSystems."${SCRATCH}" = { device = "${RUNNER_IMAGE}"; fsType = "ext4"; options = [ "loop" "nofail" ]; };`,
    );
    expect(said).toContain("gone after a reboot");
    expect(asked).toHaveLength(2);
    expect(ran.flat()).not.toContain("/etc/fstab");
  });

  it("elsewhere appends to fstab through sudo on yes", async () => {
    const { ran, inputs, said } = await setUp({ answers: ["y", "", "y"] });
    expect(ran.at(-1)).toEqual(["sudo", "tee", "-a", "/etc/fstab"]);
    expect(inputs).toEqual([`${RUNNER_IMAGE} ${SCRATCH} ext4 loop,nofail 0 0\n`]);
    expect(said).toContain("$ sudo tee -a /etc/fstab");
  });

  it("does not offer fstab when it already lists scratch", async () => {
    const { ran, asked } = await setUp({
      answers: ["y", ""],
      fstab: `# a comment\n${RUNNER_IMAGE} ${SCRATCH} ext4 loop 0 2\n`,
    });
    expect(asked).toHaveLength(2);
    expect(ran).toEqual(ALL_STEPS);
  });

  it("goes on when scratch cannot be read, and mounts nothing", async () => {
    const { ran, asked, said } = await setUp({ entries: null });
    expect(asked).toEqual([]);
    expect(ran).toEqual([]);
    expect(said).toContain("does not mount over it");
    expect(said).toContain("Runners stay off");
  });

  it("goes on when fstab cannot be read, and prints the line", async () => {
    const { ran, said } = await setUp({ answers: ["y", ""], fstab: null });
    expect(ran).toEqual(ALL_STEPS);
    expect(said).toContain(`${RUNNER_IMAGE} ${SCRATCH} ext4 loop,nofail 0 0`);
    expect(said).toContain("gone after a reboot");
  });

  it("says the quota is still the operator's part on a pooled filesystem", async () => {
    const { said } = await setUp({ mounted: true, type: 0x9123683e });
    expect(said).toContain("btrfs");
    expect(said).toContain("quota is still your part");
  });
});
