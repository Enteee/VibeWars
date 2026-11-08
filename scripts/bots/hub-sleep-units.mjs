/**
 * The root side of hibernating the company host (#2794), as `claude-llc-init`
 * installs it. hubd has no sudo: it can only write a wake time to
 * `/run/vibewars-sleep/request`. A root path unit starts a oneshot that
 * reads it, refuses anything but a sane future time, sets the RTC alarm and
 * hibernates through systemd, so logind's inhibitors and the sleep hooks
 * still apply. The worst a compromised hub can do is sleep the box for the
 * cap.
 */

import { MAX_SLEEP } from "./hub-sleep.mjs";

export const SLEEP_DIR = "/run/vibewars-sleep";
export const SLEEP_REQUEST = `${SLEEP_DIR}/request`;
export const SLEEP_SCRIPT = "/usr/local/libexec/vibewars-sleep";
export const SLEEP_PATH_UNIT = "/etc/systemd/system/vibewars-sleep.path";
export const SLEEP_SERVICE_UNIT = "/etc/systemd/system/vibewars-sleep.service";
export const SLEEP_TMPFILES = "/etc/tmpfiles.d/vibewars-sleep.conf";

/**
 * The oneshot. Sourcing it defines `valid_wake` and does nothing else, which
 * is how its test calls the check.
 */
export const SLEEP_SCRIPT_TEXT = `#!/usr/bin/env bash
# Hibernate the company host and wake it at the time hubd asked for (#2794).
set -u
request=${SLEEP_REQUEST}

# valid_wake <text> <now>: a decimal unix time, ahead of now, within the cap.
valid_wake() {
  case "$1" in
    "" | *[!0-9]*) return 1 ;;
  esac
  [ "\${#1}" -le 12 ] && [ "$((10#$1))" -gt "$2" ] && [ "$((10#$1))" -le "$(($2 + ${String(MAX_SLEEP)}))" ]
}

main() {
  # The path unit also fires for hubd's temporary file and for the rm below.
  [ -e "$request" ] || [ -L "$request" ] || return 0
  # The directory is the company user's: never follow what it put there.
  if [ -L "$request" ] || [ ! -f "$request" ]; then
    rm -f "$request"
    echo "vibewars-sleep: refused: the request is not a plain file"
    return 1
  fi
  wake="$(head -c 32 "$request" | tr -d '\\n')"
  rm -f "$request"
  if ! valid_wake "$wake" "$(date +%s)"; then
    echo "vibewars-sleep: refused: not a future time within the cap"
    return 1
  fi
  rtcwake -m no -t "$wake" && systemctl hibernate
}

if [ "\${BASH_SOURCE[0]}" = "$0" ]; then
  main
fi
`;

export const SLEEP_PATH_TEXT = `[Unit]
Description=Hibernate requests from the VibeWars company

[Path]
PathModified=${SLEEP_REQUEST}

[Install]
WantedBy=multi-user.target
`;

export const SLEEP_SERVICE_TEXT = `[Unit]
Description=Hibernate the VibeWars company host until its wake time

[Service]
Type=oneshot
ExecStart=${SLEEP_SCRIPT}
`;

/**
 * @param {string} user who owns the request directory
 * @returns {string}
 */
export function sleepTmpfiles(user) {
  return `d ${SLEEP_DIR} 0700 ${user} - -\n`;
}

/**
 * What a NixOS host adds to its configuration instead of the files above.
 *
 * @param {string} user
 * @returns {string}
 */
export function sleepNixosSnippet(user) {
  const script = SLEEP_SCRIPT_TEXT.replaceAll("''", "'''").replaceAll("${", "''${");
  return [
    `systemd.tmpfiles.rules = [ "d ${SLEEP_DIR} 0700 ${user} - -" ];`,
    `systemd.paths.vibewars-sleep = {`,
    `  wantedBy = [ "multi-user.target" ];`,
    `  pathConfig.PathModified = "${SLEEP_REQUEST}";`,
    `};`,
    `systemd.services.vibewars-sleep = {`,
    `  path = with pkgs; [ coreutils util-linux systemd ];`,
    `  serviceConfig.Type = "oneshot";`,
    `  script = ''`,
    script,
    `  '';`,
    `};`,
  ].join("\n");
}
