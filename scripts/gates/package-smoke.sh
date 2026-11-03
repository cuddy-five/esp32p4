#!/usr/bin/env bash
# Install the release tarball into an empty project and run its CLI there.
# The CLI reads contracts and policies relative to its own install directory,
# so a missing entry in package.json "files" only shows up at this point.
#
# Usage: scripts/gates/package-smoke.sh [tarball]
# Without an argument the script packs the current checkout first.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [ "$#" -gt 0 ]; then
  tarball="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
else
  tarball="$work/$(cd "$repo_root" && npm pack --silent --pack-destination "$work" | tail -n 1)"
fi

# Development-only material must stay out of the artifact.
if tar -tzf "$tarball" | grep -E '^package/(tests|docs|\.idea|\.claude|\.devcontainer|node_modules)/'; then
  echo "package-smoke: the tarball contains development-only paths (listed above)" >&2
  exit 1
fi

mkdir "$work/consumer"
cd "$work/consumer"
npm init -y >/dev/null
npm install --no-audit --no-fund --no-package-lock "$tarball" >/dev/null
cli="$work/consumer/node_modules/.bin/control-plane"

"$cli" policy check
"$cli" schema list >/dev/null
"$cli" validate "$repo_root"/.github/control-plane/contracts/examples/*.json
echo "package-smoke: installed $(basename "$tarball") and ran policy check, schema list and validate"
