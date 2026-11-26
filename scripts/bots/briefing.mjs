#!/usr/bin/env node
/**
 * A role briefing's frontmatter (#322): which model the role runs on.
 *
 *   briefing.mjs model <file>   print the role's model, or the default;
 *                               exit 2 if the one it names is not a model
 *   briefing.mjs body <file>    print the briefing without its frontmatter
 *
 * A briefing may start with frontmatter, between a `---` on line 1 and the
 * next `---` line. Only `model` is read; any other key is ignored. A role
 * that names none runs on DEFAULT_MODEL. A model that is not a plain
 * `claude-…` id is refused at start rather than quietly replaced: `[1m]`
 * would turn off the autocompact every role relies on (#321).
 *
 * claude-bot runs it, before it starts the role's jail.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const DEFAULT_MODEL = "claude-opus-5-5";

const MODEL = /^claude-[a-z0-9-]+$/;
const FENCE = "---";

/**
 * @param {string} text
 * @returns {{ model: string | undefined, body: string }}
 */
export function parseBriefing(text) {
  const lines = text.split("\n");
  const end = lines.indexOf(FENCE, 1);
  if (lines[0] !== FENCE || end === -1) {
    return { model: undefined, body: text };
  }
  let model;
  for (const line of lines.slice(1, end)) {
    const match = /^model:(.*)$/.exec(line);
    if (match !== null) {
      model = (match[1] ?? "").trim();
    }
  }
  return { model, body: lines.slice(end + 1).join("\n") };
}

/**
 * The model a briefing names, or the default; undefined when it names one
 * that is not a model id.
 *
 * @param {string | undefined} model
 * @returns {string | undefined}
 */
export function resolveModel(model) {
  if (model === undefined) {
    return DEFAULT_MODEL;
  }
  return MODEL.test(model) ? model : undefined;
}

if (
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [command, file] = process.argv.slice(2);
  if ((command !== "model" && command !== "body") || file === undefined) {
    console.error("usage: briefing.mjs model <file> | body <file>");
    process.exitCode = 2;
  } else {
    const briefing = parseBriefing(fs.readFileSync(file, "utf8"));
    if (command === "body") {
      process.stdout.write(briefing.body);
    } else {
      const model = resolveModel(briefing.model);
      if (model === undefined) {
        console.error(`claude-bot: ${path.basename(file)}: model must match claude-[a-z0-9-]+`);
        process.exitCode = 2;
      } else {
        process.stdout.write(`${model}\n`);
      }
    }
  }
}
