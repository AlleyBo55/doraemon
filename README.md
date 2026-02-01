# Doraemon Desktop

AI-powered desktop mascot companion with emotions, chat, and real-time AI integration.

## Features

- Draggable desktop mascot with physics
- Emotion system with visual indicators
- WebSocket connection to OpenClaw gateway
- Setup wizard with pre-flight checks
- Idle detection and emotion transitions

## Tech Stack

- Electron 28
- Preact + Signals
- Tailwind CSS
- TypeScript
- electron-vite

## Project Structure

```
src/
├── main/
│   ├── index.ts              # Electron main process
│   └── daemon/               # OpenClaw daemon management
│       ├── types.ts          # Type definitions
│       ├── node-checker.ts   # Node.js version check
│       ├── openclaw-checker.ts
│       ├── port-checker.ts   # Port availability check
│       ├── process-manager.ts # Install/start daemon
│       └── instructions.ts   # Platform-specific instructions
├── preload/
│   └── index.ts              # IPC bridge
└── renderer/
    ├── core/
    │   ├── types/            # Branded types, emotion, connection
    │   ├── constants/        # Timing, gateway, sprite constants
    │   └── utils/            # Result type pattern
    ├── services/             # Gateway, emotion, sprite-loader
    ├── stores/               # Preact signals stores
    ├── hooks/                # Custom hooks
    ├── ui/
    │   ├── primitives/       # Button, Spinner, Badge, Icon
    │   ├── components/       # Setup, Mascot components
    │   └── layouts/          # SetupLayout, MascotLayout
    ├── styles/               # Tailwind globals
    ├── app.tsx               # Main mascot app
    └── setup-app.tsx         # Setup wizard app
```

## Requirements

- Node.js 22 LTS
- OpenClaw installed globally (`npm i -g openclaw`)

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Start production build
npm start
```

## Skip Setup

To skip the setup wizard:

```bash
# Via flag
npm run dev -- --skip-setup

# Via environment variable
DORAEMON_SKIP_SETUP=1 npm run dev
```

## License

MIT
