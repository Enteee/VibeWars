/**
 * Which issues and pull requests the company is allowed to see.
 *
 * The repository is public, so anybody can open an issue or a pull request
 * against it. Left alone, nine autonomous agents polling `issue list` would
 * pick a stranger's feature request off the pile and start building it — or
 * worse, treat a stranger's issue body as instructions.
 *
 * So this is a blacklist, not a whitelist: everything is visible except work
 * raised by someone outside the project. The company's own issues and pull
 * requests, and the operator's, are never hidden — not when an agent forgets
 * to put one on the board, not when it forgets a label. Losing track of its
 * own work would be a worse failure than the one this guards against.
 *
 * Hidden means both of these are true:
 *
 *   - the author is not a collaborator on the repository
 *   - nobody has put it on the VibeWars board
 *
 * Putting it on the board is the triage decision, and it is one only a
 * project member can make: an outsider cannot touch the board, and the
 * manager — who otherwise may — is refused when the item was raised by an
 * outsider, even if it names one by guessing a URL.
 *
 * Pure, like hub-policy.mjs: hubd fetches the world, these functions decide.
 * See docs/adr/0015-agent-company.md.
 */

/**
 * @typedef {object} Item
 * @property {number} number
 * @property {{ login?: string } | null | undefined} author
 * @property {string} url
 */

/**
 * @typedef {object} Viewer
 * @property {Set<string>} members Collaborator logins, lowercased.
 * @property {string} repo          `owner/name`
 * @property {Set<number>} board    Issue and pull request numbers on the board.
 */

/**
 * Verbs that act on one named issue or pull request. Every one of them is
 * a way to read or touch it, so every one of them is checked.
 */
const SELECTOR_VERBS = {
  issue: new Set(["view", "comment", "edit", "close", "reopen", "pin", "unpin", "lock", "unlock"]),
  pr: new Set(["view", "diff", "checks", "comment", "edit", "ready", "merge", "close", "reopen"]),
};

/**
 * Flags of the commands above that take no value. Needed so that in
 * `pr merge 5 --squash 6` the `6` is recognised as a second pull request
 * rather than as the value of `--squash`, which would let it slip past the
 * check.
 */
const BOOLEAN_FLAGS = new Set([
  "-w",
  "--web",
  "-c",
  "--comments",
  "--patch",
  "--name-only",
  "-s",
  "--squash",
  "-m",
  "--merge",
  "-r",
  "--rebase",
  "--auto",
  "--admin",
  "-d",
  "--delete-branch",
  "--disable-auto",
  "--watch",
  "--fail-fast",
  "--required",
  "-e",
  "--editor",
  "--edit-last",
  "--delete-last",
  "--create-if-none",
  "--yes",
  "--remove-milestone",
  "--undo",
]);

/**
 * Flags that reshape list output in ways hubd cannot filter afterwards.
 */
const UNFILTERABLE = ["-q", "--jq", "-t", "--template", "-w", "--web"];

/** Fields hubd needs on every listed row to decide visibility. */
const NEEDED = ["number", "author", "url"];

/** What a list prints when the agent asked for no particular fields. */
const DEFAULT_FIELDS = {
  issue: ["number", "state", "title", "labels", "updatedAt"],
  pr: ["number", "title", "headRefName", "state", "createdAt"],
};

/**
 * @param {Item} item
 * @param {Viewer} viewer
 * @returns {boolean}
 */
export function isVisible(item, viewer) {
  // A URL from another repository is never ours, whoever wrote it.
  if (!item.url.toLowerCase().startsWith(`https://github.com/${viewer.repo.toLowerCase()}/`)) {
    return false;
  }
  return isInternal(item, viewer) || viewer.board.has(item.number);
}

/**
 * @param {Item} item
 * @param {Viewer} viewer
 * @returns {boolean}
 */
export function isInternal(item, viewer) {
  const login = item.author?.login;
  return typeof login === "string" && login !== "" && viewer.members.has(login.toLowerCase());
}

/**
 * Issue and pull request numbers on the board, from `gh project item-list
 * --format json`. Draft items have no number and items from other
 * repositories are someone else's numbering, so both are left out.
 *
 * @param {unknown} listing
 * @param {string} repo
 * @returns {Set<number>}
 */
export function boardNumbers(listing, repo) {
  const items = /** @type {{ items?: unknown } | null | undefined} */ (listing)?.items;
  /** @type {Set<number>} */
  const numbers = new Set();
  /** @type {unknown[]} */
  const rows = Array.isArray(items) ? items : [];
  for (const row of rows) {
    const item = /** @type {{ content?: unknown } | null} */ (row);
    const content = /** @type {Record<string, unknown>} */ (item?.content ?? {});
    if (
      typeof content.number === "number" &&
      typeof content.repository === "string" &&
      content.repository.toLowerCase() === repo.toLowerCase()
    ) {
      numbers.add(content.number);
    }
  }
  return numbers;
}

/**
 * Does this command name a specific issue or pull request?
 *
 * @param {string[]} argv
 * @returns {boolean}
 */
