# 🐛 Troubleshooting

[← Back to README](../README.md)

---

## Can't connect to OpenClaw

1. Check if OpenClaw Gateway is running
2. Verify the URL in `OPENCLAW_URL`
3. For cloud: ensure WebSocket port is open
4. Check firewall settings

## Doraemon doesn't animate

1. Check console for errors (View → Developer Tools)
2. Verify sprites exist in `assets/dora-sprites/`
3. Try `npm run build` and restart

## Connection keeps dropping

- Check network stability
- For cloud: verify SSL certificate
- Doraemon auto-reconnects with backoff (1s → 30s max)

## Setup shows "Setup API not available"

1. Make sure preload script is built: `npm run build`
2. Check the main process console for preload path errors
3. Verify `out/preload/index.mjs` exists after build

## Window doesn't appear

1. Check if app is running in system tray
2. Right-click tray icon → Show/Hide
3. Try Reset Position from tray menu

## Offline mode issues

Doraemon works without OpenClaw! See [Offline Mode](OFFLINE-MODE.md) for details.

---

[← Back to README](../README.md)
