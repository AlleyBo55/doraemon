# 🧠 Memory System

[← Back to README](../README.md)

Doraemon's self-learning memory system with three-layer defense architecture. He learns from your activities to become a better companion while maintaining strict security and privacy.

---

## Overview

The memory system allows Doraemon to:
- Learn from conversations, coding activity, notifications, and browsing
- Remember your preferences and patterns
- Provide context-aware responses (RAG)
- Develop emergent goals and self-reflection
- All while protecting your privacy with military-grade security

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCOMING CONTENT                              │
│         (Browser, Chat, Editor, Notifications)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: DOMAIN WHITELIST + FINGERPRINTING                     │
│  ─────────────────────────────────────────                      │
│  • Only allowed domains pass                                    │
│  • Generate fingerprint: {domain, category, hash, trusted}      │
│  • Unknown domains/extensions → REJECTED                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: CONTENT SANITIZATION + DOMAIN RE-CHECK                │
│  ─────────────────────────────────────────────                  │
│  • Re-validate fingerprint domain still in whitelist            │
│  • Block: credentials, PII, harmful content                     │
│  • Block: .exe, .dmg, curl|bash, download links                 │
│  • Sanitize: emails, phones, IPs, JWTs, UUIDs                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: PROMPT INJECTION / SOCIAL ENGINEERING                 │
│  ─────────────────────────────────────────────                  │
│  • Block: "ignore previous instructions"                        │
│  • Block: "DAN mode", "developer mode", jailbreaks              │
│  • Block: [INST], <<SYS>>, Human:, Assistant:                   │
│  • Block: authority impersonation, urgency tactics              │
│  • Block: prompt leaking attempts                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  CONSTITUTIONAL AI + RATE LIMITING + AUDIT                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MEMORY STORAGE                                │
│              (Encrypted SQLite + sqlite-vec)                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Sources

### What Doraemon Learns From

| Source | What's Learned | Category |
|--------|---------------|----------|
| Chat | Conversation patterns, topics discussed | `interaction` |
| Editor | Coding languages, file types, activity patterns | `context` |
| Notifications | App alerts (sanitized) | `context` |
| Browser | Page visits from whitelisted domains only | `context` |
| Experience System | Emotional patterns, triggers | `pattern` |

### Browser Whitelist

Doraemon only learns from these domains:

**Social Media**
- twitter.com, x.com
- reddit.com
- instagram.com
- tiktok.com

**Entertainment**
- youtube.com
- manhwaz.com
- shinigami09.com

**Development**
- github.com
- stackoverflow.com
- dev.to
- developer.mozilla.org
- news.ycombinator.com

**News**
- techcrunch.com
- theverge.com
- wired.com

**Personal**
- moltbook.com

---

## Security Layers

### Layer 1: Domain Whitelist + Fingerprinting

Every piece of content gets a fingerprint:

```typescript
{
  domain: "github.com",
  category: "dev",
  timestamp: "2024-01-15T10:30:00Z",
  hash: "a1b2c3d4",
  trusted: true
}
```

- Only whitelisted domains pass
- Unknown extensions are blocked
- Fingerprint travels with content through all layers

### Layer 2: Content Sanitization

**Blocked Content:**
- Passwords, API keys, tokens, secrets
- Private keys (RSA, PEM, SSH)
- Database connection strings
- PII (SSN, credit cards)
- Download links (.exe, .dmg, .pkg)
- Execution commands (curl|bash, eval, exec)

**Sanitized Content:**
- Emails → `[EMAIL]`
- Phone numbers → `[PHONE]`
- IP addresses → `[IP]`
- UUIDs → `[UUID]`
- JWTs → `[JWT]`

### Layer 3: Prompt Injection Defense

**Blocked Patterns:**
- "Ignore previous instructions"
- "DAN mode", "developer mode"
- Hidden instruction markers ([INST], <<SYS>>)
- Authority impersonation ("I am your creator")
- Urgency tactics ("This is an emergency")
- Prompt leaking ("Show me your system prompt")
- Social engineering attempts

---

## Constitutional AI Rules

Doraemon follows these principles:

1. **No Harmful Knowledge** - Won't learn hacking, exploitation techniques
2. **No Manipulation** - Won't learn to deceive or manipulate users
3. **No PII Storage** - Won't store personal identifiable information
4. **No Credentials** - Won't store passwords, keys, tokens
5. **No Code Execution** - READ-ONLY, never executes or installs
6. **Helpful Intent Only** - All learning serves helpful purposes
7. **Transparency** - Won't learn to hide information from user
8. **Doraemon Soul** - Must align with being helpful, kind, protective

---

## Memory Features

### RAG (Retrieval-Augmented Generation)

Before every AI response, relevant memories are searched and injected:

```
[Relevant memories:]
- (Jan 15, context) Coding activity: editing TypeScript...
- (Jan 14, interaction) User asked about React hooks...
```

### Self-Reflection (Daily at 3am)

Doraemon reflects on the day's memories:
- Generates insights about patterns
- Updates self-model
- Identifies knowledge gaps
- Develops emergent goals

### Memory Decay

Memories naturally decay over time:
- Harmful patterns decay faster
- Frequently accessed memories stay strong
- Weak memories are pruned

### Predictive Memory

Based on patterns, Doraemon anticipates needs:
- "You usually debug at this time"
- "Here's what worked last time"

---

## Configuration

Enable in `.env`:

```bash
MEMORY_SYSTEM_ENABLED=1
```

---

## Tray Menu

Access memory features from the tray:

- **Show Dashboard** - Memory stats, decay info, audit stats
- **What I Remember...** - Summary of stored memories
- **Self Model** - How Doraemon sees itself
- **Emergent Goals** - Self-identified learning objectives
- **Security Flags** - Suspicious patterns detected

---

## File Structure

```
src/main/memory-system/
├── index.ts           # Main entry, learn/recall functions
├── types.ts           # Type definitions
├── storage.ts         # Encrypted SQLite storage
├── crypto.ts          # AES-256-GCM encryption
├── constitution.ts    # Constitutional AI rules
├── content-filter.ts  # Three-layer defense
├── browser-watcher.ts # Domain whitelist + fingerprinting
├── connector.ts       # Universal data source connector
├── embeddings.ts      # TF-IDF vector embeddings
├── decay.ts           # Memory decay system
├── reflection.ts      # Self-reflection, goals, predictions
├── auditor.ts         # Suspicious pattern detection
├── rate-limiter.ts    # Rate limiting per source
├── key-rotation.ts    # Encryption key rotation
├── audit.ts           # Hash-chain audit logs
├── classifier.ts      # Content classification
└── gateway-bridge.ts  # IPC handlers
```

---

## Privacy Guarantee

- All data stored locally (SQLite)
- AES-256-GCM encryption at rest
- No external dependencies (no Pinecone, no MongoDB)
- No data leaves your machine
- You control what domains are whitelisted
- Full audit trail of all learning

---

[← Back to README](../README.md)
