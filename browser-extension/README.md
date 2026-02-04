# Doraemon Browser Companion

Chrome extension that captures browsing content from whitelisted sites for Doraemon's memory system.

## Privacy-First Design

- **Strict whitelist**: Only captures from explicitly allowed domains
- **Local only**: All data stays on your machine (localhost:18790)
- **No tracking**: No analytics, no external servers
- **Sanitized**: PII and sensitive data stripped before storage
- **3-layer filter**: Domain check → Content sanitization → Prompt injection defense

## Supported Sites

| Category | Sites |
|----------|-------|
| Social | X/Twitter, Reddit |
| Video | YouTube |
| Dev | GitHub, Hacker News, Stack Overflow, Dev.to, Medium |
| News | TechCrunch, The Verge, Wired, Ars Technica |
| Entertainment | Manhwaz, Shinigami09 |
| Personal | Moltbook |

## What Gets Captured

| Site | Content Type |
|------|--------------|
| X/Twitter | Tweet text from your feed |
| Reddit | Post titles |
| YouTube | Video title + channel |
| GitHub | Repo name + description |
| Hacker News | Story titles |
| News sites | Article headlines |
| Manga sites | Series + chapter info |

## Installation

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this `browser-extension` folder

## Requirements

- Doraemon desktop app running
- Memory system enabled (`MEMORY_SYSTEM_ENABLED=1` in .env)
- WebSocket server on port 18790

## How It Works

```
Browser Tab → Content Script → Background Script → WebSocket → Doraemon
                                                      ↓
                                              Memory System
                                                      ↓
                                              3-Layer Filter
                                                      ↓
                                              Encrypted Storage
```

## Data Flow

1. Content script extracts visible content (tweets, titles, etc.)
2. Background script sends to Doraemon via WebSocket
3. Memory system applies 3-layer filter:
   - Layer 1: Domain whitelist check
   - Layer 2: PII/sensitive data sanitization
   - Layer 3: Prompt injection defense
4. Clean content stored in encrypted local SQLite

## Troubleshooting

**Extension shows "Doraemon not running"**
- Make sure Doraemon desktop app is open
- Check if port 18790 is available

**Not capturing content**
- Refresh the page after installing extension
- Check browser console for errors
- Verify site is in whitelist

**Content not appearing in memory**
- Check `MEMORY_SYSTEM_ENABLED=1` in .env
- Look at Doraemon logs for filter rejections

## Security Audit

This extension was designed with privacy in mind:

- ✅ No external network requests (localhost only)
- ✅ No persistent storage in extension
- ✅ No background tracking
- ✅ Minimal permissions (tabs only)
- ✅ All filtering happens server-side
- ✅ Content sanitized before storage
- ✅ Encrypted at rest (AES-256-GCM)
