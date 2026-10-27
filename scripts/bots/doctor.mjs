#!/usr/bin/env node
/**
 * `claude-llc doctor` (#864): one table of the company's credentials. Per
 * credential: the identity it resolves to, its expiry and scopes, where it is
 * stored, and whether it is the operator's own. It never writes anything and
 * prints no credential value.
 */
import fs from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  claudeIdentity,
  githubIdentity,
  isOperators,
  modeOk,
  paths,
  pushIdentity,
  telegramIdentity,
} from "./creds.mjs";

/** @typedef {import("./creds.mjs").Identity} Identity */

/**
 * @typedef {object} Row
 * @property {string} name
 * @property {Identity} identity
 * @property {string} stored
 * @property {boolean | null} operators `null`: cannot tell, or not applicable
 * @property {boolean} [applicable] false: never the operator's by construction
 */

/**
 * @param {Identity} identity
 * @returns {string}
 */
function describe(identity) {
  if (identity.state === "ok") {
    return identity.who ?? "(logged in, name unknown)";
  }
  return identity.state === "error" ? `error: ${identity.note ?? "unknown"}` : "not set up";
}

/**
 * @param {Row} row
 * @returns {string}
 */
function whose(row) {
  if (row.applicable === false) {
    return "no";
  }
  if (row.identity.state !== "ok") {
    return "-";
  }
  return row.operators === null ? "can't tell" : row.operators ? "YES" : "no";
}

/**
 * @param {Row[]} rows
 * @returns {string}
 */
export function renderTable(rows) {
  const header = ["credential", "identity", "expiry", "scopes", "stored", "operator's"];
  const body = rows.map((row) => [
    row.name,
    describe(row.identity),
    row.identity.expiry ?? "-",
    row.identity.scopes ?? "-",
    row.stored,
    whose(row),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]?.length ?? 0)));
  const line = (/** @type {string[]} */ cells) =>
    cells
      .map((c, i) => c.padEnd(widths[i] ?? 0))
      .join("  ")
      .trimEnd();
  return [line(header), ...body.map(line)].join("\n");
}

/**
 * @param {string} root the credential home
 * @returns {Promise<{ rows: Row[], dir: string }>}
 */
export async function collect(root) {
  const p = paths(root);
  const operatorGithub = githubIdentity(null);
  const company = {
    claude: claudeIdentity(p.claude),
    github: githubIdentity(p.gh),
    push: pushIdentity(p.sshKey),
    telegram: await telegramIdentity(p.telegram),
  };
  /** @type {Row[]} */
  const rows = [
    {
      name: "claude",
      identity: company.claude,
      stored: p.claude,
      operators: isOperators(company.claude.who, claudeIdentity(null).who),
    },
    {
      name: "github api",
      identity: company.github,
      stored: p.gh,
      operators: isOperators(company.github.who, operatorGithub.who),
    },
    {
      name: "github push",
      identity: company.push,
      stored: p.ssh,
      operators: isOperators(company.push.who, operatorGithub.who),
    },
    {
      name: "telegram",
      identity: company.telegram,
      stored: p.telegram,
      operators: null,
      applicable: false,
    },
  ];
  return { rows, dir: root };
}

/**
 * @param {string} root
 * @returns {string}
 */
export function dirLine(root) {
  if (!fs.existsSync(root)) {
    return `credential home ${root}: missing (claude-llc-init creates it)`;
  }
  return modeOk(fs.statSync(root))
    ? `credential home ${root}: present, 0700`
    : `credential home ${root}: TOO WIDE; chmod 700 it`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.VIBEWARS_CREDENTIALS;
  if (root === undefined || root === "") {
    console.error(
      "claude-llc doctor: VIBEWARS_CREDENTIALS is not set (run it through claude-llc).",
    );
    process.exit(2);
  }
  console.log(dirLine(root));
  if (fs.existsSync(paths(root).allowOperatorClaude)) {
    console.log(
      `WARNING: ${paths(root).allowOperatorClaude} exists: the company may run on the operator's own Claude account. Delete it once a separate account is signed in.`,
    );
  }
  console.log("");
  console.log(renderTable((await collect(root)).rows));
}
