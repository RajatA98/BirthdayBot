#!/usr/bin/env bash
set -euo pipefail

if [ ! -d ops/updates ]; then
  echo "No ops/updates directory present."
  exit 0
fi

git diff --name-only ORIG_HEAD HEAD -- ops/updates 2>/dev/null || true
