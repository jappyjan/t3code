# T3 Code fork: install main on a laptop

t3-worker's scheduled run (`scheduled-update-worker.md`) starts this chat on the MacBook Pro and
the MacBook Air twice a day. You run inside the T3 Code desktop app that you update. Install the
desktop app from `origin/main`; on the Mac that has `~/code/t3dotgg/t3code-ios-builds/devices.txt`
(the Air), also update the T3 Code app on my iPhone and iPad.

Updates are forced: about a minute after you queue the desktop install, it quits T3 Code even if
agents are running, this chat included. So queue the installs last and write the report right
after.

Never rebase, commit or push (t3-worker owns `main`), never launch other chats, never open a pull
request against `pingdotgg/t3code`, never pass `--zap` to brew, and never uninstall the app from a
phone or tablet (that deletes its data).

Paths:

- Fork checkout: `~/code/t3dotgg/t3code`, branch `main`. `main` is force-pushed on every rebuild,
  so never keep local work on it.
- Tools: `~/code/t3dotgg/t3code-fork-tools` (`build-desktop.sh`, `install-desktop.sh`,
  `build-ios.sh`, `install-ios.sh`).
- Desktop builds and results: `~/code/t3dotgg/t3code-desktop-builds` (`install-status`,
  `installed-commit`, `install.log`).
- iOS builds: `~/code/t3dotgg/t3code-ios-builds`. `devices.txt` lists the devices to update, one
  `<udid> <name>` per line; it stays on this Mac. Each device's results are in `device-<udid>/`
  (`install-status`, `installed-commit`, `profile-expires`); `install.log` is shared.

## 1. Sync

In the fork checkout:

1. If the working tree has uncommitted changes, or the branch is not `main`, stop and report it.
   Never stash or discard work.
2. `git fetch origin`. For each of `build-desktop.sh`, `install-desktop.sh`, `build-ios.sh` and
   `install-ios.sh`, run `git show origin/fork-tools:<file> > ~/code/t3dotgg/t3code-fork-tools/<file>.new`,
   then `mv` it over `<file>`, then `chmod +x` the four scripts. Never write into a script in
   place: a queued install may still be running from it. Delete `rebuild-main.md`,
   `scheduled-update.md` and `scheduled-update-pro.md` from the tools folder if they are there;
   they belong to the old setup.
3. `git reset --hard origin/main`.

## 2. Desktop build

If `origin/main` equals `installed-commit` and `install-status` says `Installed`, the desktop app
is up to date: skip to section 3.

Otherwise run `~/code/t3dotgg/t3code-fork-tools/build-desktop.sh` as a background command and
wait for it to finish (several minutes). Its last output line is the path of the built `.app`.
If it fails, put the end of its log in the report and skip the desktop install.

## 3. iOS build (only with `devices.txt`)

Skip this section on a Mac without `~/code/t3dotgg/t3code-ios-builds/devices.txt`.

Build if any of these holds for any device in `devices.txt`:

- `HEAD` differs from its `device-<udid>/installed-commit`, or that file is missing.
- Its `device-<udid>/install-status` is missing or says `Not installed`.
- The date in its `device-<udid>/profile-expires` is less than 4 days away. The script then
  fetches a fresh 7-day signature; a rebuild alone would reuse the old one.

Run `~/code/t3dotgg/t3code-fork-tools/build-ios.sh` as a background command, after the desktop
build (both use the checkout), and wait for it. Its last output line is the path of the built
`.app`. If it fails, put the end of its output in the report and skip the iOS install. A signing
or provisioning failure (no account, expired Apple ID session, App ID limit) needs me in Xcode:
say what it asks for, don't work around it. If the build stops progressing at a `codesign` step, a
macOS keychain prompt is waiting for my password: tell me.

## 4. Install

1. Only if a new iOS app was built: `~/code/t3dotgg/t3code-fork-tools/install-ios.sh --detach "<app path>"`.
   It returns at once. In the background it installs the app on every device in `devices.txt`,
   over the app already there and keeping its data, as soon as each device is reachable (same
   Wi-Fi as this Mac, or plugged in). Each one retries for up to 36 hours.
2. Only if a new desktop app was built, as your last command:
   `~/code/t3dotgg/t3code-fork-tools/install-desktop.sh --detach "<app path>"`. It returns at
   once. A minute later it quits T3 Code, backs up the database, swaps the app and relaunches it,
   rolling back if the new app does not stay up.

## 5. Report

Write it right away, one short line each:

- **Desktop**: the built version and commit with "install queued", or "up to date", or why it
  failed; plus the previous install's outcome from `install-status`.
- **iOS** (Air only): the built version with "installs queued", or why no build was needed. Then
  one line per device: its previous outcome from `device-<udid>/install-status` and until when
  its app is signed (`profile-expires`). A device whose install was rejected for signing needs
  `build-ios.sh --register-device <udid>` once, with it plugged in: say so.
