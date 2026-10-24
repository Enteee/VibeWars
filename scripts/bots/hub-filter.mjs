/**
 * Output filters (`--jq`, `--template`) are applied inside the sandbox,
 * never by hubd.
 *
 * A filter is code the agent wrote. Run on the host, by hubd's jq or by gh's
 * built-in one, it sees hubd's environment (`$ENV`, `env`) and, with jq's
 * `import`, any JSON file the host can read (found in review of #32). So
 * `hub` strips the filter before the request leaves the jail, gets gh's
 * plain `--json` output back, and runs the filter with the jail's own jq,
 * where it can only see what the agent could see anyway. hubd refuses any
 * request that still carries one, because the spool is writable by the
 * agent and `hub` is not the only thing that can write a request.
 *
 * Shared by both sides so they can never disagree about what a filter is.
 */

/**
 * Subcommands where `-t` means `--title` and `--template` names an issue or
 * pull request template. Neither is an output filter there.
 */
const AUTHORING = new Set(["create", "edit"]);

/**
 * @typedef {{ argv: string[], jq: string | null, template: string | null }} Split
 */

/**
 * The filter a single-dash word carries, if any, as gh's flag parser would
 * read it.
 *
 * gh (cobra/pflag) accepts a short flag's value glued on (`-q.body`,
 * `-q$ENV`, `-q=.x`) and boolean short flags clustered in front of it
 * (`-cq.body` is `-c -q .body`). Missing either form is the whole hole
 * this module exists to close (review of #32), so every single-dash word is
 * read letter by letter: a filter letter takes the rest of the word as its
 * value, or the next word if it is last.
 *
 * @param {string} word
 * @param {boolean} authoring
 * @returns {{ kind: "jq" | "template", glued: string | null, at: number } | null}
 *   `glued` is `null` when the value is the next word; `at` is where in the
 *   word the filter letter is, so the flags before it can be kept
 */
function shortFilter(word, authoring) {
  if (!/^-[A-Za-z]/.test(word)) {
    return null;
  }
  for (let i = 1; i < word.length; i += 1) {
    const letter = word[i] ?? "";
    const kind = letter === "q" ? "jq" : letter === "t" && !authoring ? "template" : null;
    if (kind !== null) {
      const rest = word.slice(i + 1);
      return { kind, glued: rest === "" ? null : rest.replace(/^=/, ""), at: i };
    }
    // A letter that is not a filter: another short flag in the cluster. A
    // non-letter means the rest is that flag's glued value, not more flags.
    if (!/[A-Za-z]/.test(letter)) {
      return null;
    }
  }
  return null;
}

/**
 * Separate an output filter from the rest of a gh command line.
 *
 * Errs towards seeing a filter. A value that merely starts with `-q` or
 * `-t` (`--body "-quick note"`) is read as one: hub then strips it and the
 * command fails visibly, which is the safe direction. The other direction is
 * a filter run on the host.
 *
 * @param {string[]} argv a gh command line, without the leading `gh`
 * @returns {Split | { error: string }}
 */
export function splitFilter(argv) {
  const authoring = AUTHORING.has(argv[1] ?? "");
  /** @type {string[]} */
  const rest = [];
  /** @type {string | null} */
  let jq = null;
  /** @type {string | null} */
  let template = null;

  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    /** @type {"jq" | "template" | null} */
    let kind = null;
    /** @type {string | undefined} */
    let value;

    if (word.startsWith("--")) {
      const eq = word.indexOf("=");
      const name = eq === -1 ? word : word.slice(0, eq);
      kind = name === "--jq" ? "jq" : name === "--template" && !authoring ? "template" : null;
      if (kind !== null) {
        value = eq === -1 ? argv[(i += 1)] : word.slice(eq + 1);
      }
    } else {
      const short = shortFilter(word, authoring);
      if (short !== null) {
        kind = short.kind;
        value = short.glued ?? argv[(i += 1)];
        // Keep the boolean flags clustered before the filter letter.
        if (short.at > 1) {
          rest.push(word.slice(0, short.at));
        }
      }
    }

    if (kind === null) {
      rest.push(word);
      continue;
    }
    if (value === undefined) {
      return { error: `${word} needs a value` };
    }
    if (kind === "jq") {
      jq = value;
    } else {
      template = value;
    }
  }
  return { argv: rest, jq, template };
}

/**
 * Whether a gh command line carries an output filter, which hubd refuses.
 *
 * @param {string[]} argv
 * @returns {boolean}
 */
export function hasFilter(argv) {
  const split = splitFilter(argv);
  return "error" in split || split.jq !== null || split.template !== null;
}
