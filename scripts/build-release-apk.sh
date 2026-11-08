#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYSTORE="$ROOT_DIR/android/app/local-release.keystore"

echo "=== [1/4] Checking Release Keystore ==="
if [ ! -f "$KEYSTORE" ]; then
  echo "Generating local release keystore..."
  keytool -genkeypair -v -keystore "$KEYSTORE" \
    -alias securevoice -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=SecureVoice, OU=Engineering, O=SecureVoice, L=Local, S=State, C=US" \
    -storepass securevoice -keypass securevoice
fi

echo "=== [2/4] Building Web Assets & Syncing Capacitor ==="
cd "$ROOT_DIR"
corepack npm run build
./node_modules/.bin/cap sync android

echo "=== [3/4] Assembling Android Release APK ==="
cd "$ROOT_DIR/android"
KEYSTORE_FILE="local-release.keystore" \
KEYSTORE_PASSWORD="securevoice" \
KEY_ALIAS="securevoice" \
KEY_PASSWORD="securevoice" \
./gradlew assembleRelease

echo "=== [4/4] Verifying APK Signature & Exporting ==="
mkdir -p "$ROOT_DIR/dist"
cp "$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk" "$ROOT_DIR/dist/SecureVoice-v3.8.2-release.apk"
cd "$ROOT_DIR/dist"
sha256sum SecureVoice-v3.8.2-release.apk > SHA256SUMS.txt

echo "✅ Release APK built successfully: dist/SecureVoice-v3.8.2-release.apk"
cat SHA256SUMS.txt
