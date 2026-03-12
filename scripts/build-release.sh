#!/usr/bin/env bash
set -euo pipefail

# n8n Pilot — Build Release Archive
# Creates a minimal ZIP for Chrome extension installation.
#
# Usage:
#   bash scripts/build-release.sh
#
# Output:
#   dist/n8n-pilot-vX.Y.Z.zip

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Read version from package.json
VERSION=$(node -p "require('$ROOT/package.json').version")
ARCHIVE_NAME="n8n-pilot-v${VERSION}"
DIST_DIR="$ROOT/dist"
BUILD_DIR="$DIST_DIR/$ARCHIVE_NAME"

echo ""
echo "=================================="
echo "  n8n Pilot — Release Builder"
echo "  Version: $VERSION"
echo "=================================="
echo ""

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy extension files
echo "Copying extension files..."

# Core files
cp "$ROOT/manifest.json" "$BUILD_DIR/"
cp "$ROOT/background.js" "$BUILD_DIR/"
cp "$ROOT/content.js" "$BUILD_DIR/"
cp "$ROOT/LICENSE" "$BUILD_DIR/"
cp "$ROOT/README.md" "$BUILD_DIR/"
cp "$ROOT/CHANGELOG.md" "$BUILD_DIR/"

# Panel UI
mkdir -p "$BUILD_DIR/panel"
cp "$ROOT/panel/panel.html" "$BUILD_DIR/panel/"
cp "$ROOT/panel/panel.css" "$BUILD_DIR/panel/"
cp "$ROOT/panel/chat.js" "$BUILD_DIR/panel/"
cp "$ROOT/panel/settings-view.js" "$BUILD_DIR/panel/"

# Library modules
mkdir -p "$BUILD_DIR/lib"
cp "$ROOT/lib/"*.js "$BUILD_DIR/lib/"

# Icons
mkdir -p "$BUILD_DIR/icons"
cp "$ROOT/icons/"*.png "$BUILD_DIR/icons/"

# .env.example (for reference)
if [ -f "$ROOT/.env.example" ]; then
  cp "$ROOT/.env.example" "$BUILD_DIR/"
fi

# Create ZIP
echo "Creating archive..."
cd "$DIST_DIR"
rm -f "${ARCHIVE_NAME}.zip"
zip -r -q "${ARCHIVE_NAME}.zip" "$ARCHIVE_NAME"

# Cleanup build directory
rm -rf "$BUILD_DIR"

# Stats
ZIP_PATH="$DIST_DIR/${ARCHIVE_NAME}.zip"
ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
FILE_COUNT=$(zipinfo -1 "$ZIP_PATH" | wc -l | tr -d ' ')

echo ""
echo "=================================="
echo "  Build complete!"
echo ""
echo "  Archive: dist/${ARCHIVE_NAME}.zip"
echo "  Size:    $ZIP_SIZE"
echo "  Files:   $FILE_COUNT"
echo "=================================="
echo ""
echo "Contents:"
zipinfo -1 "$ZIP_PATH" | head -30
echo ""
echo "Next steps:"
echo "  1. Test: unzip and load in Chrome (chrome://extensions)"
echo "  2. Release: gh release create v${VERSION} ${ZIP_PATH}"
echo ""
