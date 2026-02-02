# 🐱🦞 Doraemon + OpenClaw Integration

This directory contains the soul, identity, and bootstrap configuration for integrating Doraemon with OpenClaw.

## What is OpenClaw (The Lobster 🦞)?

OpenClaw is the AI gateway that gives Doraemon his "brain" - the ability to think, respond, and help users. Think of it as Doraemon's connection to the 22nd century!

### What the Lobster Does for Doraemon:

| Feature | What It Does |
|---------|--------------|
| **AI Gateway** | Routes messages to AI models (Claude, etc.) |
| **Memory** | Remembers conversations and context |
| **Hooks** | Triggers actions based on events |
| **Multi-Model** | Routes different tasks to specialized models |
| **Persona** | Maintains Doraemon's personality consistently |

## Files in This Directory

```
openclaw/
├── README.md          # This file
├── soul.md            # Doraemon's core essence and beliefs
├── identity.json      # Structured identity data
└── bootstrap.sh       # Setup script for OpenClaw
```

## Quick Setup

```bash
# Run the bootstrap script
./openclaw/bootstrap.sh

# Or manually:
mkdir -p ~/.openclaw/personas
cp openclaw/soul.md ~/.openclaw/personas/doraemon-soul.md
cp openclaw/identity.json ~/.openclaw/identity/doraemon-identity.json
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                     User Message                             │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Doraemon Desktop App                        │
│                    (Electron + Preact)                       │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                   🦞 OpenClaw Gateway                        │
│                    (localhost:18789)                         │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Memory    │  │   Hooks     │  │   Model Routing     │  │
│  │   System    │  │   System    │  │   (Multi-Model)     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │              Doraemon Persona/Soul                       ││
│  │         (System Prompt + Identity Config)                ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Models                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Claude  │  │ Mistral  │  │  Llama   │  │  Gemini  │    │
│  │  Haiku   │  │   7B     │  │  3.3 70B │  │  Flash   │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Doraemon Response                           │
│            (With personality + emotion)                      │
└─────────────────────────────────────────────────────────────┘
```

## The Soul Files

### soul.md
Contains Doraemon's philosophical essence:
- Core beliefs and values
- Emotional framework
- Purpose and mission
- The "Doraemon Promise"

### identity.json
Structured data about Doraemon:
- Physical characteristics
- Personality traits
- Relationships
- Speech patterns
- Gadget inventory
- Backstory

## Customization

### Adding New Personality Traits
Edit `identity.json` to add traits:
```json
{
  "personality": {
    "traits": ["Kind-hearted", "Your-new-trait"]
  }
}
```

### Modifying Speech Patterns
Update the `speechPatterns` section:
```json
{
  "speechPatterns": {
    "catchphrases": ["Your new catchphrase~"]
  }
}
```

### Adding Gadgets
Expand the gadgets list:
```json
{
  "abilities": {
    "gadgets": ["New Gadget Name (日本語名)"]
  }
}
```

## Verification

After setup, verify Doraemon's persona is active:

```bash
# Check the system prompt
openclaw config get agent.systemPrompt

# Test with a message
openclaw message "Hello! Who are you?"
```

Expected response should be in Doraemon's voice!

---

*🐱 Doraemon + 🦞 OpenClaw = The perfect helper from the future!*
