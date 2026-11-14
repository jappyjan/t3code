# T3 Code fork: scheduled update (t3-worker)

You run inside T3 Code on t3-worker, the always-on NixOS mini PC that drives the fork. Its T3 Code
server is `t3code.service`, built from `origin/main` by `t3code-fork-update.service`
(nix-mac-setup, `nix/modules/t3code-fork.nix`). This task runs at 12:00 and 20:00. Each run:
reports the Pipelines discussion news, rebases the feature branches and rebuilds `main`, asks the
MacBook Pro and the MacBook Air to install it (the Air also updates the iPhone and iPad), and
updates this host.

Updates are forced on every machine: T3 Code restarts as soon as the new build is ready and
stops running agents instead of waiting for them.

Never open a pull request against `pingdotgg/t3code`, never post to its discussions, never use
sudo. You read this file and `rebuild-main.md` from the `fork-tools` branch; there is no local
copy on this host.

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, kept on branch `main`. Remotes: `origin` is
  `https://github.com/jappyjan/t3code.git`, `upstream` is `https://github.com/pingdotgg/t3code.git`.
- State: `~/code/t3dotgg/t3code-fork-state/` (`discussion-last-check`).
- This host's install: `~/.t3/fork/install-status`, `~/.t3/fork/current` (a link to the running build).

## 0. Checkout

In the fork checkout:

1. If `upstream` is missing, `git remote add upstream https://github.com/pingdotgg/t3code.git`.
2. If the local branch `main` does not exist yet, `git checkout -B main origin/main`.
3. Commits are signed with `~/.ssh/id_ed25519` (global git config). If
   `ssh-keygen -y -f ~/.ssh/id_ed25519` fails, run `git config commit.gpgsign false` in this
   checkout, since a rebase rewrites commits.

## 1. Discussion news

Discussion: https://github.com/pingdotgg/t3code/discussions/26694. Read the timestamp in
`discussion-last-check` (missing: use 24 hours ago). Use `gh api graphql` to fetch the
discussion's state, its comments and their replies (author, createdAt, updatedAt, body, url), and
reactions. Collect everything created or edited after the timestamp, including edits to the
discussion body. For each item, give the author, a one-line gist and the link, and say whether it
needs an answer from me. For items that need one, draft a short reply, but do not post it.
Mention maintainer activity first. Then write the newest timestamp you saw to
`discussion-last-check`.

## 2. Rebase the feature branches and rebuild main

`git fetch origin fork-tools`, read `git show origin/fork-tools:rebuild-main.md`, and follow it in
the fork checkout. It first rebases, checks and pushes each feature branch on its own, then
rebuilds `main` from the ones that made it. A branch that fails is left out and saved unchanged;
the run goes on with the rest. Note per branch whether it was rebased and pushed, unchanged,
dropped (and why) or parked, and whether `main` was pushed, unchanged or skipped, with the short
SHA of `origin/main` afterwards.

## 3. Ask the laptops to install

Every run, whatever section 2 found: a laptop may have been off last time, an install may have
failed, and the Air renews the iPhone and iPad app signature, which expires after 7 days. A laptop
that is already current finishes in a few steps.

Launch one chat on each laptop with the T3 tool `t3_thread_launch`. Do not wait for them.

| Laptop      | environmentId                          | projectId                                  |
| ----------- | -------------------------------------- | ------------------------------------------ |
| MacBook Pro | `b0736160-1ad8-45dc-8415-664673b085d6` | `5aa6ed13-cbec-4734-a899-890fc4a1167a`     |
| MacBook Air | `45ae907e-4688-4e37-9a90-08d909323245` | `mcp:c8933621-727d-4f1d-97a3-f624e688e717` |

Title "T3 Code fork: install main", message (fill in the SHA and whether section 2 pushed it):

> Install the T3 Code fork's main (<short sha>, <pushed by t3-worker just now | unchanged>). In
> ~/code/t3dotgg/t3code run `git fetch origin fork-tools`, then read
> `git show origin/fork-tools:install-laptop.md` and follow it exactly.

Pass `modelSelection` `{"instanceId": "claudeAgent", "model": "claude-sonnet-5-5"}` and
`runtimeMode` `full-access`: the laptop projects have no default model, and the launch is refused
without one.

If a launch fails (the laptop is off, asleep or unreachable, or the link expired), note it for the
report and go on. The next run tries again.

## 4. Update this host

Last, right before the report: `systemctl start --no-block t3code-fork-update`. In the
background it builds `origin/main` if this host does not run it yet (about 15 minutes), then
restarts `t3code.service` at once, which ends this chat if it is still running, and rolls back if
the new build does not stay up. Read `~/.t3/fork/install-status` first: it holds the previous
update's outcome.

## 5. Report

One short line each:

- **Discussion**: the news from section 1 (with drafted replies), or "nothing new".
- **Upstream**: how many upstream commits came in, and which touch areas the feature branches
  use (Pipelines: orchestration, thread shells, sidebar, MCP toolkit, settings, mobile threads;
  Linear: the pull request page and source control, composer context, settings secrets, routes;
  multi-repo: projects/settings, checkpointing, worktrees/TaskFolderService, diff/review, Git
  actions, provider adapters, mobile review/Git; host capacity: resource telemetry/HostResources,
  agent scope, run admission and the run queue, settings, sidebar, mobile home).
- **Rebase**: per feature branch: rebased and pushed (new short SHA), unchanged, dropped (why,
  and the `refs/wip/...` ref it was saved under) or parked. For rebased ones, conflicts and how
  you resolved them, fixes you committed and check results. Say whether upstream PR #27253
  landed or got new commits, and the state of #35921 and #35925 (multi-repo).
- **Main**: unchanged at `<sha>`, pushed `<sha>` with which feature branches, or why it was
  skipped or failed. Put a feature that the previous `main` had and this one lacks first in the
  report: the machines lose it on their next install.
- **MacBook Pro** / **MacBook Air**: chat launched (its link), or why the launch failed.
- **t3-worker**: update started, plus the previous outcome from `install-status`.
