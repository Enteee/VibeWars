#!/usr/bin/env bash
# The company runner's job-started hook (#1889, ADR-0045), shipped
# read-only by the jail and never by the workflow: the runner runs it before
# a job's first step, and a non-zero exit fails the job.
#
# It is the backstop against a fork's pull request that edits `runs-on` to
# land on the company's runners. A job runs only for an event on the
# allowlist, runner-events.json, which the workflows' `runs-on` is tested
# against too (#1891): an event in `any` always, one in `sameRepository`
# only when the pull request's head is a branch of this repository.
# Anything else, and anything unreadable, fails the job. jq parses both.
#
# Reads GITHUB_EVENT_NAME, GITHUB_EVENT_PATH and GITHUB_REPOSITORY, which
# the runner sets, and VIBEWARS_RUNNER_EVENTS, which the jail sets.
set -euo pipefail

refuse() {
  echo "company runner: $1; this runner runs pushes, schedules, dispatches and pull requests of ${GITHUB_REPOSITORY:-its repository} only." >&2
  exit 1
}

[ -n "${GITHUB_REPOSITORY:-}" ] || refuse "no GITHUB_REPOSITORY"
[ -r "${GITHUB_EVENT_PATH:-}" ] || refuse "no event file"
[ -r "${VIBEWARS_RUNNER_EVENTS:-}" ] || refuse "no event allowlist"
jq -e 'type == "object"' "$GITHUB_EVENT_PATH" >/dev/null || refuse "unreadable event file"

name="${GITHUB_EVENT_NAME:-}"
allowed="$(jq -er --arg name "$name" '
  if (.any | type) != "array" or (.sameRepository | type) != "array" then error("malformed")
  elif .any | index($name) then "any"
  elif .sameRepository | index($name) then "sameRepository"
  else "no" end' "$VIBEWARS_RUNNER_EVENTS")" || refuse "unreadable event allowlist"

case "$allowed" in
  any) ;;
  sameRepository)
    head="$(jq -er '.pull_request.head.repo.full_name // ""' "$GITHUB_EVENT_PATH")" ||
      refuse "unreadable event file"
    [ "$head" = "$GITHUB_REPOSITORY" ] || refuse "pull request from '$head'"
    ;;
  *) refuse "event '$name'" ;;
esac
