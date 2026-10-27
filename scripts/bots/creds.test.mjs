import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  claudeIdentity,
  ensureHome,
  githubIdentity,
  isOperators,
  modeOk,
  paths,
  pushIdentity,
  telegramIdentity,
} from "./creds.mjs";

const SECRET = "value-that-must-never-be-printed";

function home() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "creds-"));
}

describe("paths", () => {
  it("lays the home out as #855 gives it", () => {
    const p = paths("/c");
    expect(p.claudeCredentials).toBe("/c/claude/.credentials.json");
    expect(p.ghHosts).toBe("/c/gh/hosts.yml");
    expect(p.sshKey).toBe("/c/ssh/id_ed25519");
    expect(p.telegram).toBe("/c/telegram-manager-token");
  });
});

describe("modeOk", () => {
  it("accepts owner-only modes and refuses any group or other bit", () => {
    expect(modeOk({ mode: 0o40700 })).toBe(true);
    expect(modeOk({ mode: 0o100600 })).toBe(true);
    expect(modeOk({ mode: 0o40750 })).toBe(false);
    expect(modeOk({ mode: 0o40705 })).toBe(false);
  });
});

describe("isOperators", () => {
  it("compares case-insensitively", () => {
    expect(isOperators("Acme-Bot", "acme-bot")).toBe(true);
    expect(isOperators("acme-bot", "alice")).toBe(false);
  });

  it("cannot tell when either side is unknown", () => {
    expect(isOperators(null, "alice")).toBeNull();
    expect(isOperators("bot", null)).toBeNull();
  });
});

describe("claudeIdentity", () => {
  it("is not set up without a credentials file", () => {
    expect(claudeIdentity(home(), () => ({ code: 0, stdout: "" })).state).toBe("not set up");
  });

  it("reads the account, expiry and scopes, and never the token", () => {
    const dir = home();
    fs.writeFileSync(
      path.join(dir, ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: { accessToken: SECRET, expiresAt: 1_800_000_000_000, scopes: ["a", "b"] },
      }),
    );
    const id = claudeIdentity(dir, () => ({
      code: 0,
      stdout: JSON.stringify({ loggedIn: true, email: "bot@example.org" }),
    }));
    expect(id).toEqual({
      state: "ok",
      who: "bot@example.org",
      expiry: "2027-01-15T08:00:00.000Z",
      scopes: "a b",
    });
    expect(JSON.stringify(id)).not.toContain(SECRET);
  });

  it("strips tokens that would beat the company's config dir, but not for the operator's", () => {
    const dir = home();
    fs.writeFileSync(path.join(dir, ".credentials.json"), "{}");
    /** @type {string[][]} */
    const unsets = [];
    /** @type {import("./creds.mjs").Run} */
    const run = (_c, _a, _e, unset) => {
      unsets.push([...unset]);
      return { code: 0, stdout: JSON.stringify({ loggedIn: true }) };
    };
    claudeIdentity(dir, run);
    claudeIdentity(null, run);
    expect(unsets[0]).toEqual(
      expect.arrayContaining(["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"]),
    );
    expect(unsets[1]).toEqual([]);
  });

  it("says unreadable output is an error, without echoing it", () => {
    const dir = home();
    fs.writeFileSync(path.join(dir, ".credentials.json"), "{}");
    const id = claudeIdentity(dir, () => ({ code: 1, stdout: SECRET }));
    expect(id.state).toBe("error");
    expect(JSON.stringify(id)).not.toContain(SECRET);
  });
});

