# T3 Code fork: MacBook Pro update

You run inside the T3 Code desktop app on the MacBook Pro that this task updates. This machine and
the MacBook Air run the same job: this one at 12:00, the Air at 00:00. Each one rebases the
feature branches, rebuilds `main`, pushes it, and builds and installs `main` on itself. When a run
pushes a new `main`, it launches a chat on the other laptop so that one updates too. The Air also
does the Pipelines discussion report and the iPhone app; this machine does neither.

Never open a pull request against `pingdotgg/t3code`, post to the upstream discussion, pass
`--zap` to brew, or use `install-desktop.sh --now`. Push only as `rebuild-main.md` says.

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, branch `main`. `main` is force-pushed on every rebuild,
  so never keep local work on it.
- Tools: `~/code/t3dotgg/t3code-fork-tools` (this file, `rebuild-main.md`, `build-desktop.sh`,
  `install-desktop.sh`).
- Builds and install results: `~/code/t3dotgg/t3code-desktop-builds` (`install-status`,
  `installed-commit`, `install.log`).

## Modes

- **Full run** (the scheduled run): sections 1 to 5.
- **Install only**: when the task text that started this chat says "install only", do sections 1,
  3 and 4 only (skip 2 and 5). Use it as is: never rebase, push or launch another chat. This is how
  the other laptop asks this one to update.

## 1. Sync the tools

In the fork checkout:

1. If the working tree has uncommitted changes, stop and report it. If the branch is
   `feat/pipelines` (the old setup), run `git fetch origin` and `git checkout -B main origin/main`
   once. If it is any other branch, stop and report it. Never stash or discard work.
2. `git fetch origin`. Refresh the tools from the `fork-tools` branch: for each of
   `build-desktop.sh`, `install-desktop.sh`, `rebuild-main.md` and `scheduled-update-pro.md`, run
   `git show origin/fork-tools:<file> > ~/code/t3dotgg/t3code-fork-tools/<file>.new` and then
   `mv` it over `<file>`, then `chmod +x` the two scripts. Never write into a script in place: a
   queued install is still running from it, and bash would read the new text at the old offset.

## 2. Rebase and rebuild main

Follow `~/code/t3dotgg/t3code-fork-tools/rebuild-main.md` in the fork checkout. It ends with `main`
unchanged, pushed, or a problem to report. Note whether this run pushed a new `main`, and its
short SHA.

## 3. Build

Sync the checkout to what `origin/main` is now: `git fetch origin`, then `git reset --hard
origin/main` (the checkout is on `main`, with a clean tree).

If `origin/main` equals `installed-commit` and `install-status` says `Installed`, there is
nothing to build: say "up to date" and go to section 5 (full run) or stop (install only).

Otherwise run `~/code/t3dotgg/t3code-fork-tools/build-desktop.sh` as a background command and
wait for it to finish. Its last output line is the path of the built `.app`. If it fails, put the
end of its log in the report and skip the install.

## 4. Install

Run `~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`. In the background
it waits until no agent run is active, then quits T3 Code, backs up the database, swaps the app
and relaunches it. Do not wait for it.

## 5. Tell the MacBook Air (full run only)

If section 2 pushed a new `main` (not "unchanged", not a failure), launch a chat on the Air with
`t3_thread_launch`: `environmentId` `45ae907e-4688-4e37-9a90-08d909323245`, `projectId`
`mcp:eee3a584-240e-4daf-b3ad-6056ff2bdfa1`, title "T3 Code fork: update MacBook Air", and this
message, with the SHA filled in:

> Install only. Follow ~/code/t3dotgg/t3code-fork-tools/scheduled-update.md in install-only mode:
> the MacBook Pro pushed a new main (<short sha>). Do not rebase, push or launch another chat.

Do not wait for that chat. If the launch fails (the Air is off or unreachable), say so in the
report: the Air's own 00:00 run installs it later.

## 6. Report

One line each:

- **Main**: unchanged, or pushed `<short sha>` (and whether #26254 or #27253 landed or a branch needed a
  conflict fix), or why it was skipped or failed.
- **MacBook Pro**: the built version and commit with "install queued", or why it was skipped or
  failed, plus the previous install's outcome from `install-status`.
- **MacBook Air**: "chat launched" (link), "not needed" (main unchanged), or why the launch failed.
