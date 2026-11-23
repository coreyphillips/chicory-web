#!/usr/bin/env bash
set -euo pipefail

# Run after next build in a clean checkout. Keep runtime secrets outside the build.
archive=${1:?Usage: bash scripts/release/package.sh /absolute/path/to/archive.tar.gz}
case "$archive" in /*) ;; *) echo 'Use an absolute output path.' >&2; exit 2 ;; esac
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

tar -C .next/standalone --exclude='.env' --exclude='.env.*' -cf - server.js package.json .next node_modules | tar -C "$stage" -xf -
mkdir -p "$stage/.next/static" "$stage/public" "$stage/scripts/wallet"
cp -R .next/static/. "$stage/.next/static/"
cp -R public/brand public/wallet-engine "$stage/public/"
cp LICENSE "$stage/"
cp scripts/wallet/{relay,bridge,limits,iroh,transport}.mjs "$stage/scripts/wallet/"
test -f "$stage/server.js"
test -f "$stage/public/wallet-engine/worker.js"
test -f "$stage/public/wallet-engine/sql-wasm.wasm"
tar -C "$stage" -czf "$archive" .
