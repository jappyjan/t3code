#!/usr/bin/env bash
# Builds the T3 Code iOS app (Release, self-contained, signed with my own Apple team) from the
# fork checkout. One universal build runs on the iPhone and the iPad. Prints the path of the built
# .app on its last line.
#
#   build-ios.sh [--register-device <udid>]
#
# --register-device  builds for that connected device instead of a generic one, so Xcode registers
#                    it with the team and its profile covers it. Needed once per device; plug it in
#                    and unlock it.
#
# It uses the repo's Personal Team build (apps/mobile/README.md): my bundle id, without the widget
# and share extensions, push, or native Sign in with Apple, which need upstream's Apple team.
# Expo OTA updates are off: they would come from upstream's EAS project, not from this fork.
set -euo pipefail

# Agents run inside T3 Code, whose server sets this; tools that spawn Node misbehave with it.
unset ELECTRON_RUN_AS_NODE

REPO="${T3_FORK_REPO:-$HOME/code/t3dotgg/t3code}"
BUILDS="${T3_IOS_BUILDS:-$HOME/code/t3dotgg/t3code-ios-builds}"
TEAM_ID="${T3_IOS_TEAM_ID:-S8U7Q59TMM}"
KEEP_BUILDS=3

register_device=""
case "${1:-}" in
  "") ;;
  --register-device) register_device="${2:?usage: build-ios.sh [--register-device <udid>]}" ;;
  *) echo "usage: build-ios.sh [--register-device <udid>]" >&2; exit 2 ;;
esac

# xcode-select points at the Command Line Tools on this Mac; device builds need the full Xcode.
[[ "${DEVELOPER_DIR:-}" == *.app/Contents/Developer ]] || export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
# CocoaPods needs a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# app.config.ts reads these during prebuild and again while Xcode bundles the JS (the app reads
# its config at runtime), so both steps must see the same values.
export APP_VARIANT=preview
export T3CODE_IOS_PERSONAL_TEAM=1
export T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID="${T3_IOS_BUNDLE_ID:-com.jappyjan.t3code}"
export T3CODE_MOBILE_UPDATES_ENABLED=0
# With updates off the runtime version is unused; skip the slow native fingerprint.
export MOBILE_VERSION_POLICY=appVersion
export EXPO_NO_GIT_STATUS=1 EXPO_NO_TELEMETRY=1 CI=1
export NODE_OPTIONS="--max-old-space-size=4096"

cd "$REPO"
# T3 Connect is off unless the build embeds its public Clerk and relay identifiers (see build-desktop.sh).
[[ -f .env ]] || cp .env.example .env
if ! grep -qE '^T3CODE_RELAY_URL=.+' .env || ! grep -qE '^T3CODE_CLERK_PUBLISHABLE_KEY=.+' .env; then
  echo "$REPO/.env lacks the T3 Connect settings from .env.example; the app would build without T3 Connect." >&2
  exit 1
fi

stamp="$(date +%Y%m%d.%H%M)"
out="$BUILDS/$stamp"
log="$BUILDS/build-$stamp.log"
mkdir -p "$out"
fail() {
  # An empty build folder would count toward KEEP_BUILDS and push out a good build.
  rm -rf "$out"
  echo "$1; log: $log" >&2
  grep -v '^\s*at ' "$log" | grep -v '^\s*$' | tail -40 >&2
  exit 1
}

echo "Building the T3 Code iOS app $stamp from $(git rev-parse --short HEAD) ($(git branch --show-current))"
pnpm install --frozen-lockfile >"$log" 2>&1 || fail "pnpm install failed"
tree_was_clean=0
[[ -z "$(git status --porcelain)" ]] && tree_was_clean=1

cd apps/mobile
# The native project is generated (and gitignored); --clean picks up native changes from upstream.
pnpm exec expo prebuild --clean --platform ios >>"$log" 2>&1 || fail "expo prebuild failed"
# A dirty checkout makes the scheduled rebase skip itself, so undo any tracked-file edits the
# prebuild made. Only when the tree was clean before: never touch my own uncommitted work.
if [[ $tree_was_clean -eq 1 && -n "$(git -C "$REPO" status --porcelain)" ]]; then
  echo "expo prebuild changed the checkout; restoring it:" >>"$log"
  git -C "$REPO" status --porcelain >>"$log"
  git -C "$REPO" diff --name-only -z | xargs -0 git -C "$REPO" checkout --
  [[ -z "$(git -C "$REPO" status --porcelain)" ]] || fail "expo prebuild left files in the checkout"
