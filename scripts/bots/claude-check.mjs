#!/usr/bin/env node
/**
 * Boot check of `claude-llc` (#865): exit 1, saying why, unless the agents
 * would run on the company's own Claude account. Prints no credential.
 */
import process from "node:process";

import { claudeVerdict } from "./creds.mjs";

const root = process.env.VIBEWARS_CREDENTIALS ?? "";
if (root === "") {
  console.error("claude-llc: VIBEWARS_CREDENTIALS is not set");
  process.exit(2);
}
const verdict = claudeVerdict(root);
if (!verdict.ok) {
  console.error(`claude-llc: ${verdict.message}`);
  console.error("claude-llc: see 'claude-llc doctor'");
  process.exit(1);
}
