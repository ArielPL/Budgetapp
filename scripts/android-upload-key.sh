#!/bin/bash
# Creates the upload key for Google Play, once, and the file the release build reads it from.
# Run it yourself in a terminal so only you see the password:
#   bash scripts/android-upload-key.sh
#
# The key goes to ~/Developer/budget-keys (outside the repo and outside iCloud), and
# android/keystore.properties (git-ignored) tells Gradle where it is. Google re-signs the
# app with its own key (Play App Signing), so a lost upload key can be reset through Play
# support, but keep a copy of the .jks file and the password anyway.
set -euo pipefail

DIR="$HOME/Developer/budget-keys"
KEY="$DIR/yourbudget-upload.jks"
PROPS="$(cd "$(dirname "$0")/.." && pwd)/android/keystore.properties"
JAVA_HOME="${JAVA_HOME:-$HOME/Library/Java/JavaVirtualMachines/jbr-21.0.11/Contents/Home}"

if [ -e "$KEY" ]; then echo "The key already exists: $KEY"; exit 1; fi

read -rsp "Choose a password (at least 8 characters, no backslash): " P1; echo
read -rsp "The same password again: " P2; echo
if [ "$P1" != "$P2" ]; then echo "The passwords differ. Nothing was created."; exit 1; fi
if [ ${#P1} -lt 8 ]; then echo "Too short. Nothing was created."; exit 1; fi
case "$P1" in *\\*) echo "No backslash, please. Nothing was created."; exit 1;; esac

mkdir -p "$DIR"; chmod 700 "$DIR"
export KS_PASS="$P1"
"$JAVA_HOME/bin/keytool" -genkeypair -keystore "$KEY" -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass:env KS_PASS -keypass:env KS_PASS -dname "CN=YourBudget"

umask 077
cat > "$PROPS" <<EOF
storeFile=$KEY
storePassword=$P1
keyAlias=upload
keyPassword=$P1
EOF

echo
echo "Done. Key: $KEY"
echo "Save the password in your password manager and keep a copy of the .jks file."
