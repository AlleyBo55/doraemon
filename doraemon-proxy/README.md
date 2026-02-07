# Doraemon Proxy

Cloudflare Worker that sits between the Electron app and Anthropic API.

## What it does

- Holds the Anthropic API key server-side (user never sees it)
- Injects soul.md as system prompt with prompt caching
- Rate limits per device (20 chats/day default)
- CORS handling

## Setup

```bash
cd doraemon-proxy
npm install
```

## Deploy

```bash
# Set your API key as a secret (not in wrangler.toml)
npx wrangler secret put ANTHROPIC_API_KEY

# Create KV namespace
npx wrangler kv namespace create RATE_LIMITS
# Copy the ID into wrangler.toml

# Deploy
npm run deploy
```

## Local dev

```bash
npm run dev
```

## Cost

- Haiku 3.5 with prompt caching: ~$0.002/chat
- 20 chats/day × 30 days = ~$1.20/month per user
- Cloudflare Workers free tier: 100k requests/day
