#!/usr/bin/env node
/**
 * Boot check of `claude-llc` (#866): exit 1, saying why, unless the company
 * can work on GitHub as itself: its own gh credential and its push key.
 * Prints no credential.
 */
import process from "node:process";

import { githubVerdict } from "./creds.mjs";

const root = process.env.VIBEWARS_CREDENTIALS ?? "";
if (root === "") {
  console.error("claude-llc: VIBEWARS_CREDENTIALS is not set");
  process.exit(2);
}
const verdict = githubVerdict(root);
if (!verdict.ok) {
  console.error(`claude-llc: ${verdict.message}`);
  console.error("claude-llc: see 'claude-llc doctor'");
  process.exit(1);
}
