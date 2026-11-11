# Set up a Mac to run the T3 Code fork

Set up this Mac to run my T3 Code fork desktop app. This branch (`fork-tools`) holds the files.
The app is built from `main` (upstream plus the fork's feature branches), which t3-worker rebuilds
twice a day (`scheduled-update-worker.md`). After each rebuild, t3-worker starts a chat on every
Mac in its table that installs `main` (`install-laptop.md`). Work locally on this machine.

Rules:

- Never `brew uninstall --zap` (it deletes ~/.t3/userdata).
- No pull request to pingdotgg/t3code, no posting to its discussions, no pushing.
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
  12.14.0.
- Rust: `brew install rust` is enough; `build-desktop.sh` uses cargo/rustc from PATH and only
  falls back to `nix shell` without them.
- Others: propose how to install them and ask.

## 2. Install (after my OK)

1. In `~/code/t3dotgg/t3code`: check out `main` and `cp .env.example .env` (turns on T3 Connect).
2. Register `~/code/t3dotgg/t3code` (expanded) as a T3 project with `t3_project_create`, unless it
   already is one. Note its projectId.
3. Follow `git show origin/fork-tools:install-laptop.md`. Its install quits T3 Code a minute after
   it is queued; afterwards I sign in to T3 Connect again.

## 3. Final report

- arch, and how T3 Code was installed before;
- what you installed or changed;
- built version and commit, and that the install is queued;
- the projectId from step 2.2. To have this Mac updated, add it with that projectId and this
  environment's id to the table in `scheduled-update-worker.md`, and link this environment from
  t3-worker with full access.
