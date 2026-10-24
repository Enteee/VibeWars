/**
 * `--body-file`, read inside the sandbox.
 *
 * gh runs on the host, so a file path given to it is a path on the host,
 * and hubd refuses every flag that would make gh read one (#26). But writing
 * a long pull request description to a file and passing `--body-file` is
 * the natural way to do it, so `hub` reads the file here, in the jail, where
 * the agent could read it anyway, and sends its contents as `--body`.
 */

/**
 * For each command, the file flags hub inlines and the text flag that
 * replaces them.
 *
 * @type {Record<string, { long: string, short: string, text: string } | undefined>}
 */
const INLINE = {
  "issue create": { long: "--body-file", short: "-F", text: "--body" },
  "issue comment": { long: "--body-file", short: "-F", text: "--body" },
  "issue edit": { long: "--body-file", short: "-F", text: "--body" },
  "pr create": { long: "--body-file", short: "-F", text: "--body" },
  "pr comment": { long: "--body-file", short: "-F", text: "--body" },
  "pr edit": { long: "--body-file", short: "-F", text: "--body" },
  "pr merge": { long: "--body-file", short: "-F", text: "--body" },
  "release create": { long: "--notes-file", short: "-F", text: "--notes" },
  "release edit": { long: "--notes-file", short: "-F", text: "--notes" },
};

/**
 * Replace a file flag with the text it names.
 *
 * @param {string[]} argv a gh command line, without `gh`
 * @param {(path: string) => string} read reads a file, or stdin for `-`
 * @returns {{ argv: string[] } | { error: string }}
 */
export function inlineBodyFile(argv, read) {
  const flags = INLINE[`${argv[0] ?? ""} ${argv[1] ?? ""}`];
  if (flags === undefined) {
    return { argv };
  }
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    /** @type {string | undefined} */
    let file;
    let matched = true;
    if (word === flags.long || word === flags.short) {
      file = argv[(i += 1)];
    } else if (word.startsWith(`${flags.long}=`)) {
      file = word.slice(flags.long.length + 1);
    } else if (word.startsWith(flags.short) && word.length > flags.short.length) {
      file = word.slice(flags.short.length).replace(/^=/, "");
    } else {
      matched = false;
    }
    if (!matched) {
      out.push(word);
      continue;
    }
    if (file === undefined) {
      return { error: `${word} needs a file` };
    }
    try {
      out.push(flags.text, read(file));
    } catch (error) {
      return {
        error: `could not read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  return { argv: out };
}
