#!/usr/bin/env bash
# Builds the T3 Code desktop app (macOS, this machine's arch, unsigned) from the fork checkout.
# Prints the path of the built .app on its last line.
#
# The version uses the nightly format so the app keeps the "T3 Code (Nightly)" name and path.
# No update feed is configured, so the app never auto-updates back to upstream's nightly.
set -euo pipefail

# Agents run inside T3 Code, whose server sets this; an app launched with it starts as plain Node
# and exits at once. `open` passes the caller's environment on to the app.
unset ELECTRON_RUN_AS_NODE

REPO="${T3_FORK_REPO:-$HOME/code/t3dotgg/t3code}"
BUILDS="${T3_FORK_BUILDS:-$HOME/code/t3dotgg/t3code-desktop-builds}"
KEEP_BUILDS=3
case "$(uname -m)" in arm64) ARCH=arm64 ;; x86_64) ARCH=x64 ;; *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;; esac

cd "$REPO"
# T3 Connect is off unless the build embeds its public Clerk and relay identifiers. Official
# builds take them from `.env.example`; `.env` is gitignored, so rebases leave it alone.
[[ -f .env ]] || cp .env.example .env
if ! grep -qE '^T3CODE_RELAY_URL=.+' .env || ! grep -qE '^T3CODE_CLERK_PUBLISHABLE_KEY=.+' .env; then
  echo "$REPO/.env lacks the T3 Connect settings from .env.example; the app would build without T3 Connect." >&2
  exit 1
fi
base_version="$(node -p "require('./apps/desktop/package.json').version")"
version="${base_version}-nightly.$(date +%Y%m%d).$(date +%H%M)"
out="$BUILDS/$version"
log="$BUILDS/build-$version.log"
mkdir -p "$out"

echo "Building T3 Code $version from $(git rev-parse --short HEAD) ($(git branch --show-current))"
pnpm install --frozen-lockfile >"$log" 2>&1
# Rust is only needed for the bundled resource monitor. Use cargo/rustc from PATH when installed
# (e.g. Homebrew), otherwise nixpkgs provides them per build.
with_rust() {
  if command -v cargo >/dev/null 2>&1 && command -v rustc >/dev/null 2>&1; then
    "$@"
  else
    nix shell nixpkgs#cargo nixpkgs#rustc -c "$@"
  fi
}
if ! CSC_IDENTITY_AUTO_DISCOVERY=false \
  T3CODE_DESKTOP_VERSION="$version" \
  T3CODE_DESKTOP_OUTPUT_DIR="$out" \
  with_rust \
  pnpm exec node scripts/build-desktop-artifact.ts --platform mac --target zip --arch "$ARCH" >>"$log" 2>&1; then
  echo "Build failed; log: $log" >&2
  grep -v '^\s*at ' "$log" | tail -30 >&2
  exit 1
fi

zip="$(find "$out" -maxdepth 1 -name '*.zip' | head -1)"
if [[ -n "$zip" ]]; then
  ditto -x -k "$zip" "$out/app" && rm -f "$zip"
fi
app="$(find "$out" -maxdepth 3 -name '*.app' -type d | head -1)"
if [[ -z "$app" ]]; then
  echo "Build finished but no .app was found in $out; log: $log" >&2
  exit 1
fi

git rev-parse HEAD >"$(dirname "$app")/commit"

# Drop all but the newest builds.
find "$BUILDS" -mindepth 1 -maxdepth 1 -type d -name '*-nightly.*' | sort -r | tail -n "+$((KEEP_BUILDS + 1))" | while read -r old; do
  rm -rf "$old" "$BUILDS/build-$(basename "$old").log"
done

echo "Log: $log"
echo "$app"
