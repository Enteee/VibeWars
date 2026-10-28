/**
 * The company's credential home (#855, #864): one directory, mode 0700,
 * outside the checkout, that holds everything the company authenticates with.
 *
 *     <root>/claude/                 a CLAUDE_CONFIG_DIR of the company's own
 *     <root>/gh/                     a GH_CONFIG_DIR of the company's own
 *     <root>/ssh/id_ed25519(.pub)    the company's push key
 *     <root>/telegram-manager-token
 *
 * Everything here only reads, and nothing prints a credential: the identity
 * functions parse the few fields they need (an address, a login, an expiry,
 * scope names) out of what a command or a file says, and an error carries a
 * short fixed phrase, never the command's output or a request's URL.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Where each credential lives under a credential home.
 *
 * @param {string} root
 */
export function paths(root) {
  return {
    root,
    claude: path.join(root, "claude"),
    claudeCredentials: path.join(root, "claude", ".credentials.json"),
    claudeIdentity: path.join(root, "claude-identity"),
    gh: path.join(root, "gh"),
    ghHosts: path.join(root, "gh", "hosts.yml"),
    ssh: path.join(root, "ssh"),
    sshKey: path.join(root, "ssh", "id_ed25519"),
    sshPub: path.join(root, "ssh", "id_ed25519.pub"),
    telegram: path.join(root, "telegram-manager-token"),
  };
}

/**
 * Whether a file or directory is closed to everyone but its owner.
 *
 * @param {{ mode: number }} stat
 * @returns {boolean}
 */
export function modeOk(stat) {
  return (stat.mode & 0o077) === 0;
}

/**
 * Whether the company's identity is the operator's. `null` is "cannot tell":
 * one side is unknown, and a caller that has to decide treats it as a yes.
 *
 * @param {string | null} company
 * @param {string | null} operator
 * @returns {boolean | null}
 */
export function isOperators(company, operator) {
  if (company === null || operator === null) {
    return null;
  }
  return company.toLowerCase() === operator.toLowerCase();
}

/**
 * What one credential resolves to.
 *
 * @typedef {object} Identity
 * @property {"ok" | "not set up" | "error"} state
 * @property {string | null} who the account, login or bot it resolves to
 * @property {string | null} expiry
 * @property {string | null} scopes
 * @property {string} [note] why it is not `ok`
 */

/** @type {Identity} */
const NOT_SET_UP = { state: "not set up", who: null, expiry: null, scopes: null };

/**
 * @param {string} note
 * @returns {Identity}
 */
const failed = (note) => ({ state: "error", who: null, expiry: null, scopes: null, note });

/**
 * @typedef {(command: string, args: string[], env: Record<string, string>, unset: readonly string[]) => { code: number, stdout: string, stderr?: string }} Run
 * A command runs with the shell's environment, plus `env`, minus `unset`.
 */

/**
 * Variables that beat a config directory: a token in the operator's shell
 * would make the company's row show the operator's login. Removed, not
 * overridden, whenever a company directory is probed.
 */
export const CLAUDE_TOKEN_VARS = [
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
];
export const GITHUB_TOKEN_VARS = [
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "GH_ENTERPRISE_TOKEN",
  "GITHUB_ENTERPRISE_TOKEN",
];

