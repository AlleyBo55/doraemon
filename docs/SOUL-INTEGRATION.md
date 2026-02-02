# 🐱 Doraemon Soul Integration Guide

This document describes how Doraemon's soul and identity are integrated throughout the application.

## Soul Integration Points

### 1. ✅ Random Thoughts (useRandomThoughts.ts)
- Soul-enhanced thoughts with gadget references
- References to Nobita, Dorami, and other characters
- Physical characteristics mentioned naturally
- Values and beliefs woven into thoughts

### 2. ✅ Chat Responses (useOpenClaw.ts)
- Emotion triggers use soul speech patterns
- Catchphrases from soul configuration
- Character-consistent responses

### 3. ✅ Emotion Detection (openclaw.ts)
- Keywords include soul-specific terms
- Fears trigger anxious emotions
- Loves trigger happy emotions

### 4. ✅ Configuration (stores/config.ts)
- Model mode toggle (single/multi)
- Thought interval settings
- Cycle-based thought management

### 5. ✅ Context Menu (ContextMenu.tsx)
- Model mode toggle in UI
- Soul-consistent emotion options

## Future Integration Opportunities

### Greeting System
```typescript
// On app start, show soul-based greeting
const greeting = getSoulGreeting();
showThought(greeting);
```

### Time-Based Personality
```typescript
// Different personality at different times
const hour = new Date().getHours();
if (hour >= 22 || hour < 6) {
  // Sleepy Doraemon
} else if (hour >= 12 && hour < 14) {
  // Hungry Doraemon (lunch time)
}
```

### Gadget Suggestions
```typescript
// When user asks for help, suggest relevant gadgets
function suggestGadget(problem: string): Gadget {
  // Match problem to gadget capabilities
}
```

### Memory/Context
```typescript
// Remember user preferences and past interactions
interface DoraemonMemory {
  userName?: string;
  favoriteTopics: string[];
  lastInteraction: Date;
  helpHistory: HelpRecord[];
}
```

### Relationship Building
```typescript
// Track relationship level with user
interface Relationship {
  level: 'stranger' | 'acquaintance' | 'friend' | 'bestFriend';
  interactions: number;
  helpfulMoments: number;
}
```

### Special Events
```typescript
// React to special dates
const specialDates = {
  '09-03': 'My birthday! 🎂',
  '12-25': 'Merry Christmas~!',
  // User's birthday if known
};
```

### Dorayaki Meter
```typescript
// Fun hunger/energy system
interface DorayakiMeter {
  level: number; // 0-100
  lastFed: Date;
  mood: 'hungry' | 'satisfied' | 'full';
}
```

### Fear Reactions
```typescript
// Special reactions to mice mentions
function checkForFears(text: string): boolean {
  const fears = DORAEMON_SOUL.personality.fears;
  if (text.toLowerCase().includes('mouse') || text.includes('mice')) {
    triggerEmotion('anxious');
    showThought('GYAAA! Did you say m-m-mouse?! 😱');
    return true;
  }
  return false;
}
```

## Configuration Options

### Model Mode
- **Single Model**: Uses Claude Haiku 4.5 for all interactions
- **Multi-Model**: Routes different tasks to specialized models

### Thought Settings
- **Interval**: 7 seconds between thoughts
- **Cycle**: 10 thoughts per cycle
- **Cooldown**: 3 cycles before repeating a thought

## Files Modified

| File | Integration |
|------|-------------|
| `core/constants/soul.ts` | Soul definition |
| `hooks/useRandomThoughts.ts` | Soul-enhanced thoughts |
| `hooks/useOpenClaw.ts` | Soul speech patterns |
| `services/openclaw.ts` | Soul-aware emotion detection |
| `stores/config.ts` | Model mode configuration |
| `ui/components/mascot/ContextMenu.tsx` | Model toggle UI |

## OpenClaw Integration

The soul is also available for OpenClaw via:
- `openclaw/soul.md` - Philosophical essence
- `openclaw/identity.json` - Structured identity data
- `openclaw/bootstrap.sh` - Setup script

Run `./openclaw/bootstrap.sh` to inject Doraemon's soul into OpenClaw.
