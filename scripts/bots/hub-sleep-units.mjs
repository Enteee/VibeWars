/**
 * The root side of hibernating the company host (#2794), as `claude-llc-init`
 * installs it. hubd has no sudo: it can only write a wake time to
 * `/run/vibewars-sleep/request`. A root path unit starts a oneshot that
 * reads it, refuses any time nearer than the floor or past the cap, sets the
 * RTC alarm and hibernates through systemd, so the sleep hooks still apply.
 * hubd checks logind's inhibitors before it asks; root's hibernate is not
 * held to them. The worst a compromised hub can do is sleep the box for the
 * cap.
 */

import fs from "node:fs";

export const SLEEP_DIR = "/run/vibewars-sleep";
export const SLEEP_REQUEST = `${SLEEP_DIR}/request`;
export const SLEEP_SCRIPT = "/usr/local/libexec/vibewars-sleep";
export const SLEEP_PATH_UNIT = "/etc/systemd/system/vibewars-sleep.path";
export const SLEEP_SERVICE_UNIT = "/etc/systemd/system/vibewars-sleep.service";
export const SLEEP_TMPFILES = "/etc/tmpfiles.d/vibewars-sleep.conf";

/**
 * The oneshot, the repo's one copy of it: NixOS runs the same file through
 * `nix/nixos/vibewars-sleep.nix`.
 */
export const SLEEP_SCRIPT_TEXT = fs.readFileSync(
  new URL("./vibewars-sleep.sh", import.meta.url),
  "utf8",
);

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
TimeoutStartSec=30
ExecStart=${SLEEP_SCRIPT}
`;

/**
 * @param {string} user who owns the request directory
 * @returns {string}
 */
export function sleepTmpfiles(user) {
  return `d ${SLEEP_DIR} 0700 ${user} - -\n`;
}
