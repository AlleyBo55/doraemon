#!/usr/bin/env bash
# Contabo / Linux one-shot installer for the Doraemon Kiro Gateway in front of
# OpenClaw. Idempotent; safe to re-run.
#
# Prereqs:
#   - Linux with systemd
#   - Node.js 20+ available
#   - You have a kiro-auth-token.json from your local Kiro IDE that you copied to
#     ~/.aws/sso/cache/kiro-auth-token.json on this server.
#
# Usage:
#   chmod +x scripts/bootstrap-contabo.sh
#   ./scripts/bootstrap-contabo.sh

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

color() { printf '\033[1;36m%s\033[0m\n' "$*"; }
warn()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
fail()  { printf '\033[1;31m%s\033[0m\n' "$*"; exit 1; }

color "=== 0. preflight checks ==="
[[ "$(uname -s)" == "Linux" ]] || fail "this script is for Linux. on macOS use install-gateway-launchagent.mjs"
command -v node >/dev/null || fail "node not found. install Node.js 20+ first."
command -v npm  >/dev/null || fail "npm not found."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "node $NODE_MAJOR is too old. need 20+"

KIRO_TOKEN_PATH="$HOME/.aws/sso/cache/kiro-auth-token.json"
[[ -f "$KIRO_TOKEN_PATH" ]] || fail "Kiro creds missing at $KIRO_TOKEN_PATH. scp it from your local Mac."

color "=== 1. install OpenClaw if missing ==="
if ! command -v openclaw >/dev/null; then
  npm install -g openclaw
fi

color "=== 2. install project deps (tsx for ESM TS loading) ==="
npm install --no-audit --no-fund

color "=== 3. configure OpenClaw model tiers ==="
node scripts/configure-openclaw-kiro.mjs || true

color "=== 4. patch pi-ai's hardcoded api.anthropic.com ==="
node scripts/patch-openclaw-anthropic-baseurl.mjs

color "=== 5. wire per-agent auth profiles to use the gateway token ==="
node scripts/wire-openclaw-kiro.mjs

color "=== 6. install kiro-gateway as a systemd --user service ==="
node scripts/install-gateway-systemd.mjs

color "=== 7. install OpenClaw gateway as a systemd --user service if not yet ==="
if ! systemctl --user list-unit-files 2>/dev/null | grep -qE 'openclaw'; then
  warn "OpenClaw is not yet registered as a user service."
  warn "Run:  openclaw gateway install"
  warn "Then re-run:  node scripts/wire-openclaw-systemd-env.mjs"
else
  node scripts/wire-openclaw-systemd-env.mjs
fi

color "=== 8. health checks ==="
sleep 3
curl -sS http://127.0.0.1:18790/health || fail "kiro-gateway not responding on :18790"
echo

color "=== DONE ==="
echo "Send a test message:"
echo "  openclaw agent --agent main --message 'PING' --json | jq '.result.payloads[0].text'"
echo "Watch gateway log:"
echo "  journalctl --user -u doraemon-kiro-gateway -f"
echo "Watch OpenClaw log:"
echo "  journalctl --user -u openclaw-gateway -f"