fi

workspace="$(find ios -maxdepth 1 -name '*.xcworkspace' | head -1)"
[[ -n "$workspace" ]] || fail "expo prebuild made no Xcode workspace"
scheme="$(basename "$workspace" .xcworkspace)"
entitlements="ios/$scheme/$scheme.entitlements"
# My free (Personal) Apple team cannot sign these. The repo's withoutIosPersonalTeamCapabilities
# plugin misses aps-environment (expo-notifications adds it after that plugin runs), and
# associated domains only validate for upstream's team anyway (clerk.t3.codes lists its app ids).
[[ -f "$entitlements" ]] || fail "expo prebuild made no $entitlements"
for key in aps-environment com.apple.developer.applesignin com.apple.security.application-groups \
  com.apple.developer.associated-domains; do
  /usr/libexec/PlistBuddy -c "Delete :$key" "$entitlements" >/dev/null 2>&1 || true
done
{ echo "Entitlements:"; plutil -p "$entitlements"; } >>"$log"
# The build number tells installed builds apart (Settings > General > iPhone Storage, devicectl).
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $stamp" "ios/$scheme/Info.plist"

# Free teams sign for 7 days, and Xcode keeps reusing a cached profile until it expires, so a
# rebuild alone does not extend the app's life. Set aside this app's cached profiles that expire
# within 4 days; Xcode then fetches a fresh 7-day one.
profiles="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
old_profiles="$BUILDS/old-profiles"
renew_before=$(($(date +%s) + 4 * 86400))
for profile in "$profiles"/*.mobileprovision; do
  [[ -f "$profile" ]] || continue
  decoded="$(security cms -D -i "$profile" 2>/dev/null)" || continue
  [[ "$(plutil -extract Entitlements.application-identifier raw -o - - <<<"$decoded" 2>/dev/null)" == \
    "$TEAM_ID.$T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID" ]] || continue
  expires="$(plutil -extract ExpirationDate raw -o - - <<<"$decoded")"
  if (($(date -j -u -f '%Y-%m-%dT%H:%M:%SZ' "$expires" +%s) < renew_before)); then
    echo "Renewing the provisioning profile that expires $expires" >>"$log"
    mkdir -p "$old_profiles"
    mv "$profile" "$old_profiles/"
  fi
done
[[ -d "$old_profiles" ]] && find "$old_profiles" -name '*.mobileprovision' -mtime +30 -delete

destination="generic/platform=iOS"
[[ -n "$register_device" ]] && destination="id=$register_device"
echo "Running xcodebuild ($scheme, Release, $destination)" >>"$log"
xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -destination "$destination" \
  -derivedDataPath "$BUILDS/DerivedData" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration \
  -hideShellScriptEnvironment \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  CURRENT_PROJECT_VERSION="$stamp" \
  build >>"$log" 2>&1 || fail "xcodebuild failed"

built="$BUILDS/DerivedData/Build/Products/Release-iphoneos/$scheme.app"
[[ -d "$built" ]] || fail "xcodebuild finished but $built is missing"
app="$out/$scheme.app"
rm -rf "$app"
ditto "$built" "$app"
git -C "$REPO" rev-parse HEAD >"$out/commit"
# Free Apple teams sign for 7 days only; the scheduled task reinstalls before this date.
security cms -D -i "$app/embedded.mobileprovision" >"$out/profile.plist" 2>/dev/null
plutil -extract ExpirationDate raw -o "$out/profile-expires" "$out/profile.plist"

# Drop all but the newest builds.
find "$BUILDS" -mindepth 1 -maxdepth 1 -type d -name '20[0-9][0-9][0-9][0-9][0-9][0-9].[0-9][0-9][0-9][0-9]' |
  sort -r | tail -n "+$((KEEP_BUILDS + 1))" | while read -r old; do
    rm -rf "$old" "$BUILDS/build-$(basename "$old").log"
  done
# Logs of failed builds have no build folder; drop them after two weeks.
find "$BUILDS" -mindepth 1 -maxdepth 1 -name 'build-*.log' -mtime +14 -delete

version="$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$app/Info.plist")"
echo "Built $(/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$app/Info.plist" 2>/dev/null || echo "$scheme") $version ($stamp), signed until $(cat "$out/profile-expires")"
echo "Log: $log"
echo "$app"
