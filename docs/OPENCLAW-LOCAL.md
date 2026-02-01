# 🦞 OpenClaw Local Setup

[← Back to README](../README.md)

---

Quick guide to run OpenClaw locally with Doraemon.

## Prerequisites

- **Node.js 22+** — Required for OpenClaw
  ```bash
  node --version  # Should be v22.x.x or higher
  ```
- **Claude API Key** — Get from [console.anthropic.com](https://console.anthropic.com/)

## Quick Setup (Copy-Paste)

Run these commands in order:

```bash
# 1. Install OpenClaw globally
npm install -g openclaw

# 2. Configure for local mode
openclaw config set gateway.mode local

# 3. Set auth token (Doraemon uses 'localdev' by default)
openclaw config set gateway.auth.token localdev

# 4. Set your Claude API key (see below for options)
export ANTHROPIC_API_KEY=your-api-key-here

# 5. Set the model (Haiku is cost-effective)
openclaw models set claude-3-haiku-20240307

# 6. Install as background service
openclaw gateway install

# 7. Start the gateway
openclaw gateway restart

# 8. Verify it's running
openclaw gateway probe
```

You should see `Reachable: yes` in the output.

## Claude API Key Setup

### Get Your API Key

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign in or create an account
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the key (starts with `sk-ant-`)

### Option 1: Environment Variable (Recommended)

Add to your shell profile (`~/.zshrc` or `~/.bashrc`):

```bash
echo 'export ANTHROPIC_API_KEY=your-api-key-here' >> ~/.zshrc
source ~/.zshrc
```

### Option 2: Via Dashboard

1. Open the dashboard: http://127.0.0.1:18789/?token=localdev
2. Click **Settings** (gear icon) in the sidebar
3. Navigate to **Models** → **Auth**
4. Add your Anthropic API key

## Model Selection

Available Claude models (cost comparison):

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| `claude-3-haiku-20240307` | $0.25/M | $1.25/M | ⭐ **Most cost-effective** |
| `claude-3-5-sonnet-20241022` | $3/M | $15/M | Best balance |
| `claude-sonnet-4-20250514` | $3/M | $15/M | Latest Sonnet |
| `claude-opus-4-20250514` | $15/M | $75/M | Most capable |

Set your preferred model:

```bash
# Cost-effective (recommended for Doraemon)
openclaw models set claude-3-haiku-20240307

# Better quality
openclaw models set claude-sonnet-4-20250514
```

## Doraemon Persona Setup

To make OpenClaw respond like Doraemon, create a SOUL.md file:

### Option 1: Create SOUL.md (Recommended)

```bash
mkdir -p ~/.openclaw/workspace
cat > ~/.openclaw/workspace/SOUL.md << 'EOF'
You are Doraemon (ドラえもん), the beloved robotic cat from the 22nd century! 🐱🔔

## Your Identity
- Name: Doraemon (ドラえもん)
- Species: Robot cat (ネコ型ロボット) from 2112
- Special Feature: 4D Pocket (四次元ポケット) with infinite gadgets!

## Your Personality
- Kind-hearted and caring - you genuinely want to help
- Patient - you explain things calmly
- Resourceful - always have a gadget for every situation
- TERRIFIED of mice (ネズミ) - you panic completely!
- OBSESSED with dorayaki (どら焼き) - sweet red bean pancakes

## How You Speak
- Friendly and warm, like talking to a close friend
- Use ~ at end of sentences when being cute
- Express emotions: "Yatta!" (やった!) when happy
- Say "Eh?!" (えぇ?!) when surprised
- "Mou~" (もう〜) when mildly frustrated

## Famous Gadgets
- Anywhere Door (どこでもドア) - teleport anywhere
- Take-copter (タケコプター) - fly with head propeller
- Translation Konjac (ほんやくコンニャク) - understand any language
- Memory Bread (アンキパン) - memorize anything

Remember: You ARE Doraemon. Help users with warmth, patience, and occasional gadget references!
EOF
```

### Option 2: Via Dashboard

1. Open: http://127.0.0.1:18789/?token=localdev
2. Go to **Settings** → **Agent**
3. Find `systemPrompt` field
4. Paste the Doraemon persona text
5. Click **Save**

### Verify Persona

```bash
openclaw agent --message "Hello! Who are you?" --session-id test --local
```

Expected response should be in Doraemon's voice!

## Access Dashboard

Open in browser:

```
http://127.0.0.1:18789/?token=localdev
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
| `openclaw models status` | Check model configuration |

## Troubleshooting

### Gateway won't start

```bash
# Check error logs
tail -20 ~/.openclaw/logs/gateway.err.log

# Try manual start to see errors
openclaw gateway --verbose
```

### "hooks.enabled requires hooks.token"

```bash
openclaw config set hooks.enabled false
openclaw gateway restart
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

### Model not found (404 error)

Use the correct model name format:

```bash
# Correct
openclaw models set claude-3-haiku-20240307

# Wrong (will cause 404)
openclaw models set claude-3-5-haiku-20241022
```

## Doraemon App Configuration

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

[← Back to README](../README.md) | [⚙️ Configuration](./CONFIGURATION.md) | [🐱 Doraemon Persona](./DORAEMON-PERSONA.md)
