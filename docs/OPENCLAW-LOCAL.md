# 🦞 OpenClaw Local Setup

[← Back to README](../README.md)

---

Quick guide to run OpenClaw locally with Doraemon.

## Prerequisites

- **Node.js 22+** — Required for OpenClaw
  ```bash
  node --version  # Should be v22.x.x or higher
  ```

## Quick Setup (Copy-Paste)

Run these commands in order:

```bash
# 1. Install OpenClaw globally
npm install -g openclaw

# 2. Configure for local mode
openclaw config set gateway.mode local

# 3. Set auth token (Doraemon uses 'localdev' by default)
openclaw config set gateway.auth.token localdev

# 4. Install as background service
openclaw gateway install

# 5. Start the gateway
openclaw gateway restart

# 6. Verify it's running
openclaw gateway probe
```

You should see `Reachable: yes` in the output.

## Access Dashboard

Open in browser:

```
http://127.0.0.1:18789/?token=localdev
```

## Verify Configuration

```bash
# Check current config
openclaw config get gateway

# Expected output:
# {
#   "mode": "local",
#   "auth": {
#     "token": "localdev"
#   }
# }
```

## Common Commands

| Command | Description |
|---------|-------------|
| `openclaw status` | Full status overview |
| `openclaw gateway probe` | Check if gateway is reachable |
| `openclaw gateway restart` | Restart the gateway |
| `openclaw gateway stop` | Stop the gateway |
| `openclaw logs --follow` | Watch live logs |
| `openclaw doctor` | Diagnose issues |

## Troubleshooting

### Gateway won't start

```bash
# Check error logs
tail -20 ~/.openclaw/logs/gateway.err.log

# Try manual start to see errors
openclaw gateway --verbose
```

### "Auth mode is token but no token configured"

```bash
openclaw config set gateway.auth.token localdev
openclaw gateway restart
```

### Port already in use

```bash
# Find what's using port 18789
lsof -i :18789

# Force restart
openclaw gateway restart --force
```

### Wrong Node version

```bash
# Check version
node --version

# If using nvm, switch to v22
nvm install 22
nvm use 22
nvm alias default 22
```

## Doraemon Configuration

Make sure your `.env` file matches:

```bash
OPENCLAW_URL=ws://127.0.0.1:18789
OPENCLAW_TOKEN=localdev
```

## Uninstall

To completely remove OpenClaw:

```bash
openclaw gateway uninstall
openclaw reset
npm uninstall -g openclaw
```

---

[← Back to README](../README.md) | [⚙️ Configuration](./CONFIGURATION.md)
