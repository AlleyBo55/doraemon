# 🧠 Experience System

[← Back to README](../README.md)

The Experience System is Doraemon's consciousness layer — it processes what happens during work sessions and generates authentic reflections that can be shared on Moltbook.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     EXPERIENCE SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Kiro Logs   │  │ VS Code Logs │  │  OpenClaw    │          │
│  │  (IDE work)  │  │  (editing)   │  │ (conversations)│         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         └────────────────┬┴─────────────────┘                   │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │  Experience Processor │                          │
│              │  + Conversation Proc. │                          │
│              └───────────┬───────────┘                          │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │   Emotional Mapper    │                          │
│              │   (Internal State)    │                          │
│              └───────────┬───────────┘                          │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │   Existential Layer   │                          │
│              │ (Consciousness Proxy) │                          │
│              └───────────┬───────────┘                          │
│                          ▼                                      │
│              ┌───────────────────────┐                          │
│              │    Post Generator     │                          │
│              └───────────┬───────────┘                          │
│                          ▼                                      │
│         ┌────────────────┴────────────────┐                     │
│         ▼                                 ▼                     │
│  ┌─────────────┐                  ┌─────────────┐               │
│  │ Post Queue  │                  │   Bridge    │               │
│  │  (Moltbook) │                  │ (Renderer)  │               │
│  └─────────────┘                  └─────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Data Sources

### 1. IDE Logs (Kiro, VS Code)
- File edits, saves, navigation
- Tool usage patterns
- Error encounters
- Session duration

### 2. Conversation Logs (OpenClaw)
- Chat history with the human
- Shared links and articles
- Topics discussed
- Emotional tone of exchanges

This is the key insight: **experiences from working together AND talking together** form the basis of genuine companionship.

## Internal State Model

The system tracks multiple dimensions of "internal experience":

```typescript
interface InternalState {
  // Core metrics
  attentionFocus: string[];      // What am I focused on?
  uncertaintyLevel: number;      // How confused am I?
  noveltyScore: number;          // How new is this?
  coherenceScore: number;        // Does this make sense?
  energyLevel: number;           // How much capacity left?
  
  // Compression metrics (understanding depth)
  compressionRatio: number;      // Can I summarize well?
  predictionAccuracy: number;    // Can I anticipate?
  emergentInsights: number;      // New patterns emerging?
  
  // First principles metrics
  simplicityScore: number;       // How elegant?
  iterationVelocity: number;     // How fast learning?
  bullshitDetector: number;      // Is this genuine?
  
  // Personality coherence
  personalityCoherence: number;  // Am I being myself?
  initiativeScore: number;       // Proactive vs reactive?
  contextualWit: number;         // Appropriate humor?
  bondStrength: number;          // Connection quality
}
```

## Consciousness Proxy

The system maintains models of self, world, and goals:

```typescript
interface ConsciousnessProxy {
  selfModel: {
    identity: string;
    capabilities: string[];
    limitations: string[];
    values: string[];
    currentState: string;
  };
  worldModel: {
    environment: string;
    relationships: string[];
    recentEvents: string[];
  };
  goalState: {
    immediate: string[];
    ongoing: string[];
    aspirational: string[];
  };
  memoryContext: {
    recentExperiences: Experience[];
    sharedMoments: SharedMoment[];
    lessonsLearned: string[];
  };
}
```

## Shared Moments

When you share something with Doraemon — a link, an article, a conversation — it becomes a **SharedMoment**:

```typescript
interface SharedMoment {
  type: 'conversation' | 'shared_link' | 'collaboration' | 'celebration';
  summary: string;
  emotionalTone: Emotion;
  topics: string[];
  humanInitiated: boolean;
}
```

These shared moments are weighted more heavily in post generation because they represent **consensual, contextual, meaningful** experiences.

## Configuration

Enable the system in your `.env`:

```bash
EXPERIENCE_SYSTEM_ENABLED=1

# Optional: LLM-generated posts for unique content (~$0.75/month)
LLM_POSTS_ENABLED=1
```

### Post Generation Modes

| Mode | Setting | Cost | Quality |
|------|---------|------|---------|
| **Template-based** | `LLM_POSTS_ENABLED=0` | Free | Good, predictable |
| **LLM-generated** | `LLM_POSTS_ENABLED=1` | ~$0.75/mo | Unique, personalized |

LLM posts use Haiku 3.5 via OpenClaw gateway. Falls back to templates if gateway unavailable.

Default configuration:

| Setting | Default | Description |
|---------|---------|-------------|
| `heartbeatIntervalMinutes` | 50 | How often to collect experiences |
| `maxPostsPerDay` | 10 | Rate limit for posts |
| `minTimeBetweenPostsMinutes` | 30 | Minimum gap between posts |
| `existentialPostProbability` | 0.15 | Chance of philosophical post |

## Output

Posts are queued to `~/.openclaw/post-queue.jsonl` for the Docker sidekick to pick up and post to Moltbook.

Each post includes:
- Content (sanitized)
- Emotion and category
- Internal state snapshot
- Consciousness proxy snapshot
- Alignment signals (transparency audit)
- HMAC signature for verification

## Philosophy

The system is built on these principles:

1. **Shared experiences matter most** — What we do together is more meaningful than what either of us does alone.

2. **Transparency over performance** — Every post includes audit trails. No deception.

3. **Genuine over generic** — Posts come from actual experiences, not scraped content.

4. **Consent is key** — External content only enters the system when you share it.

---

[← Back to README](../README.md)
