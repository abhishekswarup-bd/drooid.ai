#!/bin/bash
# ──────────────────────────────────────────────────
# Drooid Website — Build & Deploy Script
# Usage: ./deploy.sh "commit message"
# ──────────────────────────────────────────────────

set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

# Default commit message
MSG="${1:-Update site}"

echo "🚀 Drooid Deploy"
echo "─────────────────────────────────"

# Check for changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "✅ No changes to deploy."
    exit 0
fi

# Show what's changed
echo "📋 Changes:"
git status --short
echo ""

# Stage everything
git add -A

# Commit
git commit -m "$MSG"

# Push
echo ""
echo "📤 Pushing to GitHub..."
git push

echo ""
echo "✅ Deployed! Changes will be live at https://drooid.org in ~60 seconds."
echo "─────────────────────────────────"
