# MacBook Pro: run the T3 Code fork

Set up this machine to run my T3 Code fork desktop app (the same build my MacBook Air runs), with
a daily scheduled task that keeps it updated. This branch (`fork-tools`) holds the files; the app
is built from `main` (upstream plus the fork's feature branches, rebuilt by the MacBook Air). Work locally on this machine.

Rules:

- Never `brew uninstall --zap` (it deletes ~/.t3/userdata). Never run `install-desktop.sh --now`.
- No pull request to pingdotgg/t3code, no posting to its discussions, never push from here.
- Don't open ~/.t3/userdata databases read-write.
- Ask me before anything that removes or replaces installed software (brew uninstall,
  darwin-rebuild, replacing an app in /Applications). Queuing `install-desktop.sh` counts.

## 1. Check, then report

- CPU: `uname -m` (`build-desktop.sh` picks arm64 or x64 from it).
- How T3 Code is installed: `ls /Applications | grep -i t3`, `brew list --cask | grep -i t3`, the
  app version (`defaults read "/Applications/<app>/Contents/Info.plist" CFBundleShortVersionString`),
  and whether nix-darwin manages it (`darwin-rebuild`, a `jappyjan/nix-mac-setup` checkout; that
  repo dropped the T3 Code cask in d9d72ee, so an older checkout would reinstall it).
- Build tools: git, node, pnpm 12.14.0, cargo/rustc (on PATH, or via nix), gh, sqlite3.
- The fork builds "T3 Code (Nightly).app"; `install-desktop.sh` removes the `t3-code@nightly` cask
  record and keeps the old app for rollback. Say so if this machine has a different app or cask.

Tell me what you found and what you'd remove or replace, then wait for my OK.

Missing tools:

- Node: you may `nvm install 26.12.1`, make it the nvm default, and `corepack enable` for pnpm
  12.14.0. (Node 24 also builds fine on the Air.)
- Rust: `brew install rust` is enough; `build-desktop.sh` uses cargo/rustc from PATH and only
  falls back to `nix shell` without them.
- Nix (only if you want it instead of Rust on PATH): the installer needs sudo, so ask me to run
  `curl -fsSL https://install.determinate.systems/nix | sh -s -- install` in Terminal.
- Others: propose how to install them and ask.

## 2. Install (after my OK)

1. In `~/code/t3dotgg/t3code`: check out `main`, add `upstream` =
   `https://github.com/pingdotgg/t3code.git`, and `cp .env.example .env` (turns on T3 Connect).
2. Copy the tools from this branch:
   ```bash
   mkdir -p ~/code/t3dotgg/t3code-fork-tools
   for f in build-desktop.sh install-desktop.sh scheduled-update-pro.md; do
     git -C ~/code/t3dotgg/t3code show "origin/fork-tools:$f" > ~/code/t3dotgg/t3code-fork-tools/$f
   done
   chmod +x ~/code/t3dotgg/t3code-fork-tools/*.sh
   ```
3. If nix-darwin manages T3 Code and its config is older than d9d72ee, pull it and
   `darwin-rebuild switch` (ask first).
4. Register `~/code/t3dotgg/t3code` (expanded) as a T3 project with `t3_project_create`, unless it
   already is one.
5. `schedule_task`: title "T3 Code fork: update MacBook Pro", that projectId,
   bindToCurrentThread false, schedule `{type:"fixed_time", timeOfDay:"16:00"}`, prompt: "Read
   ~/code/t3dotgg/t3code-fork-tools/scheduled-update-pro.md and follow it exactly, ending with the
   report it describes."
6. Run `~/code/t3dotgg/t3code-fork-tools/build-desktop.sh` as a background command and wait for it.
   Its last output line is the .app path. On failure, show me the end of the log and stop.
7. Run `~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`, then end your
   turn at once. It waits until no agent runs, quits T3 Code, backs up the database, swaps the app
   and relaunches it. Afterwards I sign in to T3 Connect again.

## 3. Final report

- arch, and how T3 Code was installed before;
- what you installed or changed;
- built version and commit, and that the install is queued;
- the scheduled task's id and next run time;
- `cat ~/code/t3dotgg/t3code-desktop-builds/install-status` (may not exist yet; the install writes
  it a few minutes after you finish).
