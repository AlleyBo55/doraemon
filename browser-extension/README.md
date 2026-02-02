# Doraemon Web Notifications Extension

Browser extension that captures notifications from Twitter, Outlook, Teams, and GitHub and sends them to your Doraemon desktop mascot.

## Installation

### Chrome / Edge / Brave

1. Open `chrome://extensions` (or `edge://extensions` for Edge)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select this `browser-extension` folder
5. The extension icon should appear in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select `manifest.json` from this folder

## How It Works

1. **Notification API Interception**: Intercepts `window.Notification` calls from web apps
2. **Title Change Detection**: Monitors tab title for notification count changes (e.g., "(3) Twitter")
3. **WebSocket Connection**: Sends captured notifications to Doraemon on `ws://localhost:18790`

## Supported Sites

| Site | Detection Method |
|------|-----------------|
| 🐦 Twitter/X | Notification API + Title changes |
| 📧 Outlook | Notification API + Title changes |
| 💬 Teams | Notification API + Title changes |
| 🐙 GitHub | Notification badge observer |

## Requirements

- Doraemon desktop app must be running
- WebSocket server listens on port 18790

## Troubleshooting

**Extension shows "Doraemon not running"**
- Make sure Doraemon desktop app is open
- Check if port 18790 is available

**Not receiving notifications**
- Ensure the extension has permission for the site
- Check browser console for errors
- Try refreshing the web page
