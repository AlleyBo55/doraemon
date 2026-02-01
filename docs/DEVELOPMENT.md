# 🛠️ Development

[← Back to README](../README.md)

---

## Tech Stack

- Electron 28
- Preact + Signals
- Tailwind CSS
- TypeScript
- electron-vite

## Project Structure

```
doraemon/
├── src/
│   ├── main/
│   │   ├── index.ts           # Electron main process
│   │   └── daemon/            # OpenClaw daemon management
│   │       ├── types.ts
│   │       ├── node-checker.ts
│   │       ├── openclaw-checker.ts
│   │       ├── port-checker.ts
│   │       ├── process-manager.ts
│   │       └── instructions.ts
│   ├── preload/index.ts       # IPC bridge
│   └── renderer/
│       ├── core/
│       │   ├── types/         # Branded types, emotion, connection
│       │   ├── constants/     # Timing, gateway, sprite
│       │   └── utils/         # Result type pattern
│       ├── services/          # Gateway, emotion, sprite-loader
│       ├── stores/            # Preact signals stores
│       ├── hooks/             # Custom hooks
│       ├── ui/
│       │   ├── primitives/    # Button, Spinner, Badge, Icon
│       │   ├── components/    # Setup, Mascot components
│       │   └── layouts/
│       ├── styles/
│       ├── app.tsx            # Main mascot app
│       └── setup-app.tsx      # Setup wizard
├── assets/                    # (empty - sprites moved to renderer/public)
└── package.json
```

## Scripts

```bash
npm run dev      # Development with hot reload
npm run build    # Production build
npm start        # Run production build
```

## Skip Setup Wizard

```bash
# Via flag
npm run dev -- --skip-setup

# Via environment variable
DORAEMON_SKIP_SETUP=1 npm run dev
```

## Building for Distribution

```bash
# Build the app
npm run build

# Package with electron-builder (add to package.json)
npm run package
```

## Controls

| Action | How |
|--------|-----|
| Open chat | Click on Doraemon |
| Send message | Type + Enter |
| Special animation | Double-click |
| Move | Drag and drop |
| Menu | Right-click tray icon |

### Tray Menu

- **Show/Hide** — Toggle visibility
- **Reset Position** — Move to default location
- **Quit** — Exit application

---

[← Back to README](../README.md)
