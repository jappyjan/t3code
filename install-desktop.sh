#!/usr/bin/env bash
# Replaces the installed T3 Code desktop app with a fork build, then relaunches it.
#
#   install-desktop.sh [--detach] <path/to/T3 Code (Nightly).app>
#
# --detach  re-runs itself in the background, detached from the caller. Use it from inside
#           T3 Code: quitting the app ends every agent running in it, including the caller.
#
# Steps: give the caller a minute to finish its turn, quit T3 Code (running agents are stopped, not
# waited for), back up the state database, swap the app (the previous one is kept for rollback),
# relaunch, and roll back if the new app does not stay up.
# Progress goes to $BUILDS/install.log; the outcome goes to $BUILDS/install-status and a
# macOS notification.
set -euo pipefail

# Agents run inside T3 Code, whose server sets this; an app launched with it starts as plain Node
# and exits at once. `open` passes the caller's environment on to the app.
unset ELECTRON_RUN_AS_NODE

BUILDS="${T3_FORK_BUILDS:-$HOME/code/t3dotgg/t3code-desktop-builds}"
USERDATA="$HOME/.t3/userdata"
BACKUPS="$BUILDS/db-backups"
PREVIOUS="$BUILDS/previous-app"
LOG="$BUILDS/install.log"
STATUS="$BUILDS/install-status"
CASK="t3-code@nightly"
KEEP_BACKUPS=2
START_DELAY_S=60          # lets the calling agent finish its turn first

detach=0
if [[ "${1:-}" == --detach ]]; then
  detach=1
  shift
fi
new_app="${1:?usage: install-desktop.sh [--detach] <app>}"
new_app="$(cd "$(dirname "$new_app")" && pwd)/$(basename "$new_app")"
[[ -d "$new_app/Contents" ]] || { echo "Not an app bundle: $new_app" >&2; exit 1; }
mkdir -p "$BUILDS"

if [[ $detach -eq 1 ]]; then
  nohup "$0" "$new_app" >>"$LOG" 2>&1 </dev/null &
  disown
  echo "Install running detached (pid $!); log: $LOG"
  exit 0
fi

target="/Applications/$(basename "$new_app")"
name="$(basename "$target" .app)"
log() { echo "[$(date '+%F %T')] $*"; }
finish() {
  echo "$(date '+%F %T') $1" >"$STATUS"
  log "$1"
  osascript -e "display notification \"$1\" with title \"T3 Code fork update\"" >/dev/null 2>&1 || true
}
# pgrep cannot read the main process's arguments, and the app name holds regex characters.
app_pids() { ps -axo pid=,comm= | grep -F "$1" | awk '{print $1}' || true; }
app_running() { [[ -n "$(app_pids "$target/Contents/MacOS/")" ]]; }
# Once the app is quit, any failure must bring the previous app back instead of leaving T3 Code closed.
swapped=0
recover_after_failure() {
  trap - ERR
  local prev
  prev="$PREVIOUS/$(basename "$target")"
  if [[ $swapped -eq 1 && -d "$prev" ]]; then
    log "Restoring the previous app"
    rm -rf "$target" || true
    ditto "$prev" "$target" || true
  fi
  if ! app_running && [[ -d "$target" ]]; then
    open "$target" || true
  fi
  finish "${1:-Not installed: a step failed after quitting $name; the previous app was relaunched. Log: $LOG}"
}
is_install() { [[ -n "$1" && "$1" != "$$" ]] && ps -p "$1" -o command= 2>/dev/null | grep -q "install-desktop.sh"; }

log "Installing $new_app over $target"

# Only the newest build installs. A run still in its start delay gives way to a newer one; a run that
# has claimed BUSYFILE is quitting or swapping the app, so the newer one waits for it to end.
# Each side writes its own file before reading the other's, so one of them always sees the other.
PIDFILE="$BUILDS/install.pid"
BUSYFILE="$BUILDS/install.busy"
older="$(cat "$PIDFILE" 2>/dev/null || true)"
echo "$$" >"$PIDFILE"
release_claims() {
  local f
  for f in "$PIDFILE" "$BUSYFILE"; do
    [[ "$(cat "$f" 2>/dev/null)" == "$$" ]] && rm -f "$f"
  done
  true
}
trap release_claims EXIT
busy="$(cat "$BUSYFILE" 2>/dev/null || true)"
if [[ "$older" != "$busy" ]] && is_install "$older"; then
  log "Superseded: pending install (pid $older) stopped in favour of $new_app"
  kill "$older" 2>/dev/null || true
