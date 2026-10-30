# T3 Code fork: MacBook Pro update

You run inside the T3 Code desktop app on the MacBook Pro that this task updates. The MacBook Air
rebases the feature branches, rebuilds `main` from upstream plus those branches, checks it and
pushes it every two days; this machine only builds and installs
what it pushed. Never push, rebase, open a pull request, post to the upstream discussion, pass
`--zap` to brew, or use `install-desktop.sh --now`.

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, branch `main`. It exists only for builds. `main` is
  force-pushed on every rebuild, so never keep local work on it.
- Tools: `~/code/t3dotgg/t3code-fork-tools` (this file, `build-desktop.sh`, `install-desktop.sh`).
- Builds and install results: `~/code/t3dotgg/t3code-desktop-builds` (`install-status`,
  `installed-commit`, `install.log`).

## 1. Sync

In the fork checkout:

1. If the working tree has uncommitted changes, stop and report it. If the branch is
   `feat/pipelines` (the old setup), run `git fetch origin` and `git checkout -B main origin/main`
   once. If it is any other branch, stop and report it. Never stash or discard work.
2. `git fetch origin`. Refresh the tools from the `fork-tools` branch: for each of
   `build-desktop.sh`, `install-desktop.sh` and `scheduled-update-pro.md`, run
   `git show origin/fork-tools:<file> > ~/code/t3dotgg/t3code-fork-tools/<file>`, then `chmod +x`
   the two scripts.
3. If `origin/main` equals `installed-commit` and `install-status` says `Installed`,
   stop and report "up to date".
4. `git reset --hard origin/main`.

## 2. Build

Run `~/code/t3dotgg/t3code-fork-tools/build-desktop.sh` as a background command and wait for it
to finish. Its last output line is the path of the built `.app`. If it fails, put the end of its
log in the report and stop.

## 3. Install

Run `~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`, then end your
turn. In the background it waits until no agent run is active, then quits T3 Code, backs up the
database, swaps the app and relaunches it.

## 4. Report

One line: **MacBook Pro**: the built version and commit with "install queued", or why it was
skipped or failed, plus the previous install's outcome from `install-status`.
