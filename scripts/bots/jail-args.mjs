/**
 * The support jail's bubblewrap arguments (#148, ADR-0025), built here
 * rather than in `nix/claude-bot.nix` so the test can read them: CI's shell
 * has no `claude-bot`, and an argument list that only exists inside a
 * shell script cannot be checked anywhere else. Every other role's still
 * lives in the script.
 *
 * Support reads strangers' text, so it is assumed prompt-injected, and
 * anything it can read it can paste into a public reply. So its jail holds
 * no secret and can write nothing shared:
 *
 * - no `.git` and no worktree: main, exported with `git archive` from
 *   hubd's mirror, read-only, is its working directory;
 * - no credential: `~/.claude` is its box, with no `.credentials.json`,
 *   and Claude reaches the API only through the host's proxy
 *   (`support-proxy.mjs`), which adds the company's;
 * - its own bus and hub spool, and the heartbeats beside them, never the
 *   other employees';
 * - no network: `--unshare-all` without `--share-net`. The proxy's socket
 *   directory is bound in, and the jail's forwarder serves it on loopback;
 * - no `~/.config/git`, no skills, no peek.
 *
 *     node jail-args.mjs support <json>   prints the arguments, NUL-separated
 */
import { pathToFileURL } from "node:url";

/** Where the proxy's socket directory is bound inside the jail. */
export const PROXY_DIR = "/run/support-proxy";

/** The proxy socket's name, in its directory on both sides. */
export const PROXY_SOCKET = "proxy.sock";

/** The loopback port the jail's forwarder serves the proxy on. */
export const PROXY_PORT = 8377;

/**
 * What Claude sends as its token: never a credential, only something to
 * send. The proxy drops it and adds the company's.
 */
export const PLACEHOLDER_TOKEN = "support-proxy";

/**
 * @typedef {object} SupportJail
 * @property {string} employee `support` or `support@<n>`
 * @property {string} role
 * @property {string} home the operator's $HOME, a tmpfs in the jail
 * @property {string} user
 * @property {number} uid
 * @property {string} bus the bus root
 * @property {string} hub the hub root
 * @property {string} source main's export, the working directory
 * @property {string} sourceSha the commit it was exported from
 * @property {string} box this employee's Claude box: `config/` and `claude.json`
 * @property {string} proxyDir the host directory holding the proxy's socket
 * @property {string} path PATH inside the jail
 * @property {string} shell SHELL inside the jail
 * @property {string} term
 * @property {string} lang
 * @property {string} colorterm
 * @property {string} project the board's project number
 * @property {string} board the board's node ids, JSON
 */

/**
 * @param {SupportJail} jail
 * @returns {string[]} bwrap's arguments, up to the command
 */
