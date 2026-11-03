#!/usr/bin/env bash
# Installs a build-ios.sh app on my iPhone and iPad over Wi-Fi (or USB), over the existing app,
# keeping its data.
#
#   install-ios.sh [--detach] [--device <udid>] <path/to/T3CodePreview.app>
#
# --detach  re-runs itself in the background, detached from the caller, and returns at once.
# --device  installs on that device only. Without it, every device in $BUILDS/devices.txt gets
#           its own install (one line per device: "<udid> <name>", # starts a comment). The list
#           stays on this Mac, out of the public fork-tools branch.
#
# A device must be on the same network as this Mac, or plugged in. Until it can be reached, the
# install retries every 2 minutes for up to 36 hours. A newer install replaces one for the same
# device that is still waiting. Progress goes to $BUILDS/install.log; each device's outcome goes
# to $BUILDS/device-<udid>/install-status and a macOS notification.
set -euo pipefail

# Agents run inside T3 Code, whose server sets this; tools that spawn Node misbehave with it.
unset ELECTRON_RUN_AS_NODE

BUILDS="${T3_IOS_BUILDS:-$HOME/code/t3dotgg/t3code-ios-builds}"
DEVICES="$BUILDS/devices.txt"
LOG="$BUILDS/install.log"
RETRY_S=120
MAX_WAIT_S=$((36 * 3600))
# xcode-select points at the Command Line Tools on this Mac; devicectl ships with the full Xcode.
[[ "${DEVELOPER_DIR:-}" == *.app/Contents/Developer ]] || export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer

usage="usage: install-ios.sh [--detach] [--device <udid>] <app>"
detach=0
device=""
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --detach) detach=1; shift ;;
    --device) device="${2:?$usage}"; shift 2 ;;
    *) echo "$usage" >&2; exit 2 ;;
  esac
done
app="${1:?$usage}"
app="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")"
[[ -f "$app/Info.plist" && -f "$app/embedded.mobileprovision" ]] || {
  echo "Not a signed iOS app bundle: $app" >&2
  exit 1
}
mkdir -p "$BUILDS"

if [[ -z "$device" ]]; then
  [[ -f "$DEVICES" ]] || { echo "No device list: $DEVICES" >&2; exit 1; }
  udids="$(sed -e 's/#.*//' "$DEVICES" | awk 'NF { print $1 }')"
  [[ -n "$udids" ]] || { echo "No devices in $DEVICES" >&2; exit 1; }
  for udid in $udids; do
    if [[ $detach -eq 1 ]]; then
      nohup "$0" --device "$udid" "$app" >>"$LOG" 2>&1 </dev/null &
      disown
      echo "Install on $udid running detached (pid $!); log: $LOG"
    else
      "$0" --device "$udid" "$app" || true
    fi
  done
  exit 0
fi

if [[ $detach -eq 1 ]]; then
  nohup "$0" --device "$device" "$app" >>"$LOG" 2>&1 </dev/null &
  disown
  echo "Install on $device running detached (pid $!); log: $LOG"
  exit 0
fi

name="$(sed -e 's/#.*//' "$DEVICES" 2>/dev/null | awk -v id="$device" '$1 == id { $1 = ""; sub(/^ +/, ""); print; exit }')"
[[ -n "$name" ]] || name="$device"
state="$BUILDS/device-$device"
STATUS="$state/install-status"
PIDFILE="$state/install.pid"
mkdir -p "$state"

log() { echo "[$(date '+%F %T')] $name: $*"; }
finish() {
  echo "$(date '+%F %T') $1" >"$STATUS"
  log "$1"
  osascript -e "display notification \"$1\" with title \"T3 Code update: $name\"" >/dev/null 2>&1 || true
}

# A newer build replaces an install that is still waiting for the same device.
old="$(cat "$PIDFILE" 2>/dev/null || true)"
if [[ "$old" =~ ^[0-9]+$ && "$old" != "$$" ]] && ps -p "$old" -o command= 2>/dev/null | grep -q "install-ios.sh"; then
  log "Stopping the older install that was still waiting (pid $old)"
  pkill -TERM -P "$old" 2>/dev/null || true
  kill -TERM "$old" 2>/dev/null || true
fi
echo "$$" >"$PIDFILE"
trap '[[ "$(cat "$PIDFILE" 2>/dev/null)" == "$$" ]] && rm -f "$PIDFILE"' EXIT

info() { /usr/libexec/PlistBuddy -c "Print :$1" "$app/Info.plist"; }
build="$(info CFBundleVersion)"
label="$(info CFBundleDisplayName 2>/dev/null || info CFBundleName) $(info CFBundleShortVersionString) ($build)"
bundle_id="$(info CFBundleIdentifier)"
expires="$(cat "$(dirname "$app")/profile-expires" 2>/dev/null || true)"

log "Installing $label on $device"
start="$(date +%s)"
last_error=""
while true; do
  if result="$(xcrun devicectl --timeout 600 device install app --device "$device" "$app" 2>&1)"; then
    break
  fi
  error="$(printf '%s\n' "$result" | grep -i -E 'error|fail|locked|unavailable|could not|not found|timed out' | head -2 | tr -s ' \n' ' ')"
  [[ -n "$error" ]] || error="$(printf '%s\n' "$result" | tail -2 | tr -s ' \n' ' ')"
  # Signing and installer errors do not go away by waiting.
  if printf '%s' "$result" | grep -q -E 'MIInstallerErrorDomain|ApplicationVerificationFailed|provisioning profile|code signature'; then
    printf '%s\n' "$result"
    finish "Not installed: the device rejected the app: $error (A new device needs build-ios.sh --register-device $device once.) Build: $app"
    exit 1
  fi
  if [[ "$error" != "$last_error" ]]; then
    log "Waiting for the device: $error"
    last_error="$error"
  fi
  if (($(date +%s) - start >= MAX_WAIT_S)); then
    finish "Not installed: the device was not reachable for 36 hours. The build is ready: $0 --device $device \"$app\""
    exit 1
  fi
  sleep "$RETRY_S"
done

# Confirm the device reports this build. Reading its app list needs it unlocked, so this is best effort.
installed=""
if xcrun devicectl --timeout 60 device info apps --device "$device" --bundle-id "$bundle_id" \
  --json-output "$state/installed-app.json" >/dev/null 2>&1; then
  installed="$(plutil -extract result.apps.0.bundleVersion raw -o - "$state/installed-app.json" 2>/dev/null || true)"
fi
if [[ -n "$installed" && "$installed" != "$build" ]]; then
  finish "Not installed: devicectl reported success, but the device still has build $installed instead of $build."
  exit 1
fi

[[ -f "$(dirname "$app")/commit" ]] && cp "$(dirname "$app")/commit" "$state/installed-commit"
[[ -n "$expires" ]] && echo "$expires" >"$state/profile-expires"
finish "Installed $label${expires:+, signed until $expires}."
