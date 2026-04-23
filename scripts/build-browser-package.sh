#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 <chrome|edge|firefox>"
  exit 1
fi

case "$TARGET" in
  chrome|edge|firefox)
    ;;
  *)
    echo "Unsupported target: $TARGET"
    echo "Supported targets: chrome, edge, firefox"
    exit 1
    ;;
esac

DIST_DIR="$ROOT_DIR/dist/$TARGET"
MANIFEST_TEMPLATE="$ROOT_DIR/manifests/manifest.$TARGET.json"

if [[ ! -f "$MANIFEST_TEMPLATE" ]]; then
  echo "Missing manifest template: $MANIFEST_TEMPLATE"
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp "$ROOT_DIR/background.js" "$DIST_DIR/"
cp "$ROOT_DIR/content.js" "$DIST_DIR/"
cp "$ROOT_DIR/popup.html" "$DIST_DIR/"
cp "$ROOT_DIR/popup.js" "$DIST_DIR/"
cp "$ROOT_DIR/options.html" "$DIST_DIR/"
cp "$ROOT_DIR/options.js" "$DIST_DIR/"
cp "$ROOT_DIR/extension.css" "$DIST_DIR/"
cp "$ROOT_DIR/logo_v2.png" "$DIST_DIR/"
cp -R "$ROOT_DIR/_locales" "$DIST_DIR/"
cp "$MANIFEST_TEMPLATE" "$DIST_DIR/manifest.json"

echo "Prepared $TARGET package in: $DIST_DIR"
