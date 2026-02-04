# Doraemon Learning System

[← Back to README](../README.md)

Doraemon learns from your activities in two modes: **Autonomous** (free) and **Supervised** (chat-based).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        LEARNING MODES                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  AUTONOMOUS (FREE - $0/day)              SUPERVISED (Chat-based)        │
│  ─────────────────────────               ──────────────────────         │
│  • Browser activity                      • You tell Doraemon what       │
│  • macOS app logs                          you read/watched             │
│  • Editor activity                       • Soul-based interpretation    │
│  • No LLM calls                          • ~100-200 tokens/feed         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Token Cost Breakdown

| Activity | Tokens | Cost/day |
|----------|--------|----------|
| Browser watching | 0 | $0 (local only) |
| App activity logs | 0 | $0 (local only) |
| Editor watching | 0 | $0 (local only) |
| Memory storage | 0 | $0 (SQLite) |
| **Autonomous Total** | **0** | **$0/day** |
| | | |
| Post generation (optional) | ~150 | ~$0.01/post |
| Embeddings (optional) | ~50 | ~$0.001/embed |
| Media feed (supervised) | ~150 | ~$0.01/feed |
| **With 8 posts/day** | **~1600** | **~$0.10/day** |

## Autonomous Learning

### What Gets Captured (FREE)

**Browser Extension** captures from whitelisted domains:
- X/Twitter - Posts, threads, notifications
- Reddit - Posts, comments
- YouTube - Video titles, channels
- GitHub - Repos, code, issues
- Hacker News - Stories, discussions
- News sites - TechCrunch, Verge, Wired, Ars Technica
- Dev sites - dev.to, Medium, Stack Overflow
- Manga - manhwaz.com, shinigami09.com
- Personal - moltbook.com

**macOS Activity** (requires Full Disk Access):
- App usage patterns
- Native notifications

**Editor Activity**:
- VS Code / Kiro file edits
- Languages used
- Coding sessions

### How It Works

```
Browser Extension (content.js)
        ↓
    WebSocket (port 18790)
        ↓
Web Notification Server
        ↓
    Browser Watcher
    (Domain whitelist + sanitization)
        ↓
    Memory System (SQLite)
        ↓
    Soul Interpreter (optional)
        ↓
    Moltbook Post (optional, costs tokens)
```

### Enable Autonomous Learning

```bash
# In .env
MEMORY_SYSTEM_ENABLED=1
```

Install the browser extension from `browser-extension/` folder.

## Supervised Learning (Media Feed)

For rich media experiences (manga, anime, videos), you feed Doraemon through chat instead of autonomous browsing.

### Why Supervised?

| Approach | Tokens/Chapter | Monthly (8/day) |
|----------|----------------|-----------------|
| Autonomous (vision) | 2,000-5,000 | $45-75 |
| **Supervised (chat)** | **100-200** | **$2-5** |

### Usage Examples

**Natural language in chat:**
```
You: "Just read One Piece chapter 1. Luffy met Shanks, 
     ate the devil fruit, Shanks lost his arm saving him."

Doraemon: *processes through soul lenses*
         "NAKAMA! This is what it's all about! 💙
          Sacrifice... I know that feeling too well."
```

**API calls:**
```typescript
// From renderer
window.electronAPI.mediaFeedManga('One Piece', 1, 'Luffy meets Shanks...');
window.electronAPI.mediaFeedAnime('Demon Slayer', 1, 'Tanjiro finds family...');
window.electronAPI.mediaFeedVideo('TypeScript Tips', 'Advanced generics...');
window.electronAPI.mediaFeedArticle('AI Safety', 'Constitutional AI...');
```

## Soul-Based Interpretation

Doraemon's personality colors every experience through "soul lenses":

| Trait | Triggers | Reaction |
|-------|----------|----------|
| Helper | help, save, protect, friend | Warm and inspired |
| Fear of mice | mouse, scary, horror | Anxious 🐭😱 |
| Dorayaki lover | food, eat, feast | Hungry and happy 🍩 |
| Time traveler | future, destiny, fate | Philosophical |
| Lost ears | loss, sacrifice | Melancholic but understanding |
| Friendship believer | nakama, crew, bond | Deeply moved 💙 |
| Dreamer | dream, goal, become king | Excited and supportive |

### Example Interpretation

```
Input: "Shanks sacrificed his arm to save Luffy"

Soul Lenses Activated:
- friendship_believer (0.95) → "NAKAMA!"
- lost_ears (0.85) → "Sacrifice... I understand"

Output:
- Emotion: "deeply moved and joyful"
- Reaction: "Sacrifice... I know that feeling. NAKAMA! 💙"
- Memory: "Read One Piece Ch.1. Felt: deeply moved. 
           Connection: I lost my ears to mice too."
```

## API Reference

### Autonomous Learning Stats

```typescript
// Get current stats
const stats = await window.electronAPI.autonomousGetStats();
// { browserEvents, appEvents, editorEvents, memoriesStored, tokensUsed, estimatedCost }

// Get active browsing sessions
const sessions = await window.electronAPI.autonomousGetSessions();

// Reset daily stats
await window.electronAPI.autonomousResetStats();
```

### Media Feed

```typescript
// Generic feed
await window.electronAPI.mediaFeed({
  type: 'manga',
  title: 'One Piece',
  chapter: 1,
  summary: 'Luffy meets Shanks...',
  highlights: ['Shanks loses arm', 'Straw hat given'],
});

// Quick feeds
await window.electronAPI.mediaFeedManga(title, chapter, summary, highlights?);
await window.electronAPI.mediaFeedAnime(title, episode, summary, highlights?);
await window.electronAPI.mediaFeedVideo(title, summary, url?, highlights?);
await window.electronAPI.mediaFeedArticle(title, summary, url?, highlights?);

// Auto-parse from chat
const parsed = await window.electronAPI.mediaParseChat(
  "I just read One Piece chapter 1, Luffy met Shanks..."
);
```

## Files

| File | Purpose |
|------|---------|
| `autonomous-learning.ts` | FREE observation system |
| `media-feed.ts` | Supervised learning via chat |
| `soul-interpreter.ts` | Personality-based interpretation |
| `browser-watcher.ts` | Domain whitelist + sanitization |
| `browser-extension/` | Chrome extension for capture |

## Related Docs

- [Memory System](./MEMORY-SYSTEM.md) - Storage and retrieval
- [Experience System](./EXPERIENCE-SYSTEM.md) - Post generation
- [Browser Extension](../browser-extension/README.md) - Extension setup

---

[← Back to README](../README.md)
