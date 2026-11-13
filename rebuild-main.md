# T3 Code fork: rebase the feature branches and rebuild main

Run by t3-worker (`scheduled-update-worker.md`) twice a day. It is the only machine that rebases
and pushes; the laptops only install what it pushed. Never open a pull request against
`pingdotgg/t3code`, never post to the discussion, never push to `upstream`.

Paths: fork checkout `~/code/t3dotgg/t3code`, kept on branch `main`. Remotes: `origin` is
`jappyjan/t3code`, `upstream` is `pingdotgg/t3code`.

Push with the `jappyjan` GitHub credential over HTTPS, not SSH:
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/jappyjan/t3code.git <refs>`
(use `--force-with-lease=<branch>:<expected sha>` for each force-pushed ref).

The run has two phases. First each feature branch is rebased on its own, checked and pushed.
Only then is `main` rebuilt from the branches that made it. A branch that fails never stops the
run: it is left out, kept unchanged, and named in the report.

## Branches

In stack order. Each branch is rebased onto the last branch before it that made it into this run
(the first onto `upstream/main`), so a branch that drops out does not drag the later ones with it.

| #   | Branch                     | Needs               | Status | What it is                                                                                                                                                                                       |
| --- | -------------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `feat/pipelines`           | -                   | active | Pipelines. Proposed upstream in discussion `pingdotgg/t3code#26694`, so it must keep working on its own.                                                                                         |
| 2   | `feat/linear`              | pipelines           | active | Linear integration.                                                                                                                                                                              |
| 3   | `feat/host-capacity`       | -                   | active | Host capacity. First commit ports upstream PR `pingdotgg/t3code#27253` (memory pressure warnings); later commits cap concurrent turns per machine.                                              |
| 4   | `feat/multi-repo-projects` | pipelines, linear   | parked | Multi-repo projects, a port of upstream PR `#26254` plus Pipelines/Linear glue. Parked 2026-11-14: upstream closed #26254 for #35921 and #35925, and the port no longer rebases (see below). |

"Needs" lists the branches whose code it builds on. If one of them dropped out this run, skip the
branch too (report it as "skipped: needs <branch>").

A **parked** branch is not rebased or merged at all; leave it exactly as it is and list it in the
report with its reason. Only Jan parks or unparks a branch, by editing this table.

### Fork points

Each branch's own commits start at its fork point, kept as the local ref
`refs/fork-base/<branch>` (for example `refs/fork-base/feat/linear`). It is the commit the
branch's own commits sit on: the tip of the branch it was last rebased onto. Never derive it from
`origin/<parent>`, which may already have moved. If a fork-point ref is missing, skip that branch
and report it; do not guess.

## Checks

"Checks" means, in the checkout: `pnpm install --frozen-lockfile`, then
`pnpm exec vp run check:changed upstream/main`. Failures that need a browser the host lacks
(Playwright Chromium: `Executable doesn't exist at .../chromium_headless_shell-...`) are known and
unrelated. Any other failure counts.

`apps/server/src/provider/agentContextBudget.json` holds the measured size of the agent-facing
text. The fork adds MCP tools, so after a rebase it is often wrong; when
`AgentContextBudget.test.ts` fails, set the JSON to the measured values it prints.

## Steps

1. If the working tree has uncommitted changes, or the branch is not `main`, skip the rest of this
   file and say so in the report. Never stash, reset or discard work.
2. `git fetch --multiple upstream origin`. Agents land work by pushing feature branches to
   `origin`, so bring each local feature branch up to its `origin` copy: if the local branch does
   not exist yet, create it with `git branch <branch> origin/<branch>`; if it is an ancestor of
   `origin/<branch>`, `git branch -f <branch> origin/<branch>`. If a local branch has commits that
   `origin` lacks, leave that branch out of this run and report it; never drop its commits.
