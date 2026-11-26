import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { GIT_HARDENING, remoteHardening } from "./git-hardening.mjs";

/**
 * The value `-c core.sshCommand=` is pinned to in `args`.
 *
 * @param {readonly string[]} args
 * @returns {string | undefined}
 */
function sshCommand(args) {
  const pin = args.find((arg) => arg.startsWith("core.sshCommand="));
  return pin?.slice("core.sshCommand=".length);
}

describe("remoteHardening (#866)", () => {
  it("offers the company's key and nothing of the operator's", () => {
    expect(sshCommand(remoteHardening("/c/ssh/id_ed25519"))).toBe(
      "ssh -F /dev/null -i '/c/ssh/id_ed25519' -o IdentitiesOnly=yes -o IdentityAgent=none",
    );
  });

  it("keeps every other pin as it is", () => {
    const remote = remoteHardening("/c/ssh/id_ed25519");
    expect(remote).toHaveLength(GIT_HARDENING.length);
    expect(remote.filter((arg) => !arg.startsWith("core.sshCommand="))).toEqual(
      GIT_HARDENING.filter((arg) => !arg.startsWith("core.sshCommand=")),
    );
    expect(sshCommand(GIT_HARDENING)).toBe("ssh");
  });

  it("hands the shell git runs it with the key path as one word", () => {
    const key = "/home/o p/it's/id_ed25519";
    const command = sshCommand(remoteHardening(key)) ?? "";
    // git runs core.sshCommand through `sh -c`; `printf` stands in for ssh.
    const words = spawnSync("sh", ["-c", command.replace(/^ssh/, "printf '%s\\n'")], {
      encoding: "utf8",
    }).stdout.split("\n");
    expect(words.slice(0, 4)).toEqual(["-F", "/dev/null", "-i", key]);
  });
});
