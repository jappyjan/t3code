#!/usr/bin/env bash
# Publishes a build-ios.sh .ipa as the SideStore source on t3-worker, from which SideStore on my
# iPhone and iPad installs it and keeps it signed (SETUP-ios.md).
#
#   publish-ios.sh <path/to/app.ipa>
#
# Settings come from $BUILDS/publish.conf, which stays on this Mac (the source's path is not
# public):
#
#   T3_IOS_SOURCE_URL=https://t3-worker.<tailnet>.ts.net:8443/<path>  # without /source.json
#   T3_IOS_UPLOAD_HOST=jappy@t3-worker
#   T3_IOS_UPLOAD_KEY=~/.ssh/t3code-ios-publish
#
# The upload key may only replace the published files (nix-fleet t3code-ios-source). The result
# goes to $BUILDS/publish-status and $BUILDS/published-commit.
set -euo pipefail

BUILDS="${T3_IOS_BUILDS:-$HOME/code/t3dotgg/t3code-ios-builds}"
REPO="${T3_FORK_REPO:-$HOME/code/t3dotgg/t3code}"
CONF="$BUILDS/publish.conf"
STATUS="$BUILDS/publish-status"
ICON="$REPO/assets/nightly/nightly-ios-1024.png"

ipa="${1:?usage: publish-ios.sh <app.ipa>}"
[[ -f "$ipa" ]] || { echo "No such file: $ipa" >&2; exit 1; }
[[ -f "$CONF" ]] || { echo "No $CONF; see SETUP-ios.md." >&2; exit 1; }
# shellcheck source=/dev/null
. "$CONF"
: "${T3_IOS_SOURCE_URL:?missing in $CONF}" "${T3_IOS_UPLOAD_HOST:?missing in $CONF}" "${T3_IOS_UPLOAD_KEY:?missing in $CONF}"
T3_IOS_SOURCE_URL="${T3_IOS_SOURCE_URL%/}"
T3_IOS_UPLOAD_KEY="${T3_IOS_UPLOAD_KEY/#\~/$HOME}"

finish() {
  echo "$(date '+%F %T') $1" >"$STATUS"
  echo "$1"
}

stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT

info_entry="$(unzip -Z1 "$ipa" | grep -E '^Payload/[^/]+\.app/Info\.plist$' | head -1)"
[[ -n "$info_entry" ]] || { echo "$ipa holds no app" >&2; exit 1; }
unzip -p "$ipa" "$info_entry" >"$stage/Info.plist"
plutil -convert json -o "$stage/Info.json" "$stage/Info.plist"
rm "$stage/Info.plist"
build="$(plutil -extract CFBundleVersion raw -o - "$stage/Info.json")"
name="T3Code-$build.ipa"
cp "$ipa" "$stage/$name"
cp "$ICON" "$stage/icon.png"
commit="$(cat "$(dirname "$ipa")/commit" 2>/dev/null || true)"

# SideStore (AltStore source format) rejects an app whose version, build, size or hash differ
# from what the source says, or that uses privacy permissions the source does not declare.
# shellcheck disable=SC2016 # JavaScript template strings, not shell.
STAGE="$stage" NAME="$name" URL="$T3_IOS_SOURCE_URL" COMMIT="$commit" \
  SIZE="$(stat -f%z "$stage/$name")" SHA256="$(shasum -a 256 "$stage/$name" | cut -d' ' -f1)" \
  node -e '
    const fs = require("fs");
    const env = process.env;
    const info = JSON.parse(fs.readFileSync(`${env.STAGE}/Info.json`, "utf8"));
    const privacy = Object.fromEntries(
      Object.entries(info).filter(([key]) => /^NS\w*UsageDescription$/.test(key)),
    );
    const commit = env.COMMIT ? env.COMMIT.slice(0, 10) : "unknown";
    const source = {
      name: "T3 Code fork (unofficial)",
      identifier: `${info.CFBundleIdentifier}.source`,
      subtitle: "Private builds of jappyjan/t3code",
      iconURL: `${env.URL}/icon.png`,
      apps: [
        {
          name: info.CFBundleDisplayName ?? info.CFBundleName,
          bundleIdentifier: info.CFBundleIdentifier,
          developerName: "jappyjan (unofficial fork)",
          subtitle: "Unofficial build of the T3 Code fork",
          localizedDescription: "Built from github.com/jappyjan/t3code main. Not affiliated with T3 Tools, Inc.",
          iconURL: `${env.URL}/icon.png`,
          versions: [
            {
              version: info.CFBundleShortVersionString,
              buildVersion: info.CFBundleVersion,
              date: new Date().toISOString(),
              localizedDescription: `Commit ${commit}`,
              downloadURL: `${env.URL}/${env.NAME}`,
              size: Number(env.SIZE),
              sha256: env.SHA256,
              minOSVersion: info.MinimumOSVersion,
            },
          ],
          appPermissions: { entitlements: [], privacy },
        },
      ],
      news: [],
    };
    fs.writeFileSync(`${env.STAGE}/source.json`, JSON.stringify(source, null, 2) + "\n");
  '
rm "$stage/Info.json"

echo "Uploading $name to $T3_IOS_UPLOAD_HOST"
if ! COPYFILE_DISABLE=1 tar -c -C "$stage" . |
  ssh -i "$T3_IOS_UPLOAD_KEY" -o IdentitiesOnly=yes -o IdentityAgent=none -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 "$T3_IOS_UPLOAD_HOST"; then
  finish "Not published: the upload to $T3_IOS_UPLOAD_HOST failed."
  exit 1
fi

published="$(curl -fsS --max-time 60 "$T3_IOS_SOURCE_URL/source.json" |
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).apps[0].versions[0].buildVersion))' ||
  true)"
if [[ "$published" != "$build" ]]; then
  finish "Not published: uploaded $name, but $T3_IOS_SOURCE_URL/source.json lists build ${published:-nothing}."
  exit 1
fi
[[ -n "$commit" ]] && echo "$commit" >"$BUILDS/published-commit"
finish "Published build $build${commit:+ (${commit:0:10})} to $T3_IOS_SOURCE_URL/source.json."
