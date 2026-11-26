/**
 * PATH without nix shells' entries, so a reboot's devenv shell does not
 * nest inside the last one and grow PATH past what tmux accepts.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { hostPath, uniquePath } from "./host-path.mjs";

const HOST_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "host-path.mjs");

const NODE = "/nix/store/aaa-nodejs-24/bin";
const TMUX = "/nix/store/bbb-tmux-3.7c/bin";
const HOST = ["/run/wrappers/bin", "/etc/profiles/per-user/ente/bin", "/run/current-system/sw/bin"];

describe("uniquePath", () => {
  it("keeps each entry once, in first-seen order", () => {
    expect(uniquePath([NODE, TMUX, ...HOST, NODE, TMUX, ...HOST].join(":"))).toBe(
      [NODE, TMUX, ...HOST].join(":"),
    );
  });

  it("drops empty entries", () => {
    expect(uniquePath(`:${NODE}::${TMUX}:`)).toBe(`${NODE}:${TMUX}`);
  });
});

describe("hostPath", () => {
  it("drops the store entries a devenv shell prepends", () => {
    expect(hostPath([NODE, TMUX, ...HOST].join(":"))).toBe(HOST.join(":"));
  });

  it("is the same however many shells were nested", () => {
    const once = [NODE, TMUX, ...HOST].join(":");
    const thrice = [NODE, TMUX, NODE, TMUX, "/repo/node_modules/.bin", once].join(":");
    expect(hostPath(thrice)).toBe(["/repo/node_modules/.bin", ...HOST].join(":"));
    expect(hostPath(hostPath(thrice))).toBe(hostPath(thrice));
  });

  it("prints the host PATH when run", () => {
    const result = spawnSync(process.execPath, [HOST_PATH], {
      env: { PATH: [NODE, ...HOST, TMUX, HOST[0]].join(":") },
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${HOST.join(":")}\n`);
  });
});
