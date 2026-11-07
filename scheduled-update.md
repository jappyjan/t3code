# T3 Code fork: scheduled update (MacBook Air)

You run inside the T3 Code desktop app that this task updates. This machine (the MacBook Air) and
the MacBook Pro run the same job, the Air at 00:00 and the Pro at 12:00. Each rebases the feature
branches, rebuilds `main`, pushes it and installs it on itself; when a run pushes a new `main`, it
launches a chat on the other laptop. The Air additionally does the Pipelines discussion report and
updates the T3 Code app on my iPhone and iPad, over Wi-Fi. Do the steps in order and end with the
report. Never open a pull request against `pingdotgg/t3code`, never post to the discussion, never
pass `--zap` to brew, and never uninstall the app from a phone or tablet (that deletes its data).

## Modes

- **Full run** (scheduled): everything below.
- **Install only**: when the task text that started this chat says "install only", skip sections
  1, 2 and 4b (no discussion report, no rebase, no push, no launching another chat). Do sections
  0, 3 and 4 (desktop, and the devices by their usual rules) and report.

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, kept on branch `main`. Remotes: `origin` is
  `jappyjan/t3code`, `upstream` is `pingdotgg/t3code`.
- Tools and state: `~/code/t3dotgg/t3code-fork-tools` (this file, `rebuild-main.md`,
  `build-desktop.sh`, `install-desktop.sh`, `build-ios.sh`, `install-ios.sh`, `state/`).
- Builds and install results: `~/code/t3dotgg/t3code-desktop-builds` (`install-status`,
  `installed-commit`, `install.log`).
- iOS builds: `~/code/t3dotgg/t3code-ios-builds`. `devices.txt` lists the devices to update, one
  `<udid> <name>` per line; it stays on this Mac. Each device's results are in
  `device-<udid>/` (`install-status`, `installed-commit`, `profile-expires`); `install.log` is
  shared.

The app is "T3 Code Preview" (`com.jappyjan.t3code`), one universal build for the iPhone and the
iPad, built with the repo's Personal Team option and signed by my free Apple team (`S8U7Q59TMM`,
the Apple ID signed in to Xcode). Free teams sign apps for 7 days only; after that the app no
longer opens until it is reinstalled, so this task renews it.

## 0. Sync the tools

In the fork checkout, `git fetch origin fork-tools`. For each of `rebuild-main.md`,
`scheduled-update.md`, `build-desktop.sh`, `install-desktop.sh`, `build-ios.sh` and
`install-ios.sh`, run `git show origin/fork-tools:<file> > ~/code/t3dotgg/t3code-fork-tools/<file>.new`
and then `mv` it over `<file>`, then `chmod +x` the four scripts. Never write into a script in place:
a queued install is still running from it, and bash would read the new text at the old offset. Keep
following the copy of this file you already read; the refreshed one applies from the next run.

## 1. Discussion news

Discussion: https://github.com/pingdotgg/t3code/discussions/26694. Read the timestamp in
`state/discussion-last-check`. Use `gh api graphql` to fetch the discussion's state, its comments
and their replies (author, createdAt, updatedAt, body, url), and reactions. Collect everything
created or edited after the timestamp, including edits to the discussion body. For each item, give
the author, a one-line gist and the link, and say whether it needs an answer from me. For items
that need one, draft a short reply, but do not post it. Mention maintainer activity first. Then
write the newest timestamp you saw to `state/discussion-last-check`.

## 2. Rebase the feature branches and rebuild main

Follow `~/code/t3dotgg/t3code-fork-tools/rebuild-main.md` in the fork checkout. Note whether this
run pushed a new `main` and its short SHA.

## 3. Build

First sync the checkout to what `origin/main` is now: `git fetch origin`, then
`git reset --hard origin/main` (clean tree, on `main`).

Build the desktop app if `origin/main` differs from `installed-commit`, or the last install
failed, or `install-status` is not `Installed` (not only when this run changed something, because
the MacBook Pro may have pushed). Run
`~/code/t3dotgg/t3code-fork-tools/build-desktop.sh`. It takes several minutes, so run it as a
background command and wait for it to finish. Its last output line is the path of the built
`.app`. If the build fails, put the end of its log in the report and skip the install.