3. Rebase each active branch, in table order. Keep a variable `base`, starting at `upstream/main`;
   it is always the tip of the last branch that made it. For each branch `B`:
   1. Note `old=$(git rev-parse B)` and `fork=$(git rev-parse refs/fork-base/B)`.
   2. If `B` already sits on `base` (`fork` equals `git rev-parse base`), it needs no rebase: it
      made it unchanged; set `base=B` and go on with the next branch. It still counts as checked
      if its tip is the one the last run checked; otherwise run the checks (3.4).
   3. `git rebase --onto base "$fork" B`. This replays only `B`'s own commits.
      Resolve conflicts so upstream's change and the feature both keep working; read the code
      around them. `git rebase --skip` drops a commit's work, so use it only for a commit you have
      verified is already fully contained (it became empty). Afterwards compare commit subjects
      (`diff <(git log --format=%s "$fork".."$old" | sort) <(git log --format=%s base..B | sort)`);
      only commits that were empty may be missing.
      If a conflict is beyond a confident fix, or the conflicts are so large that resolving them
      means rewriting the feature, `git rebase --abort` and drop the branch (3.6).
   4. Run the checks on `B`. Fix failures caused by `B`'s code on `B`, matching the surrounding
      code, and commit them as `fix(<pipelines|linear|host-capacity|multi-repo>): build on latest
      upstream main`. Failures in an earlier branch's code mean that branch's fix is missing: fix
      it there only if it is still this run's `base` chain, then rebase `B` again; otherwise drop
      `B`. If `B` cannot be made green, drop it (3.6).
   5. `B` made it: `git update-ref refs/fork-base/B <tip of base>` (the commit you rebased onto),
      push it right away (`--force-with-lease=B:<sha of origin/B>`), and set `base=B`. If the
      lease is rejected, someone pushed to `B` meanwhile: do not force; reset `B` to `old`,
      restore `refs/fork-base/B` to `fork`, and drop it (3.6) with that reason.
   6. Dropping `B`: `git checkout main`, `git branch -f B "$old"`, keep `refs/fork-base/B` at
      `fork`, and save it as `refs/wip/<YYYY-MM-DD>/<B with / replaced by ->`
      (`git update-ref ... "$old"`). `base` stays as it was. Note the reason and go on with the
      next branch. Never push a dropped branch.

   Upstream PRs the branches port: if upstream `main` now contains #27253, the rebase drops or
   empties host-capacity's first commit; if upstream changed it, prefer upstream's version, keep
   the cap commits, and report that #27253 landed. While it is open, check whether its head moved
   (`gh pr view 27253 --repo pingdotgg/t3code --json headRefOid,updatedAt`) and mention new
   commits; do not port them automatically. For the parked multi-repo branch, report the state of
   #35921 and #35925 (`gh pr view <n> --repo pingdotgg/t3code --json state,mergedAt`).
4. Rebuild `main` from the branches that made it.
   1. Make sure nobody committed to `main` directly: every commit in `origin/main` must be in
      `upstream/main`, a feature branch, or a ref you saved this run
      (`git log origin/main --not upstream/main <all feature branches> refs/wip/` prints nothing,
      where `refs/wip/` stands for the refs saved under it, e.g. `--glob=refs/wip/*`). If something
      shows up, stop and report it instead of overwriting it.
   2. The branches that made it form one stack, so `main` is the last of them:
      `git checkout main && git reset --hard <base>` (with `base` from step 3; `upstream/main` if
      no branch made it). If that equals `origin/main`, report "main unchanged" and stop here.
   3. Run the checks once more on `main` (skip this when `main` equals the last branch you just
      checked, which is the usual case).
   4. Push `main` with `--force-with-lease=main:<sha of origin/main>`. If the lease is rejected,
      fetch and report it; do not force.

   Note whether this run pushed a new `main`, its short SHA, and which feature branches are in it.
   A branch that was in the previous `main` but not in this one is a feature the machines lose on
   their next install: say so at the top of the report.

## Schema rule

The Pipelines tables are created by `apps/server/src/persistence/PipelineSchema.ts`, outside the
numbered migrations. Never give them a numbered migration: the migrator would later treat an
upstream migration with the same id as already applied, and the app would refuse to start. The same
goes for the multi-repo tables and columns (`projection_projects.tracked_folders_json`,
`task_folders`): they live in the fork schema module
`apps/server/src/persistence/MultiRepoSchema.ts`, never in a numbered migration. A `main` without
the multi-repo branch still starts on a database that has them (the column has a default).

## Parked: feat/multi-repo-projects

On 2026-11-14 a rebase onto upstream `main` (1017 commits newer than its base) conflicted in 50
files even as one squashed change (16.5k lines over checkpointing, worktrees, provider adapters,
diff/review and Git actions). Upstream also closed the PR it ports (#26254) and split it into
#35921 (tracked repositories) and #35925 (worktree isolation), both still open. The branch is kept
unchanged at `c7af02dfbb` (also `refs/wip/2026-11-14/feat-multi-repo-projects`) and is not in
`main`. Jan decides whether to re-port it onto the new upstream PRs or to wait for them to land.