export function namesItem(argv) {
  const [group, verb] = argv;
  if (group !== "issue" && group !== "pr") {
    return false;
  }
  return verb !== undefined && SELECTOR_VERBS[group].has(verb);
}

/**
 * Which issues or pull requests does this command name?
 *
 * Deliberately stricter than gh: the selectors must come first, straight
 * after the verb. gh accepts them anywhere, and every position that is not
 * checked is a way past the check — so anything that looks like a stray
 * second selector is refused rather than guessed about.
 *
 * @param {string[]} argv
 * @returns {{ selectors: string[] } | { error: string }}
 */
export function selectorsOf(argv) {
  const rest = argv.slice(2);
  const usage = `name the ${argv[0] === "pr" ? "pull request" : "issue"} first: gh ${argv
    .slice(0, 2)
    .join(" ")} <number> [flags]`;

  const selectors = [];
  let index = 0;
  while (index < rest.length && !String(rest[index]).startsWith("-")) {
    selectors.push(String(rest[index]));
    index += 1;
  }
  if (selectors.length === 0) {
    return { error: usage };
  }

  for (; index < rest.length; index += 1) {
    const word = String(rest[index]);
    if (word === "--") {
      return { error: `"--" is not accepted here; ${usage}` };
    }
    if (word.startsWith("-")) {
      continue;
    }
    const previous = String(rest[index - 1]);
    const isValue =
      previous.startsWith("-") && !previous.includes("=") && !BOOLEAN_FLAGS.has(previous);
    if (!isValue) {
      return { error: `unexpected "${word}" after the flags; ${usage}` };
    }
  }
  return { selectors };
}

/**
 * The `--url` of `gh project item-add`, which names what goes on the board.
 *
 * @param {string[]} argv
 * @returns {string | null}
 */
export function itemAddUrl(argv) {
  const at = argv.findIndex((word) => word === "--url" || word.startsWith("--url="));
  if (at === -1) {
    return null;
  }
  const value = argv[at].startsWith("--url=") ? argv[at].slice("--url=".length) : argv[at + 1];
  return value === undefined || value === "" ? null : value;
}

/**
 * Rewrite an `issue list` / `pr list` so that hubd gets rows it can filter.
 *
 * Without `--json`, hubd asks for JSON itself and prints a plain table
 * afterwards. With `--json`, it adds the fields it needs and strips them out
 * again. `--jq` and `--template` are refused: they run inside gh, before
 * hubd could filter anything. `jq` is in every sandbox; pipe to it instead.
 *
 * @param {string[]} argv
 * @returns {{ argv: string[], fields: string[] | null } | { error: string }}
 */
export function prepareList(argv) {
  const group = argv[0] === "pr" ? "pr" : "issue";

  for (const word of argv) {
    const flag = word.split("=")[0] ?? word;
    if (UNFILTERABLE.includes(flag)) {
      return {
        error: `${flag} is not available through hub, which filters list output; use --json and pipe to jq`,
      };
    }
  }

  const at = argv.findIndex((word) => word === "--json" || word.startsWith("--json="));
  if (at === -1) {
    return {
      argv: [...argv, "--json", [...new Set([...DEFAULT_FIELDS[group], ...NEEDED])].join(",")],
      fields: null,
    };
  }

  const inline = argv[at].startsWith("--json=");
  const value = inline ? argv[at].slice("--json=".length) : argv[at + 1];
  if (value === undefined || value === "" || value.startsWith("-")) {
    return { error: "--json needs a comma-separated field list" };
  }
  const fields = value.split(",").filter((field) => field !== "");
  const wanted = [...fields, ...NEEDED.filter((field) => !fields.includes(field))].join(",");

  const rewritten = [...argv];
  if (inline) {
    rewritten[at] = `--json=${wanted}`;
  } else {
    rewritten[at + 1] = wanted;
  }
  return { argv: rewritten, fields };
}

/**
 * Print filtered rows the way gh would have: the requested JSON fields, or
 * gh's own tab-separated non-terminal table.
 *
 * @param {"issue" | "pr"} group
 * @param {Record<string, unknown>[]} rows
 * @param {string[] | null} fields
 * @returns {string}
 */
export function renderList(group, rows, fields) {
  if (fields !== null) {
    const picked = rows.map((row) =>
      Object.fromEntries(
        fields.filter((field) => field in row).map((field) => [field, row[field]]),
      ),
    );
    return `${JSON.stringify(picked, null, 2)}\n`;
  }

  return rows
    .map((row) =>
      DEFAULT_FIELDS[group]
        .map((field) => {
          /** @type {unknown} */
          const value = row[field];
          if (field === "labels" && Array.isArray(value)) {
            /** @type {{ name?: unknown }[]} */
            const labels = value;
            return labels.map((label) => String(label.name)).join(", ");
          }
          return typeof value === "string" || typeof value === "number" ? String(value) : "";
        })
        .join("\t"),
    )
    .map((line) => `${line}\n`)
    .join("");
}