Then the iOS app, after the desktop build has finished (both use the checkout). Skip it if
section 2 found uncommitted changes or another branch, or its checks failed. Otherwise build it if
any of these holds for any device in `t3code-ios-builds/devices.txt`, even when nothing else
changed:

- `HEAD` differs from its `device-<udid>/installed-commit`, or that file is missing.
- Its `device-<udid>/install-status` is missing or says `Not installed`.
- The date in its `device-<udid>/profile-expires` is less than 4 days away. The script then
  fetches a fresh 7-day signature; a rebuild alone would reuse the old one.

Run `~/code/t3dotgg/t3code-fork-tools/build-ios.sh` as a background command and wait for it to
finish. Its last output line is the path of the built `.app`. If it fails, put the end of its
output in the report and skip the iOS install. A signing or provisioning failure (no account,
expired Apple ID session, App ID limit) needs me in Xcode: say what it asks for, don't work
around it. If the build stops progressing at a `codesign` step, a macOS keychain prompt is waiting
for my password: tell me.

## 4. Install

Only if a new app was built, run
`~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`. It returns at once.
In the background it waits until no agent run is active (this run included), then quits T3 Code,
backs up the database, swaps the app and relaunches it. Never use `--now`.

Only if a new iOS app was built, run
`~/code/t3dotgg/t3code-fork-tools/install-ios.sh --detach "<app path>"`. It returns at once. In
the background it installs the app on every device in `devices.txt`, over the app already there
and keeping its data, as soon as each device is reachable: on the same Wi-Fi as this Mac, or
plugged in. Each one retries for up to 36 hours and replaces an older install for the same device
that is still waiting. Don't wait for it.

## 4b. Tell the MacBook Pro (full run only)

If section 2 pushed a new `main`, call the T3 tool `t3_thread_launch` with environmentId
`da87875e-664d-4bc6-a377-1ba0ac4f7500`, projectId `mcp:af4eabd0-97dc-4df8-a519-b8a63101bc41`,
title "T3 Code fork: update MacBook Pro" and this message, with the SHA filled in: "Install only.
Follow ~/code/t3dotgg/t3code-fork-tools/scheduled-update-pro.md in install-only mode: the MacBook
Air pushed a new main (<short sha>). Do not rebase, push or launch another chat." Do not wait for
it. If the launch fails, say so in the report; the Pro's own 12:00 run installs it later.

## 5. Report

End with a short report:

- **Discussion**: the news from step 1, or "nothing new".
- **Upstream**: how many upstream commits came in, and which touch areas the feature branches
  use (Pipelines: orchestration, thread shells, sidebar, MCP toolkit, settings, mobile threads;
  Linear: the pull request page and source control, composer context, settings secrets, routes;
  multi-repo: projects/settings, checkpointing, worktrees/TaskFolderService, diff/review, Git
  actions, provider adapters, mobile review/Git; host capacity: resource telemetry/HostResources,
  agent scope, run admission and the run queue, settings, sidebar, mobile home).
- **Rebase**: per feature branch, conflicts and how you resolved them, fixes you committed and
  check results; then the pushed SHAs of `feat/pipelines`, `feat/linear`,
  `feat/multi-repo-projects`, `feat/host-capacity` and `main`. Say whether upstream PR #27253
  merged or got new commits.
- **App**: the built version and whether its install is queued, plus the previous install's
  outcome from `install-status`.
- **iOS**: the built version and whether its installs are queued, or why no build was needed.
  Then one line per device in `devices.txt`: its previous outcome from
  `device-<udid>/install-status` and until when its app is signed (`profile-expires`). A device
  whose install was rejected for signing needs `build-ios.sh --register-device <udid>` once, with
  it plugged in: say so.
- **MacBook Pro**: chat launched (link), not needed (main unchanged), or why the launch failed.
- **Main**: unchanged, or pushed <short sha> (and whether #26254 or #27253 landed or a branch needed a
  conflict fix), or why skipped.
