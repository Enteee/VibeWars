/**
 * `node skills-drafts.mjs <worktree>`: print the manager's draft skills
 * directory for claude-bot to bind, or refuse (#27). See `draftsDir`.
 *
 * Typed with JSDoc; see protocol.mjs.
 */
import process from "node:process";

import { draftsDir } from "./skills-sync.mjs";

const [worktree] = process.argv.slice(2);
if (worktree === undefined) {
  console.error("usage: skills-drafts.mjs <worktree>");
  process.exit(2);
}
try {
  console.log(draftsDir(worktree));
} catch (error) {
  console.error(`skills-drafts: ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
}
