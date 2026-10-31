#!/usr/bin/env bash
# The company runner's job-started hook (#1889, ADR-0045), shipped
# read-only by the jail and never by the workflow: the runner runs it before
# a job's first step, and a non-zero exit fails the job.
#
# It is the backstop against a fork's pull request that edits `runs-on` to
# land on the company's runners. A job runs only for a push to this
# repository, or a pull request whose head is a branch of it.
#
# Reads GITHUB_EVENT_NAME, GITHUB_EVENT_PATH and GITHUB_REPOSITORY, which
# the runner sets.
set -euo pipefail

refuse() {
  echo "company runner: $1; this runner runs pushes and pull requests of $GITHUB_REPOSITORY only." >&2
  exit 1
}

[ -n "${GITHUB_REPOSITORY:-}" ] || refuse "no GITHUB_REPOSITORY"
[ -r "${GITHUB_EVENT_PATH:-}" ] || refuse "no event file"

repo="$(jq -r '.repository.full_name // ""' "$GITHUB_EVENT_PATH")"
[ "$repo" = "$GITHUB_REPOSITORY" ] || refuse "event of '$repo'"

case "${GITHUB_EVENT_NAME:-}" in
  push) ;;
  pull_request)
    head="$(jq -r '.pull_request.head.repo.full_name // ""' "$GITHUB_EVENT_PATH")"
    [ "$head" = "$GITHUB_REPOSITORY" ] || refuse "pull request from '$head'"
    ;;
  *) refuse "event '${GITHUB_EVENT_NAME:-}'" ;;
esac