describe("githubIdentity", () => {
  const reply = [
    "HTTP/2.0 200 OK",
    "X-Oauth-Scopes: repo, project",
    "Github-Authentication-Token-Expiration: 2027-01-01 00:00:00 UTC",
    "",
    '{"login":"vibewars-bot"}',
  ].join("\n");

  it("is not set up without hosts.yml", () => {
    expect(githubIdentity(home(), () => ({ code: 0, stdout: reply })).state).toBe("not set up");
  });

  it("reads the login, scopes and expiry from the headers", () => {
    const dir = home();
    fs.writeFileSync(path.join(dir, "hosts.yml"), `oauth_token: ${SECRET}`);
    const id = githubIdentity(dir, () => ({ code: 0, stdout: reply }));
    expect(id).toEqual({
      state: "ok",
      who: "vibewars-bot",
      expiry: "2027-01-01 00:00:00 utc",
      scopes: "repo, project",
    });
  });

  it("strips GH_TOKEN and its kin when probing the company's dir", () => {
    const dir = home();
    fs.writeFileSync(path.join(dir, "hosts.yml"), "");
    /** @type {string[]} */
    let seen = [];
    githubIdentity(dir, (_c, _a, _e, unset) => {
      seen = [...unset];
      return { code: 0, stdout: reply };
    });
    expect(seen).toEqual(
      expect.arrayContaining(["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN"]),
    );
  });

  it("reads the operator's own when no directory is given", () => {
    expect(githubIdentity(null, () => ({ code: 0, stdout: reply })).who).toBe("vibewars-bot");
  });
});

describe("pushIdentity", () => {
  it("is not set up without a key", () => {
    expect(pushIdentity("/nonexistent/key", () => ({ code: 1, stdout: "" })).state).toBe(
      "not set up",
    );
  });

  it("ignores the operator's ssh config and agent", () => {
    const key = path.join(home(), "id_ed25519");
    fs.writeFileSync(key, "k");
    /** @type {string[]} */
    let args = [];
    pushIdentity(key, (_c, a) => {
      args = a;
      return { code: 1, stdout: "" };
    });
    expect(args.slice(0, 3)).toEqual(["-F", "/dev/null", "-i"]);
    expect(args).toEqual(expect.arrayContaining(["IdentityAgent=none", "IdentitiesOnly=yes"]));
  });

  it("reads the login github greets the key with", () => {
    const key = path.join(home(), "id_ed25519");
    fs.writeFileSync(key, SECRET);
    const id = pushIdentity(key, () => ({ code: 1, stdout: "Hi vibewars-bot! You've done it." }));
    expect(id.who).toBe("vibewars-bot");
    expect(JSON.stringify(id)).not.toContain(SECRET);
  });
});

describe("telegramIdentity", () => {
  it("is not set up without the file", async () => {
    expect((await telegramIdentity("/nonexistent/token")).state).toBe("not set up");
  });

  it("names the bot and never the token", async () => {
    const file = path.join(home(), "token");
    fs.writeFileSync(file, `${SECRET}\n`);
    const id = await telegramIdentity(file, () =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ result: { username: "vw_bot" } }),
      }),
    );
    expect(id.who).toBe("@vw_bot");
    expect(JSON.stringify(id)).not.toContain(SECRET);
  });

  it("does not put the request's url, which holds the token, in an error", async () => {
    const file = path.join(home(), "token");
    fs.writeFileSync(file, SECRET);
    const id = await telegramIdentity(file, (url) => Promise.reject(new Error(url)));
    expect(id.state).toBe("error");
    expect(JSON.stringify(id)).not.toContain(SECRET);
  });
});

describe("ensureHome", () => {
  it("creates the directory at 0700 and reports a missing telegram token", () => {
    const root = path.join(home(), "creds");
    const result = ensureHome(root);
    expect(result.ok).toBe(true);
    expect(fs.statSync(root).mode & 0o777).toBe(0o700);
    expect(result.lines.map((l) => l.outcome).join("\n")).toContain(
      "missing (run claude-bot-setup)",
    );
  });

  it("is idempotent and notices a token that is there", () => {
    const root = path.join(home(), "creds");
    ensureHome(root);
    fs.writeFileSync(paths(root).telegram, "t", { mode: 0o600 });
    const again = ensureHome(root);
    expect(again.ok).toBe(true);
    expect(again.lines.map((l) => l.outcome)).toContain("present");
  });

  it("refuses a directory others can read, and leaves its mode alone", () => {
    const root = path.join(home(), "creds");
    fs.mkdirSync(root, { mode: 0o755 });
    fs.chmodSync(root, 0o755);
    expect(ensureHome(root).ok).toBe(false);
    expect(fs.statSync(root).mode & 0o777).toBe(0o755);
  });
});
