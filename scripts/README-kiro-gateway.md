# Kiro Gateway for OpenClaw

A local HTTP server that wraps your Kiro IDE session with an Anthropic-shape API,
so OpenClaw (and any tool that targets `api.anthropic.com`) routes through your
Kiro entitlement instead of paying per token at api.anthropic.com.

## Two-tier model routing

| Agent | OpenClaw label | Upstream Kiro model |
|-------|---------------|---------------------|
| `main` (orchestrator) | `anthropic/claude-opus-4-6` | **Claude Opus 4.7** |
| Every other agent | `anthropic/claude-haiku-4-5` | **Claude Haiku 4.5** |

The gateway model-map aliases the OpenClaw labels to the latest Kiro model IDs.
When AWS exposes a newer Opus through your Kiro entitlement, change the alias —
no OpenClaw config edits needed.

## How it works

```
WhatsApp/CLI ──▶ openclaw gateway (ws :18789)
                   │
                   ▼
              pi-ai / @anthropic-ai/sdk
                   │ (baseURL = ANTHROPIC_BASE_URL)
                   ▼
        kiro-gateway (http :18790)  ◀── this project
                   │ (Bearer auth = Kiro token from ~/.aws/sso/cache)
                   ▼
        codewhisperer.us-east-1.amazonaws.com
                   │
                   ▼
              Claude Opus 4.7 / Haiku 4.5
```

Two tricks make it work:
1. **Patch `pi-ai`'s `models.generated.js`** to read `ANTHROPIC_BASE_URL` at
   runtime (replaces 22 hardcoded `https://api.anthropic.com` strings).
2. **Inject `ANTHROPIC_BASE_URL=http://127.0.0.1:18790`** into the OpenClaw
   service environment (LaunchAgent on macOS, systemd drop-in on Linux).

## Setup on macOS

```bash
node scripts/configure-openclaw-kiro.mjs
node scripts/patch-openclaw-anthropic-baseurl.mjs
node scripts/wire-openclaw-kiro.mjs
node scripts/install-gateway-launchagent.mjs
launchctl bootout gui/$UID/ai.openclaw.gateway 2>/dev/null
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

## Setup on Linux / Contabo

Copy your Kiro token from your Mac first:

```bash
# on your Mac
scp ~/.aws/sso/cache/kiro-auth-token.json contabo:~/.aws/sso/cache/kiro-auth-token.json
```

On the server:

```bash
git clone <doraemon-repo>
cd doraemon
./scripts/bootstrap-contabo.sh
```

That single command runs all the steps above plus registers the gateway as a
systemd `--user` service.

## Verifying

```bash
# Should print Opus details:
openclaw agent --agent main --message "ping" --json | jq '.result.payloads[0].text'

# macOS:
tail -f ~/.openclaw/logs/kiro-gateway.log
# Linux:
journalctl --user -u doraemon-kiro-gateway -f
```

Look for log lines like:
```
[llm] provider=kiro model=claude-opus-4.7 path="/v1/messages (stream)" ms=9132 ok=true
[llm] provider=kiro model=claude-haiku-4.5 path="/v1/messages (stream)" ms=2207 ok=true
```

If you see those, traffic is flowing through the gateway and hitting your Kiro
session.

## After `npm update -g openclaw`

The pi-ai patch lives inside OpenClaw's `node_modules`. Re-run:

```bash
node scripts/patch-openclaw-anthropic-baseurl.mjs
```

It's idempotent.

## Troubleshooting

**"streaming not yet supported by gateway"** — your gateway is on an old version.
Pull the latest and restart it.

**"invalid or missing token"** — the token in OpenClaw's per-agent
`auth-profiles.json` doesn't match what kiro-gateway minted. Re-run
`node scripts/wire-openclaw-kiro.mjs` (it reads/reuses the existing token), then
restart the gateway.

**Agent says it's running on Haiku when you asked for Opus** — model
self-reporting is unreliable. The gateway log is the source of truth. If the log
shows `model=claude-opus-4.7`, you're on Opus regardless of what the agent says.

**"Kiro session expired"** — log into Kiro IDE again on a Mac, then `scp` the
refreshed `~/.aws/sso/cache/kiro-auth-token.json` to the server.
