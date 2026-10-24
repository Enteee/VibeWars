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
 * Separate an output filter from the rest of a gh command line.
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
    const eq = word.indexOf("=");
    const name = word.startsWith("-") && eq !== -1 ? word.slice(0, eq) : word;
    const isJq = name === "--jq" || name === "-q";
    const isTemplate = !authoring && (name === "--template" || name === "-t");
    if (!isJq && !isTemplate) {
      rest.push(word);
      continue;
    }
    const value = name === word ? argv[(i += 1)] : word.slice(eq + 1);
    if (value === undefined) {
      return { error: `${name} needs a value` };
    }
    if (isJq) {
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
