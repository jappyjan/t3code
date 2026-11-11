# T3 Code fork: rebase the feature branches and rebuild main

Run by t3-worker (`scheduled-update-worker.md`) twice a day. It is the only machine that rebases
and pushes; the laptops only install what it pushed. Never open a pull request against
`pingdotgg/t3code`, never post to the discussion.

Paths: fork checkout `~/code/t3dotgg/t3code`, kept on branch `main`. Remotes: `origin` is
`jappyjan/t3code`, `upstream` is `pingdotgg/t3code`.

Push with the `jappyjan` GitHub credential over HTTPS, not SSH:
`git -c credential.helper= -c credential.helper='!gh auth git-credential' push https://github.com/jappyjan/t3code.git <refs>`
(use `--force-with-lease=<ref>:<expected sha>` for each force-pushed ref).

## Branches

Feature branches, in stack order. Each sits on the one before it; the first sits on `upstream/main`:

1. `feat/pipelines`: the Pipelines feature. Proposed upstream in the discussion
   `pingdotgg/t3code#26694`, so it must keep working on its own, without anything from later branches.
2. `feat/linear`: the Linear integration. Builds on Pipelines.
3. `feat/multi-repo-projects`: multi-repo projects, a port of upstream PR `pingdotgg/t3code#26254`
   plus Pipelines/Linear glue. Builds on Linear.
4. `feat/host-capacity`: host capacity. Its first commit is a port of upstream PR
   `pingdotgg/t3code#27253` (memory pressure warnings); the commits after it add a per-machine
   cap on concurrent turns. Builds on multi-repo. Until the first feature commit lands, the branch
   may hold only the #27253 port; that is fine.

`main` is generated: `upstream/main` plus every feature branch merged in, rebuilt on every run
that has something to do and force-pushed. Never commit to `main` directly; fixes go on the
feature branch they belong to. The apps are built from `main`.

## Steps

"Checks" means: `pnpm install --frozen-lockfile`, then `pnpm exec vp run check:changed upstream/main`.
Failures that need a browser the host lacks (Playwright Chromium) are known and unrelated. Any
other failure counts.

1. If the working tree has uncommitted changes, or the branch is not `main`, skip the rest of this
   file and say so in the report. Never stash, reset or discard work.
2. `git fetch --multiple upstream origin`. Agents land work by pushing feature branches to
   `origin`, so bring each local feature branch up to its `origin` copy: if the local branch does
   not exist yet, create it with `git branch <branch> origin/<branch>`; if it is an ancestor of
   `origin/<branch>`, `git branch -f <branch> origin/<branch>`. If the local branch has commits
   that `origin` lacks, skip the rest of this file and report it; never drop them.
3. Nothing changed if all of these hold: `upstream/main` is in `feat/pipelines`, each feature
   branch contains the one before it, and `origin/main` equals what step 5 would build (it
   contains `upstream/main` and every feature branch and nothing else). Then skip steps 4 to 6
   and report "main unchanged".
4. Rebase the stack, in order. Before starting, note each branch's current tip
   (`old_pipelines=$(git rev-parse feat/pipelines)`, `old_linear=$(git rev-parse feat/linear)`
   and so on).
   - `git rebase upstream/main feat/pipelines`.
   - `git rebase --onto feat/pipelines $(git merge-base feat/linear "$old_pipelines") feat/linear`.
     This replays only Linear's own commits onto the new Pipelines tip.
   - `git rebase --onto feat/linear $(git merge-base feat/multi-repo-projects "$old_linear") feat/multi-repo-projects`.
     This replays only the multi-repo commits onto the new Linear tip.
   - `git rebase --onto feat/multi-repo-projects $(git merge-base feat/host-capacity "$old_multirepo") feat/host-capacity`
     (note `old_multirepo=$(git rev-parse feat/multi-repo-projects)` before starting too).
   - Later branches follow the same pattern, each onto the branch before it.

   If upstream `main` contains #26254 (merged), the rebase drops the ported commit. If conflicts
   show that upstream changed it, prefer upstream's version and keep only the glue commits, and
   report that #26254 landed. If `feat/multi-repo-projects` ends up with no commits of its own,
   keep it in the stack (an empty branch is harmless) and say so in the report.

   The same applies to `feat/host-capacity` and upstream PR #27253: once upstream `main` contains
   it, the rebase drops or empties the ported first commit. If upstream changed it, prefer
   upstream's version and rebase the cap commits onto it; report that #27253 landed. While #27253
   is still open, check whether its head moved (`gh pr view 27253 --repo pingdotgg/t3code --json
   headRefOid,updatedAt`) and mention new commits in the report; do not port them automatically.

   Resolve conflicts so upstream's change and the feature both keep working. If a conflict is
   beyond a confident fix, `git rebase --abort`, `git checkout main`, reset the branches you
   already rebased back to their noted tips (`git branch -f <branch> <noted tip>`), skip the rest
   of this file, and explain the conflict in the report.

   Run the checks on each rebased feature branch, starting with `feat/pipelines`, because it has
   to stand on its own for upstream. Fix failures on the branch whose code they belong to,
   matching the surrounding code. Commit them as `fix(<pipelines|linear|multi-repo|host-capacity>): build on
   latest upstream main`, then carry the fix up the stack with the same `--onto` rebase. If you
   cannot get a branch green, do not push anything or build; report what fails.
5. Rebuild `main`. First make sure nobody committed to it directly: every commit in `origin/main`
   must be in `upstream/main` or a feature branch (`git log origin/main --not upstream/main
   feat/pipelines feat/linear feat/multi-repo-projects feat/host-capacity` prints nothing). If something shows up,
   stop and report it instead of overwriting it. Otherwise:
   ```bash
   git checkout main
   git reset --hard upstream/main
   git merge --no-edit feat/pipelines
   git merge --no-edit feat/linear
   git merge --no-edit feat/multi-repo-projects
   git merge --no-edit feat/host-capacity
   ```
   Since the branches are stacked these are fast-forwards, and `main` ends up equal to the last
   feature branch. Run the checks once more on `main`.
6. Push `feat/pipelines feat/linear feat/multi-repo-projects feat/host-capacity main` with force-with-lease, using
   the command above. If a lease is rejected, someone pushed in the meantime: do not force. Fetch,
   go back to step 3, and if main is now unchanged report that and stop.

   Note whether this run pushed a new `main`, and its short SHA.

## Schema rule

The Pipelines tables are created by `apps/server/src/persistence/PipelineSchema.ts`, outside the
numbered migrations. Never give them a numbered migration: the migrator would later treat an
upstream migration with the same id as already applied, and the app would refuse to start. The same
goes for the multi-repo tables and columns (`projection_projects.tracked_folders_json`,
`task_folders`): they live in the fork schema module
`apps/server/src/persistence/MultiRepoSchema.ts`, never in a numbered migration.
