#!/usr/bin/env bash
# One-time per clone: declare your lane and enable the lane-lock pre-commit hook.
#   bash scripts/setup-lane.sh A   # Track A — Meetings & Voice
#   bash scripts/setup-lane.sh B   # Track B — Org / Chat / Knowledge
set -euo pipefail

lane="${1:-}"
if [ "$lane" != "A" ] && [ "$lane" != "B" ]; then
  echo "usage: bash scripts/setup-lane.sh A|B"
  echo "  A = Meetings & Voice    B = Org/Chat/Knowledge   (see OWNERSHIP.md)"
  exit 1
fi

cd "$(git rev-parse --show-toplevel)"
echo "$lane" > .lane
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit 2>/dev/null || true

echo "✓ Lane set to $lane (.lane, git-ignored — per machine)"
echo "✓ Lane-lock hook enabled (core.hooksPath = .githooks)"
echo "  You can now only commit your lane's files + shared foundation. Override: git commit --no-verify"
