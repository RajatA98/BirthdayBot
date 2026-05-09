#!/usr/bin/env bash
set -euo pipefail

branch="$(git branch --show-current 2>/dev/null || echo detached-head)"
sha="$(git rev-parse --short HEAD 2>/dev/null || echo no-commit)"
date_stamp="$(date +%F)"
target="ops/updates/${date_stamp}--${branch//\//-}--${sha}.md"

mkdir -p ops/updates

cat > "$target" <<EOF
# Ops Update

- Date: ${date_stamp}
- Branch: ${branch}
- Commit: ${sha}

## Summary

Fill in what changed before pushing.

## Blockers Or Risks

None noted.

## Next Context

What the next human or Codex instance should know.
EOF

echo "$target"
