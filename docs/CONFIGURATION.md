# ⚙️ Configuration

[← Back to README](../README.md)

---

## Environment Variables

Create a `.env` file or set environment variables:

```bash
# OpenClaw Gateway URL (required for AI features)
OPENCLAW_URL=ws://127.0.0.1:18789
```

## Connecting to OpenClaw

### Local Deployment

If you're running OpenClaw locally:

```bash
# Default local gateway
OPENCLAW_URL=ws://127.0.0.1:18789
```

### Cloud Deployment

For cloud-hosted OpenClaw instances:

```bash
# Secure WebSocket for cloud
OPENCLAW_URL=wss://your-openclaw-server.com:18789

# With custom port
OPENCLAW_URL=wss://openclaw.example.com:443/gateway
```

### Connection Examples

| Deployment | URL |
|------------|-----|
| Local (default) | `ws://127.0.0.1:18789` |
| Local (custom port) | `ws://localhost:8080` |
| Cloud (secure) | `wss://api.openclaw.io:18789` |
| Cloud (behind proxy) | `wss://openclaw.mycompany.com/ws` |

## Running with Environment Variables

```bash
# macOS / Linux
OPENCLAW_URL=wss://my-server.com:18789 npm run dev

# Windows (PowerShell)
$env:OPENCLAW_URL="wss://my-server.com:18789"; npm run dev

# Windows (CMD)
set OPENCLAW_URL=wss://my-server.com:18789 && npm run dev
```

---

[← Back to README](../README.md)
