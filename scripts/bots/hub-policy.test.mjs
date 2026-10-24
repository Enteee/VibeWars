/**
 * Every test here is a way the company could damage itself.
 *
 * `hub-policy.mjs` is the only enforcement of the kanban rules that depends
 * on nothing but code: GitHub rulesets cover the mechanical invariants (no
 * direct push to main, checks must pass) but cannot tell our nine agents
 * apart, because they share one GitHub identity. So "only QA merges" and
 * "two reviewers must sign off" are enforced here or not at all, and they are
 * worth asserting one by one rather than trusting a reading of the table.
 */
import { describe, expect, it } from "vitest";

import { ROLES, authorize, parseMerge, parseReview, touchesGate } from "./hub-policy.mjs";

/** A reviewed commit, as `--sha` names it. */
const SHA = "b02a5cc7";

/**
 * @param {string} role
 * @param {string[]} argv
 */
const gh = (role, argv) => authorize(role, { kind: "gh", argv });
/**
 * @param {string} role
 * @param {string[]} argv
 */
const push = (role, argv) => authorize(role, { kind: "push", argv });
/**
 * @param {string} role
 * @param {string[]} argv
 */
const review = (role, argv) => authorize(role, { kind: "review", argv });

describe("the roster", () => {
  it("is the nine employees, and nothing else is a role", () => {
    expect(ROLES).toHaveLength(9);
    expect(gh("intern", ["issue", "list"])).toMatchObject({ allow: false });
    expect(gh("", ["issue", "list"])).toMatchObject({ allow: false });
  });
});

