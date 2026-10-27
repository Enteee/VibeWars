#!/usr/bin/env node
/**
 * `claude-llc hire|fire` (#385): the operator's hand on the staff. Writes a
 * `staff` request into the host-only spool `hub/_operator/` and prints
 * hubd's answer. The jails mount `hub/` read-only, so no agent can do this.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const WAIT_MS = 30_000;

/**
 * @param {string[]} args after `hire` or `fire`: the role or employee, an
 *   optional reason, and `--over-cap` (hire only)
 * @param {"hire" | "fire"} verb
 * @returns {{ argv: string[] } | { usage: string }}
 */
export function operatorArgv(verb, args) {
  const overCap = args.includes("--over-cap");
  const words = args.filter((word) => word !== "--over-cap");
  const [who, ...rest] = words;
  if (who === undefined || rest.length > 1 || (overCap && verb === "fire")) {
    return {
      usage:
        verb === "hire"
          ? "usage: claude-llc hire <role> [reason] [--over-cap]"
          : "usage: claude-llc fire <employee> [reason]",
    };
  }
  return { argv: [verb, who, rest[0] ?? "by the operator", ...(overCap ? ["--over-cap"] : [])] };
}

/**
 * @param {string} root `.bots`
 * @param {string[]} argv
 * @returns {Promise<{ code: number, text: string }>}
 */
export async function ask(root, argv) {
  const spool = path.join(root, "hub", "_operator");
  const id = `${String(Date.now())}-${String(process.pid)}`;
  const req = path.join(spool, "req");
  const res = path.join(spool, "res", `${id}.json`);
  if (!fs.existsSync(req)) {
    return { code: 1, text: "hubd is not serving the operator's spool; is the company up?" };
  }
  fs.writeFileSync(
    path.join(req, `.${id}.json.part`),
    JSON.stringify({ id, role: "operator", kind: "staff", argv }),
  );
  fs.renameSync(path.join(req, `.${id}.json.part`), path.join(req, `${id}.json`));
  const deadline = Date.now() + WAIT_MS;
  while (!fs.existsSync(res)) {
    if (Date.now() > deadline) {
      return { code: 1, text: "no answer from hubd in 30 s; is it running?" };
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  /** @type {unknown} */
  const parsed = JSON.parse(fs.readFileSync(res, "utf8"));
  const answer = /** @type {{ allow?: boolean, reason?: string, stdout?: string }} */ (parsed);
  fs.rmSync(res, { force: true });
  return answer.allow === false
    ? { code: 1, text: `refused: ${answer.reason ?? "no reason given"}` }
    : { code: 0, text: (answer.stdout ?? "").trimEnd() };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [verb, ...args] = process.argv.slice(2);
  const root = process.env.VIBEWARS_BOT_ROOT;
  if ((verb !== "hire" && verb !== "fire") || root === undefined) {
    console.error("operator-staff: run as `claude-llc hire|fire`");
    process.exit(2);
  }
  const parsed = operatorArgv(verb, args);
  if ("usage" in parsed) {
    console.error(parsed.usage);
    process.exit(2);
  }
  const { code, text } = await ask(root, parsed.argv);
  (code === 0 ? console.log : console.error)(text);
  process.exit(code);
}