fi
if is_install "$busy"; then
  log "Waiting for the install in progress (pid $busy) to finish"
  while ps -p "$busy" >/dev/null 2>&1; do sleep 5; done
fi

sleep "$START_DELAY_S"

echo "$$" >"$BUSYFILE"
if [[ "$(cat "$PIDFILE" 2>/dev/null)" != "$$" ]]; then
  log "A newer install took over; exiting"
  exit 0
fi
trap recover_after_failure ERR
if app_running; then
  log "Quitting $name"
  osascript -e "quit app \"$name\"" >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do app_running || break; sleep 1; done
  if app_running; then
    log "Still running after 60s; terminating"
    kill -TERM $(app_pids "$target/Contents/MacOS/") 2>/dev/null || true
    sleep 10
    kill -KILL $(app_pids "$target/Contents/MacOS/") 2>/dev/null || true
    sleep 2
  fi
fi
if app_running; then
  finish "Not installed: $name did not quit. The build is ready: $0 \"$new_app\""
  exit 1
fi
# The app's server and helpers can outlive the window briefly.
for _ in $(seq 1 30); do [[ -z "$(app_pids "$target/Contents/")" ]] && break; sleep 1; done

mkdir -p "$BACKUPS"
backup="$BACKUPS/statev2-$(date +%Y%m%d-%H%M%S).sqlite"
log "Backing up the state database to $backup"
# A helper that outlives the app can still hold the database; wait for it instead of failing at once.
backed_up=0
for attempt in 1 2 3; do
  if sqlite3 -cmd ".timeout 60000" "$USERDATA/statev2.sqlite" ".backup '$backup'"; then
    backed_up=1
    break
  fi
  log "Backup attempt $attempt failed; retrying"
  sleep 10
done
if [[ $backed_up -eq 0 ]]; then
  recover_after_failure "Not installed: the state database could not be backed up (it stayed locked). The old app was relaunched. The build is ready: $0 \"$new_app\""
  exit 1
fi
ls -1t "$BACKUPS"/statev2-*.sqlite | tail -n "+$((KEEP_BACKUPS + 1))" | while read -r old; do rm -f "$old"; done

# The cask is no longer managed by nix; uninstall it (never --zap: that deletes ~/.t3/userdata).
if command -v brew >/dev/null 2>&1 || [[ -x /opt/homebrew/bin/brew ]]; then
  brew_bin="$(command -v brew || echo /opt/homebrew/bin/brew)"
  if "$brew_bin" list --cask "$CASK" >/dev/null 2>&1; then
    log "Moving the cask's app aside, then removing the cask record"
    rm -rf "$PREVIOUS" && mkdir -p "$PREVIOUS"
    [[ -d "$target" ]] && ditto "$target" "$PREVIOUS/$(basename "$target")"
    swapped=1
    "$brew_bin" uninstall --cask "$CASK" || log "brew uninstall failed; continuing"
  fi
fi

if [[ -d "$target" ]]; then
  rm -rf "$PREVIOUS" && mkdir -p "$PREVIOUS"
  mv "$target" "$PREVIOUS/"
  swapped=1
fi
log "Copying the new app into /Applications"
ditto "$new_app" "$target"
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true

log "Launching $name"
open "$target"
trap - ERR
sleep 45
if app_running; then
  [[ -f "$(dirname "$new_app")/commit" ]] && cp "$(dirname "$new_app")/commit" "$BUILDS/installed-commit"
  finish "Installed $(defaults read "$target/Contents/Info.plist" CFBundleShortVersionString) and relaunched."
  exit 0
fi

log "The new app is not running; rolling back"
if [[ -d "$PREVIOUS/$(basename "$target")" ]]; then
  rm -rf "$target"
  ditto "$PREVIOUS/$(basename "$target")" "$target"
  open "$target"
  finish "Update failed to start; rolled back to the previous app. Log: $LOG"
else
  finish "Update failed to start and there is no previous app to roll back to. Log: $LOG"
fi
exit 1
