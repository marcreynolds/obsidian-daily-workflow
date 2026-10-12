#!/usr/bin/env bash
# Cut a release that BRAT can install: bump the version, verify and build,
# commit, tag, push, and publish a GitHub release with the three plugin files.
#
# Usage: scripts/release.sh <version> [notes-file]
#   version     X.Y.Z, without a leading "v" (tags in this repo are unprefixed)
#   notes-file  Markdown release notes. Defaults to GitHub's generated notes.
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <version> [notes-file]" >&2
  exit 2
fi

version="$1"
notes_file="${2:-}"

cd "$(dirname "$0")/.."

fail() {
  echo "error: $*" >&2
  exit 1
}

# Preflight: check everything before changing anything.
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "version must look like 1.2.3"
[[ -z "$notes_file" || -f "$notes_file" ]] || fail "notes file not found: $notes_file"
command -v gh >/dev/null || fail "gh is not installed"
gh auth status >/dev/null 2>&1 || fail "gh is not logged in (run: gh auth login)"
[[ "$(git branch --show-current)" == "main" ]] || fail "not on main"
[[ -z "$(git status --porcelain)" ]] || fail "working tree is not clean"
git fetch --quiet origin main --tags
[[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] \
  || fail "main is not in sync with origin/main"
! git rev-parse -q --verify "refs/tags/$version" >/dev/null \
  || fail "tag $version already exists"

# Bump the version in every file that carries it.
npm version "$version" --no-git-tag-version >/dev/null
VERSION="$version" node -e '
  const fs = require("node:fs");
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  manifest.version = process.env.VERSION;
  fs.writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");
'

# Verify and build from the bumped tree.
npm run check
npm test
npm run build

for asset in main.js manifest.json styles.css; do
  [[ -s "$asset" ]] || fail "missing build output: $asset"
done

git add manifest.json package.json package-lock.json
git commit -m "🔖 Release $version"
git tag "$version"
git push origin main "$version"

notes_args=(--generate-notes)
if [[ -n "$notes_file" ]]; then
  notes_args=(--notes-file "$notes_file")
fi

gh release create "$version" main.js manifest.json styles.css \
  --title "$version" "${notes_args[@]}"

echo "Released $version"
