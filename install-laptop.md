# T3 Code fork: install main on a laptop

t3-worker's scheduled run (`scheduled-update-worker.md`) starts this chat on the MacBook Pro and
the MacBook Air twice a day. You run inside the T3 Code desktop app that you update. Install the
desktop app from `origin/main`; on the Mac that has `~/code/t3dotgg/t3code-ios-builds/publish.conf`
(the Air), also build the iOS app and publish it to the SideStore source on t3-worker, from which
my iPhone and iPad install it (`SETUP-ios.md`).

Updates are forced: about a minute after you queue the desktop install, it quits T3 Code even if
agents are running, this chat included. So queue the installs last and write the report right
after.

Never rebase, commit or push (t3-worker owns `main`), never launch other chats, never open a pull
request against `pingdotgg/t3code`, and never pass `--zap` to brew.

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, branch `main`. `main` is force-pushed on every rebuild,
  so never keep local work on it.
- Tools: `~/code/t3dotgg/t3code-fork-tools` (`build-desktop.sh`, `install-desktop.sh`,
  `build-ios.sh`, `publish-ios.sh`).
- Desktop builds and results: `~/code/t3dotgg/t3code-desktop-builds` (`install-status`,
  `installed-commit`, `install.log`).
- iOS builds: `~/code/t3dotgg/t3code-ios-builds`. `publish.conf` (the source's address and upload
  key) stays on this Mac; `publish-status` and `published-commit` hold the last publish.

## 1. Sync

In the fork checkout:

1. If the working tree has uncommitted changes, or the branch is not `main`, stop and report it.
   Never stash or discard work.
2. `git fetch origin`. For each of `build-desktop.sh`, `install-desktop.sh`, `build-ios.sh` and
   `publish-ios.sh`, run `git show origin/fork-tools:<file> > ~/code/t3dotgg/t3code-fork-tools/<file>.new`,
   then `mv` it over `<file>`, then `chmod +x` the four scripts. Never write into a script in
   place: a queued install may still be running from it. Delete `install-ios.sh`,
   `rebuild-main.md`, `scheduled-update.md` and `scheduled-update-pro.md` from the tools folder if
   they are there; they belong to older setups.
3. `git reset --hard origin/main`.

## 2. Desktop build

If `origin/main` equals `installed-commit` and `install-status` says `Installed`, the desktop app
is up to date: skip to section 3.

Otherwise run `~/code/t3dotgg/t3code-fork-tools/build-desktop.sh` as a background command and
wait for it to finish (several minutes). Its last output line is the path of the built `.app`.
If it fails, put the end of its log in the report and skip the desktop install.

## 3. iOS build (only with `publish.conf`)

Skip this section on a Mac without `~/code/t3dotgg/t3code-ios-builds/publish.conf`. If that Mac
has `devices.txt` instead, it still has the old Xcode-signed setup: report "iOS: not moved to
SideStore yet, see `SETUP-ios.md`" and skip.

Build if `HEAD` differs from `published-commit`, or `publish-status` is missing or says
`Not published`. Nothing expires on this side any more: SideStore renews the signature on the
devices, so an unchanged `main` needs no build.

Run `~/code/t3dotgg/t3code-fork-tools/build-ios.sh` as a background command, after the desktop
build (both use the checkout), and wait for it. Its last output line is the path of the built
`.ipa`. If it fails, put the end of its output in the report and skip the publish. It signs
nothing, so it never needs my Apple account or Xcode login.

## 4. Install

1. Only if a new iOS app was built: `~/code/t3dotgg/t3code-fork-tools/publish-ios.sh "<ipa path>"`.
   It uploads the app to t3-worker over Tailscale and checks the source lists it (a minute or
   two). SideStore on the iPhone and iPad then offers it as an update.
2. Only if a new desktop app was built, as your last command:
   `~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`. It returns at
   once. A minute later it quits T3 Code, backs up the database, swaps the app and relaunches it,
   rolling back if the new app does not stay up.

## 5. Report

Write it right away, one short line each:

- **Desktop**: the built version and commit with "install queued", or "up to date", or why it
  failed; plus the previous install's outcome from `install-status`.
- **iOS** (Air only): the last line of `publish-ios.sh`, or why no build was needed, plus the
  previous outcome from `publish-status`.
