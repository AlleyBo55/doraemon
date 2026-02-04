# Doraemon System Architecture

[← Back to README](../README.md)

## Single Source of Truth

**Soul Definition**: `openclaw/soul.md` - ALL personality, values, and behavior come from this file.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DORAEMON ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐    │
│  │   SOUL.MD        │────▶│   SOUL LOADER    │────▶│  ALL SYSTEMS     │    │
│  │ (Single Source)  │     │  (main process)  │     │                  │    │
│  └──────────────────┘     └──────────────────┘     └──────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        LEARNING SOURCES (FREE)                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  Browser Extension ──┐                                               │   │
│  │  Editor Watcher ─────┼──▶ SQLite Memory ──▶ Semantic Search         │   │
│  │  App Activity ───────┘                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     SUPERVISED LEARNING (CHAT)                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │  User Chat ──▶ Media Feed ──▶ Soul Interpreter ──▶ Memory + Post    │   │
│  │                                                                      │   │
│  │  "I read One Piece ch 1100, Luffy used Gear 5..."                   │   │
│  │       ↓                                                              │   │
│  │  Doraemon interprets through his personality lenses                 │   │
│  │       ↓                                                              │   │
│  │  Stores memory + optionally posts to Moltbook                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      POST GENERATION FLOW                            │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  Heartbeat Timer (every 50 min)                                     │   │
│  │       ↓                                                              │   │
│  │  Collect Experiences + Memories                                     │   │
│  │       ↓                                                              │   │
│  │  ┌─────────────────────────────────────────┐                        │   │
│  │  │ LLM_POSTS_ENABLED=1?                    │                        │   │
│  │  │   YES → OpenClaw Gateway (Haiku 3.5)    │ ← Uses soul.md         │   │
│  │  │   NO  → Template-based (FREE)           │                        │   │
│  │  └─────────────────────────────────────────┘                        │   │
│  │       ↓                                                              │   │
│  │  Post Queue (JSONL file)                                            │   │
│  │       ↓                                                              │   │
│  │  Docker Sidekick → Moltbook API                                     │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      MEMORY SYNC TO SIDEKICK                         │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                      │   │
│  │  Doraemon (Electron)              Sidekick (Docker)                 │   │
│  │  ┌─────────────────┐              ┌─────────────────┐               │   │
│  │  │ Memory System   │              │                 │               │   │
│  │  │      ↓          │              │ Reads context   │               │   │
│  │  │ Export every    │─────────────▶│ Injects into    │               │   │
│  │  │ 30 min          │  memory-     │ LLM prompts for │               │   │
│  │  │                 │  context.json│ comments        │               │   │
│  │  └─────────────────┘              └─────────────────┘               │   │
│  │                                                                      │   │
│  │  Contents: soul summary, recent experiences, emotional state,       │   │
│  │            top memories, fears, loves, values                       │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Where LLM is Used

| Component | LLM Used? | Model | Cost |
|-----------|-----------|-------|------|
| Browser watching | ❌ No | - | $0 |
| Editor watching | ❌ No | - | $0 |
| Memory storage | ❌ No | - | $0 |
| Soul interpretation | ❌ No | - | $0 |
| Template posts | ❌ No | - | $0 |
| **LLM Posts** | ✅ Yes | Haiku 3.5 | ~$0.01/post |
| **Embeddings** | ✅ Yes | text-embedding | ~$0.001/embed |
| **Chat (OpenClaw)** | ✅ Yes | Via Gateway | Varies |

## How to Feed Media to Doraemon

### Method 1: Chat (Supervised Learning)

Just tell Doraemon in chat what you read/watched:

```
User: "I just read Solo Leveling chapter 180, Sung Jin-Woo became the Shadow Monarch!"

Doraemon: *interprets through soul lenses*
  - friendship_believer: "The bonds he formed..."
  - dreamer: "Achieving his goal!"
  - protector: "He can protect everyone now!"
  
→ Stores to memory
→ May generate Moltbook post if post-worthy
```

### Method 2: URL Reading

Enable in `.env`:
```bash
URL_READER_ENABLED=1
```

Then use the API:
```typescript
// Read any URL (manga, article, video)
window.api.urlRead('https://manhwaz.com/manga/solo-leveling/chapter-180');

// Read specific manga chapter
window.api.urlReadManga('manhwaz.com', 'solo-leveling', 180);

// Check if enabled
const enabled = await window.api.urlIsEnabled();
```

Supported sites:
- manhwaz.com (manga)
- shinigami09.com (manga)
- YouTube (video metadata)
- Any article site (generic parser)

### Method 3: IPC API (Programmatic)

```typescript
// From renderer
window.api.mediaFeedManga('Solo Leveling', 180, 'Jin-Woo became Shadow Monarch', ['power up']);
window.api.mediaFeedVideo('TypeScript Tips', 'Advanced generics', 'https://youtube.com/...');
window.api.mediaFeedArticle('AI Safety', 'Constitutional AI approach', 'https://anthropic.com/...');
```

## Environment Variables

```bash
# .env
MEMORY_SYSTEM_ENABLED=1      # Enable memory storage
EXPERIENCE_SYSTEM_ENABLED=1  # Enable experience processing
LLM_POSTS_ENABLED=1          # Enable LLM-generated posts (costs tokens)
URL_READER_ENABLED=0         # Enable URL reading for manga/articles
```

## Execution Flow

### Automatic (No User Action Needed)

1. **Browser Extension** → Captures whitelisted sites → Stores to memory
2. **Editor Watcher** → Tracks coding activity → Stores to memory
3. **Heartbeat Timer** → Every 50 min → Generates post → Queues for Moltbook
4. **Docker Sidekick** → Reads queue → Posts to Moltbook

### Manual (User Triggers)

1. **Chat with Doraemon** → Share media experiences → Interpreted + stored
2. **Dashboard** → View memories, stats, posts
3. **Gateway Dashboard** → Direct OpenClaw interaction

## Cost Summary

| Usage Pattern | Daily Cost |
|--------------|------------|
| Observation only (no LLM posts) | $0 |
| 8 LLM posts/day | ~$0.10 |
| Heavy chat usage | ~$0.50-2.00 |
| Autonomous manga reading (vision) | ~$5-15 (NOT RECOMMENDED) |
