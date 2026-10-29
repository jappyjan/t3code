#!/usr/bin/env bash
# Replaces the installed T3 Code desktop app with a fork build, then relaunches it.
#
#   install-desktop.sh [--detach] [--now] <path/to/T3 Code (Nightly).app>
#
# --detach  re-runs itself in the background, detached from the caller. Use it from inside
#           T3 Code: quitting the app ends every agent running in it, including the caller.
# --now     skips waiting until no agent run is active.
#
# Steps: wait until T3 Code is idle, quit it, back up the state database, swap the app (the
# previous one is kept for rollback), relaunch, and roll back if the new app does not stay up.
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
START_DELAY_S=120         # lets the calling agent finish its turn first
IDLE_POLL_S=60
MAX_IDLE_WAIT_S=$((8 * 3600))

detach=0
now=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --detach) detach=1 ;;
    --now) now=1 ;;
    *) break ;;
  esac
  shift
done
new_app="${1:?usage: install-desktop.sh [--detach] [--now] <app>}"
new_app="$(cd "$(dirname "$new_app")" && pwd)/$(basename "$new_app")"
[[ -d "$new_app/Contents" ]] || { echo "Not an app bundle: $new_app" >&2; exit 1; }
mkdir -p "$BUILDS"

if [[ $detach -eq 1 ]]; then
  args=()
  [[ $now -eq 1 ]] && args+=(--now)
  nohup "$0" ${args[@]+"${args[@]}"} "$new_app" >>"$LOG" 2>&1 </dev/null &
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
active_runs() {
  sqlite3 -readonly "$USERDATA/statev2.sqlite" \
    "SELECT COUNT(*) FROM orchestration_v2_projection_runs WHERE status IN ('preparing','starting','running')" \
    2>/dev/null || echo 1
}

log "Installing $new_app over $target"

if [[ $now -eq 0 ]]; then
  sleep "$START_DELAY_S"
  waited=0
  idle_checks=0
  # Two idle checks in a row, so a run that is just starting is not cut off.
  while [[ $idle_checks -lt 2 ]]; do
    if [[ "$(active_runs)" == "0" ]]; then
      idle_checks=$((idle_checks + 1))
    else
      idle_checks=0
    fi
    [[ $idle_checks -ge 2 ]] && break
    if [[ $waited -ge $MAX_IDLE_WAIT_S ]]; then
      finish "Not installed: T3 Code stayed busy for 8 hours. The build is ready: $0 --now \"$new_app\""
      exit 1
    fi
    sleep "$IDLE_POLL_S"
    waited=$((waited + IDLE_POLL_S))
  done
  log "T3 Code is idle"
fi

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
sqlite3 "$USERDATA/statev2.sqlite" ".backup '$backup'"
ls -1t "$BACKUPS"/statev2-*.sqlite | tail -n "+$((KEEP_BACKUPS + 1))" | while read -r old; do rm -f "$old"; done

# The cask is no longer managed by nix; uninstall it (never --zap: that deletes ~/.t3/userdata).
if command -v brew >/dev/null 2>&1 || [[ -x /opt/homebrew/bin/brew ]]; then
  brew_bin="$(command -v brew || echo /opt/homebrew/bin/brew)"
  if "$brew_bin" list --cask "$CASK" >/dev/null 2>&1; then
    log "Moving the cask's app aside, then removing the cask record"
    rm -rf "$PREVIOUS" && mkdir -p "$PREVIOUS"
    [[ -d "$target" ]] && ditto "$target" "$PREVIOUS/$(basename "$target")"
    "$brew_bin" uninstall --cask "$CASK" || log "brew uninstall failed; continuing"
  fi
fi

if [[ -d "$target" ]]; then
  rm -rf "$PREVIOUS" && mkdir -p "$PREVIOUS"
  mv "$target" "$PREVIOUS/"
fi
log "Copying the new app into /Applications"
ditto "$new_app" "$target"
xattr -dr com.apple.quarantine "$target" 2>/dev/null || true

log "Launching $name"
open "$target"
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
