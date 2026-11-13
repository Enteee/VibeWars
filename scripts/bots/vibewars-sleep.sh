#!/usr/bin/env bash
# Hibernate the company host and wake it at the time hubd asked for (#2794).
# The one copy: claude-llc-init installs it on Debian, and
# nix/nixos/vibewars-sleep.nix runs it on NixOS. Sourcing it defines
# `valid_wake` and does nothing else, which is how its test calls the check.
set -u
request=/run/vibewars-sleep/request

# valid_wake <text> <now>: a decimal unix time, past the floor, within the cap.
# The floor and the cap are MIN_WAKE and MAX_SLEEP in hub-sleep.mjs.
valid_wake() {
  case "$1" in
    "" | *[!0-9]*) return 1 ;;
  esac
  [ "${#1}" -le 12 ] && [ "$((10#$1))" -ge "$(($2 + 840))" ] && [ "$((10#$1))" -le "$(($2 + 608400))" ]
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
  wake="$(head -c 32 "$request" | tr -d '\n')"
  rm -f "$request"
  if ! valid_wake "$wake" "$(date +%s)"; then
    echo "vibewars-sleep: refused: not a time between the floor and the cap"
    return 1
  fi
  rtcwake -m no -t "$wake" && systemctl hibernate
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main
fi