describe("merging", () => {
  it("is allowed for qa-tester, behind three guards", () => {
    const verdict = gh("qa-tester", ["pr", "merge", "22", "--squash"]);

    expect(verdict.allow).toBe(true);
    expect(verdict.guards).toStrictEqual([
      "checks-green",
      "approved-by:lead-dev",
      "approved-by:perf-sec-qa",
    ]);
  });

  it("is refused for every other role", () => {
    for (const role of ROLES.filter((r) => r !== "qa-tester")) {
      expect(gh(role, ["pr", "merge", "22"]), role).toMatchObject({ allow: false });
    }
  });

  it("is refused for the reviewers specifically, who are the plausible mistake", () => {
    // A lead-dev that has just approved a PR is one step from merging it, and
    // the whole point of the QA gate is that approval is not permission.
    expect(gh("lead-dev", ["pr", "merge", "22"])).toMatchObject({ allow: false });
    expect(gh("perf-sec-qa", ["pr", "merge", "22"])).toMatchObject({ allow: false });
  });

  it("cannot be reached by a developer dressing it up with flags", () => {
    expect(gh("developer-1", ["pr", "merge", "22", "--admin", "--squash"])).toMatchObject({
      allow: false,
    });
  });

  it("names exactly one pull request, by number, so the guard and gh agree on it", () => {
    for (const argv of [
      ["pr", "merge", "https://github.com/Enteee/VibeWars/pull/22"],
      ["pr", "merge", "bot/developer-1/issue-1"],
      ["pr", "merge", "22", "23"],
      ["pr", "merge"],
    ]) {
      expect(gh("qa-tester", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
  });

  it("refuses flags that merge later, bypass the ruleset, or are not a squash", () => {
    for (const flag of [
      "--auto",
      "--admin",
      "--merge",
      "--rebase",
      "--delete-branch",
      "--match-head-commit",
    ]) {
      expect(gh("qa-tester", ["pr", "merge", "22", flag]), flag).toMatchObject({ allow: false });
    }
    expect(
      gh("qa-tester", ["pr", "merge", "22", "--squash", "--subject", "x", "--body=y"]),
    ).toMatchObject({
      allow: true,
    });
  });

  it("parses into the pull request and the flags hubd passes on", () => {
    expect(parseMerge(["pr", "merge", "22", "-s", "-t", "Subject"])).toEqual({
      pr: 22,
      flags: ["--squash", "--subject", "Subject"],
    });
  });
});

describe("reading host files through gh", () => {
  it("is refused in every spelling, since gh runs on the host", () => {
    for (const argv of [
      ["issue", "comment", "1", "--body-file", "/etc/passwd"],
      ["issue", "comment", "1", "--body-file=/etc/passwd"],
      ["issue", "comment", "1", "-F", "x"],
      ["issue", "comment", "1", "-Fx"],
      ["pr", "create", "--body-file", "x"],
      ["pr", "create", "--template", "x"],
      ["pr", "create", "-T", "x"],
      ["pr", "create", "--recover", "x"],
      ["pr", "edit", "1", "-F", "x"],
      // Boolean short flags clustered in front, as gh's parser reads them.
      ["issue", "comment", "5", "-eF/etc/passwd"],
      ["issue", "comment", "5", "-eF", "/etc/passwd"],
      ["issue", "comment", "5", "-eF=/etc/passwd"],
      ["pr", "create", "-dF", "~/.ssh/id_ed25519"],
      ["pr", "create", "-dT", "x"],
      ["pr", "comment", "5", "-wF", "x"],
    ]) {
      expect(gh("developer-1", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
    expect(gh("manager", ["issue", "create", "--body-file", "x"])).toMatchObject({ allow: false });
    expect(gh("cicd-engineer", ["release", "create", "v1", "--notes-file", "x"])).toMatchObject({
      allow: false,
    });
    expect(gh("cicd-engineer", ["release", "create", "v1", "dist.tgz"])).toMatchObject({
      allow: false,
    });
  });

  it("refuses @file field values and --input on the raw API", () => {
    const env = "repos/{owner}/{repo}/environments/x";
    for (const argv of [
      ["api", env, "-F", "k=@/etc/passwd"],
      ["api", env, "-Fk=@/etc/passwd"],
      ["api", env, "--field", "k=@x"],
      ["api", env, "--field=k=@x"],
      ["api", env, "--input", "x"],
      ["api", env, "-iFpayload=@~/.ssh/id_ed25519"],
      ["api", env, "-iF", "payload=@x"],
    ]) {
      expect(gh("cicd-engineer", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
    expect(gh("cicd-engineer", ["api", env, "-F", "k=v"])).toMatchObject({ allow: true });
    expect(gh("cicd-engineer", ["api", env, "-iFk=v"])).toMatchObject({ allow: true });
  });

  it("refuses @file field values on workflow run, which reads them the same way", () => {
    for (const argv of [
      ["workflow", "run", "ci.yml", "-F", "x=@/etc/passwd"],
      ["workflow", "run", "ci.yml", "-Fx=@/etc/passwd"],
      ["workflow", "run", "ci.yml", "--field", "x=@x"],
      ["workflow", "run", "ci.yml", "--field=x=@x"],
    ]) {
      expect(gh("cicd-engineer", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
    expect(gh("cicd-engineer", ["workflow", "run", "ci.yml", "-F", "x=v"])).toMatchObject({
      allow: true,
    });
  });

  it("still allows --body, which is what hub turns --body-file into", () => {
    expect(gh("developer-1", ["issue", "comment", "1", "--body", "hello"])).toMatchObject({
      allow: true,
    });
  });
});

describe("retargeting and parser tricks", () => {
  it("refuses the repository flag in every spelling, and a bare --", () => {
    for (const argv of [
      ["issue", "list", "--repo=other/repo"],
      ["issue", "list", "-Rother/repo"],
      ["issue", "list", "-R", "other/repo"],
      ["pr", "create", "-dRother/repo"],
      ["pr", "create", "-dR", "other/repo"],
      ["project", "item-list", "2", "--owner", "someone-else"],
      ["project", "item-list", "2", "--owner=someone-else"],
      ["issue", "comment", "1", "--", "--body-file", "x"],
    ]) {
      expect(gh("developer-1", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
  });

  it("refuses an API path that climbs out of its allowed prefix", () => {
    for (const path of [
      "repos/{owner}/{repo}/environments/../merges",
      "repos/{owner}/{repo}/environments/%2e%2e/merges",
      "repos/{owner}/{repo}/environments/%2E%2E/merges",
    ]) {
      expect(gh("cicd-engineer", ["api", path]), path).toMatchObject({ allow: false });
    }
  });
});

describe("parseReview", () => {
  it("separates the verdict, the commit, the seat and the note", () => {
    expect(
      parseReview(["approve", "22", "--sha", SHA, "--as", "perf-sec-qa", "looks", "good"]),
    ).toEqual({
      verb: "approve",
      pr: "22",
      sha: SHA,
      seat: "perf-sec-qa",
      note: ["looks", "good"],
    });
  });
});

describe("review verdicts", () => {
  it("are recorded by the two reviewers", () => {
    expect(review("lead-dev", ["approve", "22", "--sha", SHA])).toMatchObject({ allow: true });
    expect(review("perf-sec-qa", ["approve", "22", "--sha", SHA])).toMatchObject({ allow: true });
    expect(review("lead-dev", ["request-changes", "22", "--sha", SHA, "fix", "it"])).toMatchObject({
      allow: true,
    });
  });

  it("must name the commit that was reviewed", () => {
    // Otherwise a commit pushed between reading and approving is approved
    // unseen (#26, item 6). hubd then checks it is still the head.
    expect(review("lead-dev", ["approve", "22"])).toMatchObject({ allow: false });
    expect(review("lead-dev", ["approve", "22", "--sha", "not-a-sha"])).toMatchObject({
      allow: false,
    });
    expect(review("lead-dev", ["approve", "22", "--sha=" + SHA])).toMatchObject({ allow: true });
  });

  it("can only be cast for a seat the role holds", () => {
    const covering = { acting: ["perf-sec-qa", "qa-tester"] };
    const as = (/** @type {string} */ role, /** @type {string} */ seat, acting = { acting: [] }) =>
      authorize(
        role,
        { kind: "review", argv: ["approve", "22", "--sha", SHA, "--as", seat] },
        acting,
      );

    expect(as("perf-sec-qa", "lead-dev")).toMatchObject({ allow: false });
    expect(as("lead-dev", "perf-sec-qa")).toMatchObject({ allow: false });
    expect(as("lead-dev", "perf-sec-qa", covering)).toMatchObject({ allow: true });
    // qa-tester is a seat lead-dev covers, but not a reviewer's seat.
    expect(as("lead-dev", "qa-tester", covering)).toMatchObject({ allow: false });
    expect(as("lead-dev", "lead-dev")).toMatchObject({ allow: true });
  });

  it("cannot be recorded by the role that merges", () => {
    // Otherwise qa-tester could manufacture the approvals that unlock its own
    // merge button, and the three gates collapse into one.
    expect(review("qa-tester", ["approve", "22", "--sha", SHA])).toMatchObject({ allow: false });
  });

  it("cannot be recorded by the author roles", () => {
    expect(review("developer-1", ["approve", "22", "--sha", SHA])).toMatchObject({ allow: false });
    expect(review("manager", ["approve", "22", "--sha", SHA])).toMatchObject({ allow: false });
  });

  it("reject a malformed verdict or pull request number", () => {
    expect(review("lead-dev", ["lgtm", "22"])).toMatchObject({ allow: false });
    expect(review("lead-dev", ["approve", "../../etc"])).toMatchObject({ allow: false });
    expect(review("lead-dev", ["approve"])).toMatchObject({ allow: false });
  });

  it("do not go through gh pr review, which one shared identity cannot use", () => {
    for (const role of ROLES) {
      expect(gh(role, ["pr", "review", "22", "--approve"]), role).toMatchObject({ allow: false });
    }
  });
});

describe("pushing", () => {
  it("lets an implementer push its own namespace", () => {
    expect(push("developer-1", ["bot/developer-1/issue-14"])).toMatchObject({ allow: true });
    expect(push("asset-designer", ["bot/asset-designer/sprites"])).toMatchObject({ allow: true });
  });

  it("keeps every role but cicd-engineer out of workflows and actions (#116)", () => {
    const guard = "paths-outside:.github/workflows/,.github/actions/";
    for (const role of ["developer-1", "developer-2", "asset-designer", "perf-sec-qa"]) {
      expect(push(role, [`bot/${role}/x`]), role).toEqual({ allow: true, guards: [guard] });
    }
    expect(push("cicd-engineer", ["bot/cicd-engineer/x"])).toEqual({ allow: true });
  });

  it("refuses main for everyone, including the role that merges", () => {
    for (const role of ROLES) {
      expect(push(role, ["main"]), role).toMatchObject({ allow: false });
    }
    expect(push("developer-1", ["refs/heads/main"])).toMatchObject({ allow: false });
    expect(push("developer-1", ["HEAD"])).toMatchObject({ allow: false });
  });

  it("refuses another role's namespace", () => {
    expect(push("developer-1", ["bot/developer-2/issue-14"])).toMatchObject({ allow: false });
    expect(push("developer-1", ["bot/architect/whatever"])).toMatchObject({ allow: false });
  });

  it("refuses a refspec, which would sidestep the branch check entirely", () => {
    // `git push origin bot/developer-1/x:main` ends up on main while passing
    // a naive prefix test.
    expect(push("developer-1", ["bot/developer-1/x:main"])).toMatchObject({ allow: false });
  });

  it("refuses force, delete, mirror and prune", () => {
    for (const flag of [
      "-f",
      "--force",
      "--force-with-lease",
      "--delete",
      "-d",
      "--mirror",
      "--prune",
    ]) {
      expect(push("developer-1", ["bot/developer-1/x", flag]), flag).toMatchObject({
        allow: false,
      });
    }
  });

  it("refuses roles that have no business pushing", () => {
    for (const role of ["architect", "lead-dev", "qa-tester"]) {
      expect(push(role, [`bot/${role}/x`]), role).toMatchObject({ allow: false });
    }
  });

  it("lets the manager push its own branches, only ever with the skills guard", () => {
    // The skills guard alone already keeps it out of workflows; the
    // second guard is the same rule every other role gets.
    expect(push("manager", ["bot/manager/skill-x"])).toEqual({
      allow: true,
      guards: [
        "paths-within:.claude/bots/skills/",
        "paths-outside:.github/workflows/,.github/actions/",
      ],
    });
    expect(push("manager", ["bot/developer-1/x"])).toMatchObject({ allow: false });
    expect(push("manager", ["main"])).toMatchObject({ allow: false });
    expect(push("manager", ["bot/manager/x", "--force"])).toMatchObject({ allow: false });
  });

  it("lets the manager open pull requests for its own branches only", () => {
    const create = (/** @type {string[]} */ rest) =>
      authorize("manager", { kind: "gh", argv: ["pr", "create", ...rest] });
    expect(create(["--head", "bot/manager/skill-x", "--title", "t", "--body", "b"])).toEqual({
      allow: true,
    });
    expect(create(["--head=bot/manager/skill-x"]).allow).toBe(true);
    expect(create(["-Hbot/manager/skill-x"]).allow).toBe(true);
    expect(create(["-H=bot/manager/skill-x", "-t", "t", "-d", "-l", "skills"]).allow).toBe(true);
    expect(create(["--head", "bot/developer-1/x"])).toMatchObject({ allow: false });
    expect(create(["--title", "no head"])).toMatchObject({ allow: false });
  });

  it("reads a scoped role's --head the way gh does, and refuses what it cannot", () => {
    const create = (/** @type {string[]} */ rest) =>
      authorize("manager", { kind: "gh", argv: ["pr", "create", ...rest] }).allow;
    // gh takes the last of several, so any second --head is refused.
    expect(create(["--head", "bot/manager/x", "--head", "bot/developer-1/x"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "-H", "bot/manager/y"])).toBe(false);
    expect(create(["-Hbot/manager/x", "--head=bot/developer-1/x"])).toBe(false);
    // A value is consumed whatever it looks like: this title names no head.
    expect(create(["--title", "--head=bot/manager/x"])).toBe(false);
    expect(create(["--title", "--head=bot/manager/x", "-dH", "bot/developer-1/x"])).toBe(false);
    // Clusters, unknown flags, positionals and a missing value are refused.
    expect(create(["--head", "bot/manager/x", "-dH", "bot/developer-1/x"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "--repo", "evil/repo"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "stray"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "--", "-H", "x"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "--title"])).toBe(false);
    expect(create(["--head", "bot/manager/x", "--draft=false"])).toBe(false);
    // Developers are not scoped, as before.
    expect(
      authorize("developer-1", { kind: "gh", argv: ["pr", "create", "--title", "t"] }).allow,
    ).toBe(true);
  });

  it("treats the briefings and skills as gate code", () => {
    expect(touchesGate([".claude/bots/skills/fresh-branch/SKILL.md"])).toBe(true);
    expect(touchesGate([".claude/bots/_protocol.md"])).toBe(true);
  });

  it("refuses an empty branch", () => {
    expect(push("developer-1", [])).toMatchObject({ allow: false });
    expect(push("developer-1", [""])).toMatchObject({ allow: false });
  });
});

describe("the raw API, which is a hole through every other rule", () => {
  it("is refused for everyone but the CI/CD engineer", () => {
    for (const role of ROLES.filter((r) => r !== "cicd-engineer")) {
      expect(gh(role, ["api", "repos/{owner}/{repo}/merges"]), role).toMatchObject({
        allow: false,
      });
    }
  });

  it("is limited to environments and deployments even for the CI/CD engineer", () => {
    expect(gh("cicd-engineer", ["api", "repos/{owner}/{repo}/environments/prod"])).toMatchObject({
      allow: true,
    });
    expect(gh("cicd-engineer", ["api", "repos/{owner}/{repo}/deployments"])).toMatchObject({
      allow: true,
    });
    // The interesting refusals: a merge, and rewriting the protection that
    // backs up this very policy.
    expect(gh("cicd-engineer", ["api", "repos/{owner}/{repo}/merges"])).toMatchObject({
      allow: false,
    });
    expect(gh("cicd-engineer", ["api", "repos/{owner}/{repo}/rulesets"])).toMatchObject({
      allow: false,
    });
    expect(gh("cicd-engineer", ["api", "user"])).toMatchObject({ allow: false });
  });
});

describe("deny by default", () => {
  it("refuses anything not written down, for every role", () => {
    // These are the commands that would end the experiment: an alias runs
    // arbitrary shell, an extension installs arbitrary code, and the rest
    // destroy things.
    const dangerous = [
      ["alias", "set", "x", "!rm -rf /"],
      ["extension", "install", "someone/evil"],
      ["repo", "delete"],
      ["repo", "edit", "--visibility", "private"],
      ["auth", "token"],
      ["secret", "set", "TOKEN"],
      ["ssh-key", "add"],
      ["gpg-key", "add"],
      ["release", "delete", "v1"],
      ["issue", "delete", "1"],
      ["project", "delete", "2"],
    ];
    for (const role of ROLES) {
      for (const argv of dangerous) {
        expect(gh(role, argv), `${role}: ${argv.join(" ")}`).toMatchObject({ allow: false });
      }
    }
  });

  it("refuses an empty command and an unknown request kind", () => {
    expect(gh("manager", [])).toMatchObject({ allow: false });
    expect(authorize("manager", { kind: "exec", argv: ["sh"] })).toMatchObject({ allow: false });
  });

  it("refuses --repo, so nobody can act on a repository nobody is watching", () => {
    expect(gh("manager", ["issue", "list", "--repo", "someone/else"])).toMatchObject({
      allow: false,
    });
    expect(gh("manager", ["issue", "list", "-R", "someone/else"])).toMatchObject({ allow: false });
  });
});

describe("reading", () => {
  it("is open to every role, because an agent cannot act on what it cannot see", () => {
    for (const role of ROLES) {
      for (const argv of [
        ["issue", "list"],
        ["pr", "view", "22"],
        ["pr", "checks", "22"],
        ["project", "item-list", "2"],
        ["run", "view", "123"],
      ]) {
        expect(gh(role, argv), `${role}: ${argv.join(" ")}`).toMatchObject({ allow: true });
      }
    }
  });

  it("does not leak write access through a longer read prefix", () => {
    // `pr view` is open to all; `pr merge` must not inherit that.
    expect(gh("developer-1", ["pr", "view", "22"])).toMatchObject({ allow: true });
    expect(gh("developer-1", ["pr", "merge", "22"])).toMatchObject({ allow: false });
  });
});

describe("the board", () => {
  it("is restructured only by the manager", () => {
    expect(gh("manager", ["project", "field-create", "2"])).toMatchObject({ allow: true });
    expect(gh("manager", ["project", "item-add", "2"])).toMatchObject({ allow: true });
    expect(gh("developer-1", ["project", "item-add", "2"])).toMatchObject({ allow: false });
    expect(gh("architect", ["project", "field-create", "2"])).toMatchObject({ allow: false });
  });

  it("lets the workflow roles move their own cards", () => {
    // Each hand-off is a column change, so this has to be broader than the
    // rest of the board permissions.
    for (const role of ["developer-1", "lead-dev", "perf-sec-qa", "qa-tester", "manager"]) {
      expect(gh(role, ["project", "item-edit"]), role).toMatchObject({ allow: true });
    }
    expect(gh("architect", ["project", "item-edit"])).toMatchObject({ allow: false });
  });
});

describe("the pipeline", () => {
  it("is operated only by the CI/CD engineer", () => {
    expect(gh("cicd-engineer", ["workflow", "run", "ci.yml"])).toMatchObject({ allow: true });
    expect(gh("cicd-engineer", ["run", "rerun", "123"])).toMatchObject({ allow: true });
    expect(gh("cicd-engineer", ["release", "create", "v1"])).toMatchObject({ allow: true });
    for (const argv of [
      ["release", "create", "v1", "--title", "v1", "--notes", "x"],
      ["release", "create", "--title", "v1", "v1", "-n", "x", "--target", "main"],
      ["release", "create", "v1", "-dt", "v1", "--notes=x", "-p"],
    ]) {
      expect(gh("cicd-engineer", argv), argv.join(" ")).toMatchObject({ allow: true });
    }
    for (const argv of [
      ["release", "create", "v1", "--title", "v1", "dist.tgz"],
      ["release", "create", "v1", "-d", "dist.tgz"],
      ["release", "create", "v1", "--draft", "dist.tgz"],
    ]) {
      expect(gh("cicd-engineer", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
    expect(gh("developer-1", ["workflow", "disable", "ci.yml"])).toMatchObject({ allow: false });
    expect(gh("developer-1", ["run", "rerun", "123"])).toMatchObject({ allow: false });
    expect(gh("qa-tester", ["workflow", "disable", "ci.yml"])).toMatchObject({ allow: false });
  });

  it("lets the CI/CD engineer read a failing run and file the bug, and nothing more of issues", () => {
    // #164: watching main is its job, so the log and the bug report are too.
    expect(gh("cicd-engineer", ["run", "view", "123", "--log-failed"])).toMatchObject({
      allow: true,
    });
    expect(
      gh("cicd-engineer", ["issue", "create", "--title", "Bug: main CI red", "--body", "x"]),
    ).toMatchObject({ allow: true });
    expect(gh("cicd-engineer", ["issue", "comment", "170", "--body", "again"])).toMatchObject({
      allow: true,
    });
    expect(gh("cicd-engineer", ["issue", "edit", "170"])).toMatchObject({ allow: false });
    expect(gh("cicd-engineer", ["issue", "close", "170"])).toMatchObject({ allow: false });
    expect(gh("developer-1", ["issue", "create", "--title", "x"])).toMatchObject({ allow: false });
  });
});

describe("touchesGate", () => {
  it("flags changes to the definitions of the quality gates", () => {
    expect(touchesGate([".github/workflows/ci.yml"])).toBe(true);
    expect(touchesGate(["eslint.config.mjs"])).toBe(true);
    expect(touchesGate(["devenv.nix"])).toBe(true);
    // The policy protecting the company counts as a gate.
    expect(touchesGate(["scripts/bots/hub-policy.mjs"])).toBe(true);
  });

  it("does not flag ordinary work", () => {
    expect(touchesGate(["packages/game-core/src/skills/catalog.ts"])).toBe(false);
    expect(touchesGate(["apps/web/src/main.ts", "README.md"])).toBe(false);
    expect(touchesGate([])).toBe(false);
  });
});

describe("borrowed hats", () => {
  const acting = { acting: ["perf-sec-qa", "qa-tester"] };

  it("lets a covering role do the absent role's job", () => {
    // The company is short of bots, so one agent holds several gates.
    expect(
      authorize("lead-dev", { kind: "gh", argv: ["pr", "merge", "22"] }, acting),
    ).toMatchObject({ allow: true, as: "qa-tester" });
    expect(
      authorize("lead-dev", { kind: "push", argv: ["bot/perf-sec-qa/x"] }, acting),
    ).toMatchObject({ allow: true, as: "perf-sec-qa" });
  });

  it("names which hat it allowed, so the audit log can record it", () => {
    const verdict = authorize("lead-dev", { kind: "gh", argv: ["pr", "merge", "22"] }, acting);

    // Without `as`, a merge by lead-dev would be indistinguishable from a
    // policy bug that let the wrong role merge.
    expect(verdict.as).toBe("qa-tester");
  });

  it("still carries the merge guards when merging under a borrowed hat", () => {
    // The gates are not what is being relaxed — only who may stand at them.
    const verdict = authorize("lead-dev", { kind: "gh", argv: ["pr", "merge", "22"] }, acting);

    expect(verdict.guards).toStrictEqual([
      "checks-green",
      "approved-by:lead-dev",
      "approved-by:perf-sec-qa",
    ]);
  });

  it("grants nothing when no hat permits it either", () => {
    expect(
      authorize("lead-dev", { kind: "gh", argv: ["workflow", "disable", "ci.yml"] }, acting),
    ).toMatchObject({ allow: false });
    expect(authorize("lead-dev", { kind: "gh", argv: ["repo", "delete"] }, acting)).toMatchObject({
      allow: false,
    });
  });

  it("changes nothing for a role that has been given no hats", () => {
    // hubd looks `acting` up by role in company.json, so a role with no entry
    // is called with an empty list and must be unaffected. Handing
    // developer-1 lead-dev's hats WOULD let it merge — that is the whole
    // mechanism, and it is exactly why the list comes from configuration on
    // the host and never from the request.
    expect(
      authorize("developer-1", { kind: "gh", argv: ["pr", "merge", "22"] }, { acting: [] }),
    ).toMatchObject({ allow: false });
    expect(authorize("lead-dev", { kind: "gh", argv: ["pr", "merge", "22"] })).toMatchObject({
      allow: false,
    });
  });

  it("does not let a hat be invented by the requester", () => {
    // `acting` comes from company.json via hubd, never from the agent. This
    // asserts the shape that matters: an unknown hat grants nothing.
    expect(
      authorize(
        "developer-1",
        { kind: "gh", argv: ["pr", "merge", "22"] },
        { acting: ["nonsense"] },
      ),
    ).toMatchObject({ allow: false });
  });
});

describe("company reboot", () => {
  /**
   * @param {string} role
   * @param {string[]} argv
   */
  const reboot = (role, argv) => authorize(role, { kind: "reboot", argv });

  it("is requested and aborted by the manager only", () => {
    expect(reboot("manager", ["request", "load #21"])).toMatchObject({ allow: true });
    expect(reboot("manager", ["abort"])).toMatchObject({ allow: true });
    for (const role of ROLES.filter((r) => r !== "manager")) {
      expect(reboot(role, ["request", "x"]), role).toMatchObject({ allow: false });
      expect(reboot(role, ["abort"]), role).toMatchObject({ allow: false });
    }
  });

  it("lets every role say it is ready, and nothing more", () => {
    for (const role of ROLES) {
      expect(reboot(role, ["ready"]), role).toMatchObject({ allow: true });
      expect(reboot(role, ["ready", "x"]), role).toMatchObject({ allow: false });
    }
  });

  it("needs a reason, and nothing else", () => {
    for (const argv of [["request"], ["request", " "], ["request", "a", "b"], ["abort", "x"], []]) {
      expect(reboot("manager", argv), argv.join(" ")).toMatchObject({ allow: false });
    }
  });
});

describe("closing and reopening", () => {
  /**
   * The reason a refused command gives; fails if it was allowed.
   *
   * @param {string} role
   * @param {string[]} argv
   * @returns {string}
   */
  const refusal = (role, argv) => {
    const verdict = gh(role, argv);
    expect(verdict.allow, `${role} ${argv.join(" ")}`).toBe(false);
    return verdict.reason ?? "";
  };

  it("is the manager's, for pull requests and issues, with a comment or a reason", () => {
    for (const argv of [
      ["pr", "close", "81"],
      ["pr", "close", "81", "--comment", "superseded by #80"],
      ["pr", "close", "81", "-c", "superseded by #80"],
      ["pr", "reopen", "81"],
      ["issue", "close", "70", "--reason", "not planned"],
      ["issue", "reopen", "70"],
    ]) {
      expect(gh("manager", argv), argv.join(" ")).toStrictEqual({ allow: true });
    }
  });

  it("never deletes the branch, in any spelling", () => {
    for (const argv of [
      ["pr", "close", "81", "--delete-branch"],
      ["pr", "close", "81", "--delete-branch=true"],
      ["pr", "close", "81", "-d"],
      ["pr", "close", "81", "-cd", "x"],
    ]) {
      expect(refusal("manager", argv)).toContain("--delete-branch");
    }
  });

  it("is refused for every other role, which is told to ask the manager", () => {
    for (const role of ROLES.filter((r) => r !== "manager")) {
      for (const argv of [
        ["pr", "close", "1"],
        ["pr", "reopen", "1"],
        ["issue", "close", "1"],
      ]) {
        expect(refusal(role, argv)).toContain("ask the manager");
      }
    }
  });

  it("does not let the manager merge", () => {
    expect(refusal("manager", ["pr", "merge", "81", "--squash"])).toContain("ask the qa-tester");
  });

  it("names nobody when nobody may", () => {
    expect(refusal("manager", ["pr", "status"])).toContain("no role may");
  });
});

describe("board reads", () => {
  it("lets every role read hubd's copy of the board, and nothing else through it", () => {
    for (const role of ROLES) {
      for (const argv of [["ls"], ["ls", "In Review"], ["show", "14"], ["changes"]]) {
        expect(authorize(role, { kind: "board", argv }).allow, `${role} ${argv.join(" ")}`).toBe(
          true,
        );
      }
    }
    expect(authorize("developer-1", { kind: "board", argv: ["move", "14", "Done"] }).allow).toBe(
      false,
    );
  });
});
