import { describe, expect, it } from "vitest";

import { askHibernate } from "./hub-sleep-init.mjs";

/**
 * @param {object} options
 * @param {string[]} [options.answers] in the order asked
 * @param {Partial<import("./hub-sleep-init.mjs").HibernateHost>} [options.host]
 * @param {string} [options.failing] the command, after sudo, that exits 1
 */
function harness({ answers = [], host = {}, failing }) {
  /** @type {string[][]} */
  const ran = [];
  /** @type {string[]} */
  const said = [];
  const left = [...answers];
  /** @type {import("./hub-sleep-init.mjs").HibernateHost} */
  const stub = {
    run: (argv) => {
      ran.push(argv);
      return { code: argv[1] === failing ? 1 : 0 };
    },
    ask: (question) => {
      said.push(question);
      return Promise.resolve(left.shift() ?? "");
    },
    say: (line) => said.push(line),
    canAsk: true,
    nixos: false,
    mainRev: () => "c9f0b10aa",
    hasModuleAt: () => true,
    prefetch: () => "0abc",
    user: "ente",
    canHibernate: () => "yes",
    hasWakeAlarm: () => true,
    unitsInstalled: () => false,
    awaySeconds: () => Promise.resolve(400),
    ...host,
  };
  return { ran, said, host: stub };
}

describe("claude-llc-init's hibernation step (#2794)", () => {
  it("gives null and runs nothing on no, or with no tty", async () => {
    const no = harness({ answers: ["n"] });
    await expect(askHibernate({ previous: {}, host: no.host })).resolves.toBeNull();
    expect(no.ran).toEqual([]);
    const noTty = harness({ host: { canAsk: false } });
    await expect(askHibernate({ previous: {}, host: noTty.host })).resolves.toBeNull();
    expect(noTty.ran).toEqual([]);
  });

  it.each([
    ["logind says no", { canHibernate: () => "no" }],
    ["there is no wake alarm", { hasWakeAlarm: () => false }],
  ])("runs no sudo when %s", async (_name, host) => {
    const h = harness({ answers: ["y"], host });
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toBeNull();
    expect(h.ran).toEqual([]);
  });

  it("prints every root command before it runs, and suggests a margin from the test", async () => {
    const h = harness({ answers: ["y", "", "y", ""] });
    // 400 s away is 100 s past the alarm: 2 min, plus 2, at least 5.
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toEqual({
      wakeMarginMinutes: 5,
    });
    for (const argv of h.ran) {
      expect(h.said).toContain(`  $ ${argv.join(" ")}`);
    }
    expect(h.ran.at(-2)).toEqual(["sudo", "rtcwake", "-m", "no", "-s", "300"]);
    expect(h.ran.at(-1)).toEqual(["sudo", "systemctl", "hibernate"]);
  });

  it("suggests the time the wake took over the alarm, and stores the answer", async () => {
    const long = harness({
      answers: ["y", "", "y", ""],
      host: { awaySeconds: () => Promise.resolve(301 + 8 * 60) },
    });
    await expect(askHibernate({ previous: {}, host: long.host })).resolves.toEqual({
      wakeMarginMinutes: 11,
    });
    const typed = harness({ answers: ["y", "", "y", "99", "12"] });
    await expect(askHibernate({ previous: {}, host: typed.host })).resolves.toEqual({
      wakeMarginMinutes: 12,
    });
  });

  it("prints the module import, pinned to main's commit and hash, on NixOS and runs no sudo", async () => {
    /** @type {string[]} */
    const prefetched = [];
    const h = harness({
      answers: ["y"],
      host: {
        nixos: true,
        prefetch: (url) => {
          prefetched.push(url);
          return "0abc";
        },
      },
    });
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toBeNull();
    expect(h.ran).toEqual([]);
    const url = "https://github.com/Enteee/VibeWars/archive/c9f0b10aa.tar.gz";
    expect(prefetched).toEqual([url]);
    const said = h.said.join("\n");
    expect(said).toContain(
      [
        '    imports = [ "${builtins.fetchTarball {',
        `      url = "${url}";`,
        '      sha256 = "0abc";',
        '    }}/nix/nixos/vibewars-sleep.nix" ];',
        '    services.vibewars-sleep = { enable = true; user = "ente"; };',
      ].join("\n"),
    );
    expect(said).toContain(
      'url = "git+https://github.com/Enteee/VibeWars?ref=main&rev=c9f0b10aa"; flake = false;',
    );
    expect(said).toContain('import "${inputs.vibewars}/nix/nixos/vibewars-sleep.nix"');
    expect(said).not.toContain("systemd.paths");
    expect(said).not.toMatch(/imports = \[ \//);
  });

  it.each([
    ["main cannot be fetched", { mainRev: () => null }, "Could not fetch main"],
    ["main has no module yet", { hasModuleAt: () => false }, "has no nix/nixos/vibewars-sleep.nix"],
    ["the prefetch fails", { prefetch: () => null }, "nix-prefetch-url --unpack"],
  ])("stays off on NixOS when %s, and prints no import", async (_name, host, message) => {
    const h = harness({ answers: ["y"], host: { nixos: true, ...host } });
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toBeNull();
    const said = h.said.join("\n");
    expect(said).toContain(message);
    expect(said).not.toContain("imports");
  });

  it("stays off and says how when sudo fails", async () => {
    const h = harness({ answers: ["y"], failing: "tee" });
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toBeNull();
    expect(h.ran).toEqual([
      ["sudo", "mkdir", "-p", "/usr/local/libexec"],
      ["sudo", "tee", "/usr/local/libexec/vibewars-sleep"],
    ]);
    expect(h.said.join("\n")).toContain("by hand");
  });

  it("stays off when it did not wake and the answer is no", async () => {
    const h = harness({ answers: ["y", "", "n", ""] });
    await expect(askHibernate({ previous: {}, host: h.host })).resolves.toBeNull();
  });

  it("enables an unproven wake only on an explicit yes", async () => {
    const no = harness({ answers: ["y", "n", ""] });
    await expect(askHibernate({ previous: {}, host: no.host })).resolves.toBeNull();
    const yes = harness({ answers: ["y", "n", "y"] });
    await expect(askHibernate({ previous: {}, host: yes.host })).resolves.toEqual({
      wakeMarginMinutes: 5,
    });
  });

  it("keeps the value on Enter in a re-run, repeating nothing", async () => {
    for (const hibernate of [{ wakeMarginMinutes: 9 }, null]) {
      const h = harness({ answers: [""] });
      await expect(askHibernate({ previous: { hibernate }, host: h.host })).resolves.toEqual(
        hibernate,
      );
      expect(h.ran).toEqual([]);
    }
  });
});