/** @type {Run} */
export function runCommand(command, args, env, unset) {
  const base = Object.fromEntries(
    Object.entries({ ...process.env, ...env }).filter(([name]) => !unset.includes(name)),
  );
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: base,
    timeout: 20_000,
  });
  return {
    code: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

/**
 * @param {string} text
 * @returns {Record<string, unknown> | null}
 */
function parseObject(text) {
  try {
    /** @type {unknown} */
    const value = JSON.parse(text);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
const text = (value) => (typeof value === "string" && value !== "" ? value : null);

/**
 * The Claude account in a config directory. `dir` is `null` for the
 * operator's own, the default one.
 *
 * @param {string | null} dir
 * @param {Run} [run]
 * @returns {Identity}
 */
export function claudeIdentity(dir, run = runCommand) {
  const credentials = dir === null ? null : path.join(dir, ".credentials.json");
  if (credentials !== null && !fs.existsSync(credentials)) {
    return NOT_SET_UP;
  }
  const env = dir === null ? {} : { CLAUDE_CONFIG_DIR: dir };
  const result = run("claude", ["auth", "status"], env, dir === null ? [] : CLAUDE_TOKEN_VARS);
  const status = parseObject(result.stdout);
  if (status === null) {
    return failed("claude auth status said nothing readable");
  }
  if (status.loggedIn !== true) {
    return NOT_SET_UP;
  }
  let expiry = null;
  let scopes = null;
  if (credentials !== null) {
    const stored = parseObject(fs.readFileSync(credentials, "utf8"));
    const oauth = parseObject(JSON.stringify(stored?.claudeAiOauth ?? null));
    const expiresAt = oauth?.expiresAt;
    expiry = typeof expiresAt === "number" ? new Date(expiresAt).toISOString() : null;
    const names = oauth?.scopes;
    scopes = Array.isArray(names) ? names.filter((s) => typeof s === "string").join(" ") : null;
  }
  return { state: "ok", who: text(status.email), expiry, scopes };
}

/**
 * The GitHub login behind a `gh` config directory (`null`: the operator's).
 * `gh api -i` prints the response headers, which carry the scopes and the
 * token's expiry, then the body.
 *
 * @param {string | null} dir
 * @param {Run} [run]
 * @returns {Identity}
 */
export function githubIdentity(dir, run = runCommand) {
  if (dir !== null && !fs.existsSync(path.join(dir, "hosts.yml"))) {
    return NOT_SET_UP;
  }
  const env = dir === null ? {} : { GH_CONFIG_DIR: dir };
  const result = run("gh", ["api", "-i", "user"], env, dir === null ? [] : GITHUB_TOKEN_VARS);
  const split = result.stdout.search(/\r?\n\r?\n/);
  if (split < 0) {
    return result.code === 0 ? failed("gh api user said nothing readable") : NOT_SET_UP;
  }
  const headers = result.stdout.slice(0, split).toLowerCase();
  const header = (/** @type {string} */ name) =>
    new RegExp(`^${name}:[ \\t]*(.*?)\\r?$`, "m").exec(headers)?.[1] ?? "";
  const who = text(parseObject(result.stdout.slice(split).trim())?.login);
  if (who === null) {
    return NOT_SET_UP;
  }
  return {
    state: "ok",
    who,
    expiry: text(header("github-authentication-token-expiration")),
    scopes: text(header("x-oauth-scopes")),
  };
}

/**
 * The GitHub account a push key is registered to: `ssh -T git@github.com`
 * greets by login and exits 1.
 *
 * @param {string} key private key path
 * @param {Run} [run]
 * @returns {Identity}
 */
export function pushIdentity(key, run = runCommand) {
  if (!fs.existsSync(key)) {
    return NOT_SET_UP;
  }
  const result = run(
    "ssh",
    [
      // Nothing from the operator's ~/.ssh/config or agent: with it, a key
      // github does not know would fall through to the operator's and be
      // greeted as them.
      "-F",
      "/dev/null",
      "-i",
      key,
      "-o",
      "IdentitiesOnly=yes",
      "-o",
      "IdentityAgent=none",
      "-o",
      "BatchMode=yes",
      "-T",
      "git@github.com",
    ],
    {},
    [],
  );
  // ssh prints the greeting on stderr.
  const who = /^Hi ([^!\s]+)!/m.exec(result.stderr ?? "")?.[1];
  return who === undefined
    ? failed("github did not greet this key")
    : { state: "ok", who, expiry: null, scopes: null };
}

/**
 * @typedef {(url: string) => Promise<{ ok: boolean, json: () => Promise<unknown> }>} Get
 */

/**
 * The bot a token file belongs to, by `getMe`.
 *
 * @param {string} file
 * @param {Get} [get]
 * @returns {Promise<Identity>}
 */
export async function telegramIdentity(file, get = (url) => fetch(url)) {
  if (!fs.existsSync(file)) {
    return NOT_SET_UP;
  }
  return telegramBot(fs.readFileSync(file, "utf8").trim(), get);
}

/**
 * The bot a token belongs to, by `getMe`: `claude-llc auth` asks before it
 * stores one.
 *
 * @param {string} token
 * @param {Get} [get]
 * @returns {Promise<Identity>}
 */
export async function telegramBot(token, get = (url) => fetch(url)) {
  try {
    const reply = await get(`https://api.telegram.org/bot${token}/getMe`);
    const body = parseObject(JSON.stringify(await reply.json()));
    const who = text(parseObject(JSON.stringify(body?.result ?? null))?.username);
    return reply.ok && who !== null
      ? { state: "ok", who: `@${who}`, expiry: null, scopes: null }
      : failed("telegram refused the token");
  } catch {
    return failed("telegram could not be reached");
  }
}

/**
 * Step 0 of `claude-llc-init` (#864): the credential directory itself, at
 * 0700, and whether the Telegram token is there. It refuses a directory that
 * is wider than that, and never widens or narrows one: the operator decides.
 *
 * @param {string} root
 * @returns {{ ok: boolean, lines: { step: string, outcome: string }[] }}
 */
export function ensureHome(root) {
  const p = paths(root);
  /** @type {{ step: string, outcome: string }[]} */
  const lines = [];
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    // mkdir's mode is masked by the umask, and recursive leaves parents alone.
    fs.chmodSync(root, 0o700);
    lines.push({ step: "credential home", outcome: `created ${root} (0700)` });
  } else if (modeOk(fs.statSync(root))) {
    lines.push({ step: "credential home", outcome: `${root} (0700)` });
  } else {
    lines.push({
      step: "credential home",
      outcome: `${root} is readable by others: chmod 700 it, then run this again`,
    });
    return { ok: false, lines };
  }
  lines.push({
    step: "telegram token",
    outcome: fs.existsSync(p.telegram) ? "present" : "missing (run claude-bot-setup)",
  });
  return { ok: true, lines };
}

/**
 * Whether the agents may run on the company's Claude account (#865): it must
 * be signed in, in the company's config directory. Whose account that is, is
 * the operator's responsibility (the doctor shows it, informationally); the
 * point of the directory is that the jails bind that one credential and
 * nothing of the operator's `~/.claude`.
 *
 * @param {string} root
 * @param {Run} [run]
 * @returns {{ ok: true, who: string } | { ok: false, message: string }}
 */
export function claudeVerdict(root, run = runCommand) {
  const company = claudeIdentity(paths(root).claude, run);
  if (company.state === "error") {
    return {
      ok: false,
      message: `the company's Claude account could not be read: ${company.note ?? "?"}`,
    };
  }
  if (company.state !== "ok" || company.who === null) {
    return {
      ok: false,
      message: `the company's Claude account is not set up. Sign it in: claude-llc auth claude`,
    };
  }
  return { ok: true, who: company.who };
}

/**
 * Per-role Claude state (`claude.json`: onboarding, trust, the account it
 * saw) belongs to one account. When the company's account is not the one
 * recorded, delete every box's copy; the next start seeds it again. Not
 * migrated: the old account's state is not wanted (ADR-0016).
 *
 * @param {string} root
 * @param {string} boxes the directory holding one box per employee
 * @param {string} who the company's Claude account now
 * @returns {number} how many boxes were reset
 */
export function resetBoxesOnAccountChange(root, boxes, who) {
  const recorded = paths(root).claudeIdentity;
  const before = fs.existsSync(recorded) ? fs.readFileSync(recorded, "utf8").trim() : null;
  if (before === who) {
    return 0;
  }
  let reset = 0;
  if (fs.existsSync(boxes)) {
    for (const entry of fs.readdirSync(boxes, { withFileTypes: true })) {
      const file = path.join(boxes, entry.name, "claude.json");
      if (entry.isDirectory() && fs.existsSync(file)) {
        fs.rmSync(file);
        reset += 1;
      }
    }
  }
  fs.writeFileSync(recorded, `${who}\n`, { mode: 0o600 });
  return reset;
}
