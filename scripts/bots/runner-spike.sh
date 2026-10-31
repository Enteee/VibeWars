#!/usr/bin/env bash
# The company runner's spike (#1889, ADR-0045), for the operator to run once,
# before COMPANY_RUNNERS is set. It proves on GitHub what the unit tests
# cannot:
#
#   1. a jailed runner takes the `ci` job of a real pull request and runs it;
#   2. the workflow's `env:` does not reach the job-started hook (the spike
#      job sets VIBEWARS_RUNNER_EVENTS to a missing file, which the hook
#      would refuse);
#   3. the runner is deregistered after its one job;
#   4. a replayed copy of its JIT config takes no second job.
#
# It pushes a throwaway branch whose `ci` job runs on this runner's label,
# opens a draft pull request for it, and removes both, the runs and any
# runner left registered, when it ends. The operator's checkout and index
# are not touched: the spike commit is written with git plumbing.
#
# Run it from a checkout of PR #1895's branch, inside `devenv shell` with
# `vibewars.claudeBot.enable` (which puts `vibewars-runner-jail` on PATH),
# with `gh` logged in as someone who may register runners on the repo:
#
#     scripts/bots/runner-spike.sh
set -euo pipefail

repo=Enteee/VibeWars
stamp=$(date +%s)
name="spike-1889-$stamp"
label="vibewars-spike-$stamp"
branch="spike/runner-1889-$stamp"

for tool in gh git jq vibewars-runner-jail; do
  command -v "$tool" >/dev/null || {
    echo "runner-spike: $tool is not on PATH (run inside devenv shell)" >&2
    exit 2
  }
done
gh auth status >/dev/null 2>&1 || {
  echo "runner-spike: gh is not logged in" >&2
  exit 2
}

umask 077
work=$(mktemp -d)
pr=""
cleanup() {
  echo "== cleanup"
  for run in $(gh run list -R "$repo" --branch "$branch" --json databaseId --jq '.[].databaseId' 2>/dev/null); do
    gh run cancel -R "$repo" "$run" >/dev/null 2>&1 || true
  done
  if [ -n "$pr" ]; then
    gh pr close -R "$repo" "$pr" --delete-branch >/dev/null 2>&1 || true
  else
    git push -q origin ":refs/heads/$branch" 2>/dev/null || true
  fi
  for id in $(gh api "repos/$repo/actions/runners" --jq ".runners[] | select(.name == \"$name\") | .id" 2>/dev/null); do
    gh api -X DELETE "repos/$repo/actions/runners/$id" >/dev/null 2>&1 || true
  done
  rm -rf "$work"
}
trap cleanup EXIT

# The spike commit: HEAD with the `ci` job on this runner's label and the
# hook's allowlist pointed at nothing, written without touching the index.
echo "== spike branch $branch"
git show HEAD:.github/workflows/ci.yml |
  awk -v label="$label" '
    /^  ci:$/ { job = 1 }
    job && /^    runs-on: ubuntu-latest$/ {
      print "    runs-on: [self-hosted, " label "]"
      print "    env:"
      print "      VIBEWARS_RUNNER_EVENTS: /nonexistent"
      job = 0
      next
    }
    { print }
  ' >"$work/ci.yml"
grep -q "runs-on: \[self-hosted, $label\]" "$work/ci.yml" || {
  echo "runner-spike: could not find the ci job's runs-on in ci.yml" >&2
  exit 1
}
export GIT_INDEX_FILE="$work/index"
git read-tree HEAD
blob=$(git hash-object -w "$work/ci.yml")
git update-index --cacheinfo "100644,$blob,.github/workflows/ci.yml"
tree=$(git write-tree)
unset GIT_INDEX_FILE
spike=$(git commit-tree "$tree" -p HEAD -m "SPIKE #1889: ci on a company runner (never merge)")
git push -q origin "$spike:refs/heads/$branch"
pr=$(gh pr create -R "$repo" --draft --base main --head "$branch" \
  --title "SPIKE #1889: company runner (never merge)" \
  --body "Throwaway for scripts/bots/runner-spike.sh; it closes itself." | grep -o '[0-9]*$')
echo "   draft PR #$pr"

jit() {
  gh api -X POST "repos/$repo/actions/runners/generate-jitconfig" \
    -f name="$name" -F runner_group_id=1 \
    -f 'labels[]=self-hosted' -f "labels[]=$label" -f work_folder=_work \
    --jq .encoded_jit_config
}
jit >"$work/jit"
cp "$work/jit" "$work/jit.replay"

# The ci job of commit $1's run: "<status> <conclusion> <runner>".
ci_job() {
  local run
  run=$(gh run list -R "$repo" --commit "$1" --workflow ci.yml --limit 1 \
    --json databaseId --jq '.[0].databaseId // empty')
  [ -n "$run" ] || return 0
  gh api "repos/$repo/actions/runs/$run/jobs" \
    --jq '.jobs[] | select(.name == "format + lint + typecheck + test + build")
          | "\(.status) \(.conclusion // "-") \(.runner_name // "-")"'
}

echo "== 1+2: the runner takes the ci job (this is the slow part)"
set +e
timeout 5400 vibewars-runner-jail --jitconfig "$work/jit" 2>&1 | tee "$work/runner.log"
runner_exit=${PIPESTATUS[0]}
set -e
sleep 10
job=$(ci_job "$spike")
echo "   runner exit $runner_exit; ci job: ${job:-none}"
case "$job" in
  "completed success $name") took="PASS: ran and passed on $name, with the hook's allowlist env overridden" ;;
  "completed failure $name") took="RAN, but failed: see the run on closed PR #$pr; a 'company runner:' error in Set up job means the workflow env reached the hook" ;;
  *) took="FAIL: the runner did not run the ci job (job: ${job:-none})" ;;
esac

echo "== 3: deregistered after its job"
if gh api "repos/$repo/actions/runners" --jq '.runners[].name' | grep -qx "$name"; then
  gone="FAIL: $name is still registered"
else
  gone="PASS: $name is gone"
fi

echo "== 4: a replayed JIT config takes no second job"
replayed=$(git commit-tree "$tree" -p "$spike" -m "SPIKE #1889: replay")
git push -q origin "$replayed:refs/heads/$branch"
sleep 20
set +e
timeout 180 vibewars-runner-jail --jitconfig "$work/jit.replay" >"$work/replay.log" 2>&1
replay_exit=$?
set -e
job=$(ci_job "$replayed")
case "$job" in
  "queued "* | "") replay="PASS: replay exited $replay_exit, the new ci job stayed queued" ;;
  *) replay="FAIL: the replayed config ran a job (ci job: $job, exit $replay_exit)" ;;
esac

echo
echo "== results (send these to the manager)"
echo "1+2 $took"
echo "3   $gone"
echo "4   $replay"
echo "--- replay log, last lines:"
tail -n 5 "$work/replay.log"
if [ "$runner_exit" -ne 0 ] || [[ $took != PASS* ]]; then
  echo "--- runner log, last lines:"
  tail -n 15 "$work/runner.log"
fi