export function supportJailArgs(jail) {
  const runUser = `/run/user/${String(jail.uid)}`;
  const own = (/** @type {string} */ root) => `${root}/${jail.employee}`;
  return [
    "--die-with-parent",
    "--unshare-all",
    "--clearenv",
    ...["--ro-bind", "/nix/store", "/nix/store"],
    ...["--ro-bind", "/etc", "/etc"],
    ...["--ro-bind", "/bin", "/bin"],
    ...["--ro-bind", "/usr", "/usr"],
    ...["--ro-bind-try", "/run/current-system", "/run/current-system"],
    ...["--proc", "/proc"],
    ...["--dev", "/dev"],
    ...["--tmpfs", "/tmp"],
    ...["--tmpfs", runUser],
    ...["--tmpfs", jail.home],
    ...["--bind", `${jail.box}/config`, `${jail.home}/.claude`],
    ...["--bind", `${jail.box}/claude.json`, `${jail.home}/.claude.json`],
    ...["--ro-bind", jail.source, jail.source],
    ...["--bind", own(jail.bus), own(jail.bus)],
    ...["--ro-bind", `${jail.bus}/_alive`, `${jail.bus}/_alive`],
    ...["--bind", own(jail.hub), own(jail.hub)],
    ...["--ro-bind", `${jail.hub}/_alive`, `${jail.hub}/_alive`],
    ...["--ro-bind", jail.proxyDir, PROXY_DIR],
    ...["--chdir", jail.source],
    ...["--setenv", "HOME", jail.home],
    ...["--setenv", "USER", jail.user],
    ...["--setenv", "SHELL", jail.shell],
    ...["--setenv", "PATH", jail.path],
    ...["--setenv", "TERM", jail.term],
    ...["--setenv", "LANG", jail.lang],
    ...["--setenv", "COLORTERM", jail.colorterm],
    ...["--setenv", "XDG_RUNTIME_DIR", runUser],
    ...["--setenv", "VIBEWARS_BOT_EMPLOYEE", jail.employee],
    ...["--setenv", "VIBEWARS_BOT_ROLE", jail.role],
    ...["--setenv", "VIBEWARS_BOT_BUS", jail.bus],
    ...["--setenv", "VIBEWARS_HUB", own(jail.hub)],
    ...["--setenv", "VIBEWARS_PROJECT", jail.project],
    ...["--setenv", "VIBEWARS_BOARD", jail.board],
    ...["--setenv", "VIBEWARS_ACTING", ""],
    ...["--setenv", "VIBEWARS_ENV", "development"],
    ...["--setenv", "VIBEWARS_SOURCE_SHA", jail.sourceSha],
    ...["--setenv", "VIBEWARS_PROXY_SOCKET", `${PROXY_DIR}/${PROXY_SOCKET}`],
    ...["--setenv", "VIBEWARS_PROXY_PORT", String(PROXY_PORT)],
    ...["--setenv", "ANTHROPIC_BASE_URL", `http://127.0.0.1:${String(PROXY_PORT)}`],
    ...["--setenv", "ANTHROPIC_AUTH_TOKEN", PLACEHOLDER_TOKEN],
    ...["--setenv", "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "1"],
    ...["--setenv", "ENABLE_CLAUDEAI_MCP_SERVERS", "false"],
    ...["--setenv", "CLAUDE_CODE_DISABLE_BUNDLED_SKILLS", "1"],
  ];
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {{ empty?: boolean }} [options] whether "" is a value
 * @returns {string}
 */
function text(value, name, { empty = false } = {}) {
  if (typeof value !== "string" || (value === "" && !empty)) {
    throw new Error(`jail-args: ${name} must be a${empty ? "" : " non-empty"} string`);
  }
  return value;
}

/**
 * The jail's description, from claude-bot's JSON: every field present and
 * of its type, or nothing.
 *
 * @param {string} json
 * @returns {SupportJail}
 */
export function parseSupportJail(json) {
  /** @type {unknown} */
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("jail-args: not an object");
  }
  const fields = /** @type {Record<string, unknown>} */ (parsed);
  const get = (/** @type {string} */ name) => text(fields[name], name);
  const uid = Number(get("uid"));
  if (!Number.isInteger(uid) || uid < 0) {
    throw new Error("jail-args: uid must be a number");
  }
  return {
    employee: get("employee"),
    role: get("role"),
    home: get("home"),
    user: get("user"),
    uid,
    bus: get("bus"),
    hub: get("hub"),
    source: get("source"),
    sourceSha: get("sourceSha"),
    box: get("box"),
    proxyDir: get("proxyDir"),
    path: get("path"),
    shell: get("shell"),
    term: get("term"),
    lang: get("lang"),
    colorterm: get("colorterm"),
    // Empty until claude-llc-init has recorded the board.
    project: text(fields.project, "project", { empty: true }),
    board: text(fields.board, "board", { empty: true }),
  };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, json] = process.argv.slice(2);
  if (kind !== "support" || json === undefined) {
    console.error("usage: jail-args.mjs support <json>");
    process.exit(2);
  }
  process.stdout.write(`${supportJailArgs(parseSupportJail(json)).join("\0")}\0`);
}
