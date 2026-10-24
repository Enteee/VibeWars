/**
 * How the host runs git near anything an agent can write.
 *
 * Shared by hubd and the reboot's restarter, the two host processes that
 * run git with the operator's authority.
 */

/**
 * Settings that make git run a command: hooks, an fsmonitor, an SSH or proxy
 * command, a credential or askpass helper, an external diff, and the `ext::`
 * transport. hubd runs git only in its mirror, but it fetches from the
 * company's shared repository, which every agent can write, and git hands
 * `-c` on to the upload-pack it runs there. `-c` beats that repository's
 * own config, so these pin each to something inert (#26).
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
];

/** No system or global config either, so nothing outside the repository changes what runs. */
export const GIT_ENV = { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
