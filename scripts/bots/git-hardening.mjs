/**
 * How the host runs git near anything an agent can write.
 *
 * Shared by hubd, the reboot's restarter, and fingerprint.mjs (HEAD for
 * `claude-llc status` and the dashboard): the host processes that run git
 * with the operator's authority.
 */

/**
 * Settings that make git run a command: hooks, an fsmonitor, an SSH or proxy
 * command, a credential or askpass helper, an external diff, the `ext::`
 * transport, a signature check (which runs gpg.program on a signed commit,
 * and GitHub signs every squash merge), and submodule recursion. hubd runs
 * git only in its mirror, but it fetches from the company's shared
 * repository, which every agent can write, and git hands `-c` on to the
 * upload-pack it runs there. `-c` beats that repository's own config, so
 * these pin each to something inert (#26, #21).
 */
export const GIT_HARDENING = [
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.sshCommand=ssh",
  "-c",
  "core.gitProxy=",
  "-c",
  "core.askPass=",
  "-c",
  "credential.helper=",
  "-c",
  "diff.external=",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "merge.verifySignatures=false",
  "-c",
  "log.showSignature=false",
  "-c",
  "gpg.program=false",
  "-c",
  "gpg.ssh.program=false",
  "-c",
  "gpg.x509.program=false",
  "-c",
  "submodule.recurse=false",
];

/**
 * The pins above, for git that talks to GitHub (#866): ssh offers the
 * company's push key and nothing else, so a push is the company's, never
 * the operator's. `-F /dev/null` drops the operator's ~/.ssh/config, whose
 * IdentityFile lines `IdentitiesOnly` would still offer, as `pushIdentity`
 * in creds.mjs does when the doctor asks GitHub whose key it is.
 *
 * @param {string} key the company's private key
 * @returns {string[]} `-c` arguments
 */
export function remoteHardening(key) {
  const command = [
    "ssh",
    "-F",
    "/dev/null",
    "-i",
    shellQuote(key),
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "IdentityAgent=none",
  ].join(" ");
  return GIT_HARDENING.map((arg) =>
    arg === "core.sshCommand=ssh" ? `core.sshCommand=${command}` : arg,
  );
}

/**
 * One word for the shell git runs `core.sshCommand` with.
 *
 * @param {string} word
 * @returns {string}
 */
function shellQuote(word) {
  return `'${word.replaceAll("'", "'\\''")}'`;
}

/**
 * No system or global config either, so nothing outside the repository
 * changes what runs. And no replace refs: `refs/replace/<sha>` is a file any
 * agent can write in the shared repository, and it makes git read a
 * different object under a reviewed sha, so a fast-forward to main would
 * check out an agent's tree (#67).
 */
export const GIT_ENV = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_NO_REPLACE_OBJECTS: "1",
};

/** For `git config --get-regexp`: every setting that names a filter driver's command. */
export const FILTER_KEYS = "^filter\\..*\\.(smudge|clean|process|required)$";

/**
 * Pins for the filter drivers a repository configures. A driver is named by
 * the repository itself (`filter.<name>.smudge`), so it cannot be pinned in
 * advance like the settings above: list them with `FILTER_KEYS`, then pin
 * each one's commands empty. `git config --get-regexp` follows
 * `include.path` the way every other command does, and runs nothing.
 *
 * @param {string} configList the output of `git config --get-regexp FILTER_KEYS`
 * @returns {string[]} `-c` arguments
 */
export function filterPins(configList) {
  /** @type {Set<string>} */
  const names = new Set();
  for (const line of configList.split("\n")) {
    const match = /^filter\.(.+)\.(?:smudge|clean|process|required) /.exec(line);
    if (match?.[1] !== undefined) {
      names.add(match[1]);
    }
  }
  return [...names].flatMap((name) => [
    "-c",
    `filter.${name}.smudge=`,
    "-c",
    `filter.${name}.clean=`,
    "-c",
    `filter.${name}.process=`,
    "-c",
    `filter.${name}.required=false`,
  ]);
}
