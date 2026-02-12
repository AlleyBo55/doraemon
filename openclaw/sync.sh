#!/bin/bash

# Sync openclaw source files → ~/.openclaw/workspace/ (runtime location)
# Run after editing any .md files in doraemon/openclaw/
#
# Partner context injection:
#   If partners/<skill>.json exists, it injects brand/config data into
#   a temporary copy of the skill before deploying. The source skill.md
#   stays brand-agnostic; only the deployed SKILL.md gets partner context.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$HOME/.openclaw/workspace"
SKILLS_DIR="$WORKSPACE_DIR/skills"
PARTNERS_DIR="$SCRIPT_DIR/partners"
TMP_DIR=$(mktemp -d)

changed=0

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

sync_file() {
  local src="$1" dst="$2"
  if [ ! -f "$src" ]; then return; fi
  mkdir -p "$(dirname "$dst")"
  if ! cmp -s "$src" "$dst" 2>/dev/null; then
    cp "$src" "$dst"
    echo "  ✓ $(basename "$src") → $dst"
    changed=$((changed + 1))
  fi
}

echo "🔄 Syncing openclaw files to runtime..."

sync_file "$SCRIPT_DIR/soul.md" "$WORKSPACE_DIR/SOUL.md"

for skill_file in "$SCRIPT_DIR"/*-skill.md; do
  [ -f "$skill_file" ] || continue
  skill_name=$(basename "$skill_file" | sed 's/-skill\.md$//')
  partner_json="$PARTNERS_DIR/${skill_name}.json"

  if [ -f "$partner_json" ]; then
    # Copy to temp, inject partner context, then sync the injected version
    cp "$skill_file" "$TMP_DIR/$(basename "$skill_file")"
    bash "$SCRIPT_DIR/inject-partner-context.sh" \
      "$(basename "$skill_file")" \
      "partners/${skill_name}.json" \
      2>/dev/null

    # The injection modifies the source in-place, so we need to:
    # 1. Use the injected version for deployment
    # 2. Restore the original source file
    injected_file="$skill_file"
    sync_file "$injected_file" "$SKILLS_DIR/$skill_name/SKILL.md"
    # Restore original (brand-agnostic) source
    cp "$TMP_DIR/$(basename "$skill_file")" "$skill_file"
  else
    sync_file "$skill_file" "$SKILLS_DIR/$skill_name/SKILL.md"
  fi
done

if [ "$changed" -eq 0 ]; then
  echo "  (already in sync)"
else
  echo "  Synced $changed file(s)"
fi
