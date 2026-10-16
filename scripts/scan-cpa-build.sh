#!/usr/bin/env bash
set -euo pipefail

app="${1:?application path required}"
report="${2:?report directory required}"
archives="${3:?archive directory required}"
mkdir -p "$report"
scan_tmp="$(mktemp -d)"
trap 'rm -rf -- "$scan_tmp"' EXIT
mkdir -p "$scan_tmp/db"

cat > "$scan_tmp/freshclam.conf" <<EOF
DatabaseDirectory $scan_tmp/db
DatabaseMirror database.clamav.net
DatabaseOwner $(id -un)
Foreground yes
ConnectTimeout 30
ReceiveTimeout 120
MaxAttempts 2
EOF

clamscan --version > "$report/scanner-version.txt"
freshclam --config-file="$scan_tmp/freshclam.conf" --stdout 2>&1 | tee "$report/database-update.log"
clamscan --database="$scan_tmp/db" --recursive=yes --infected \
  --max-filesize=512M --max-scansize=2G --pcre-max-filesize=512M \
  --alert-exceeds-max=yes "$app" "$archives" 2>&1 | tee "$report/scan.log"
