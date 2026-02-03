# 🔐 Full Disk Access Setup

[← Back to README](../README.md)

---

Doraemon needs **Full Disk Access** permission to read native macOS notifications from apps like WhatsApp, Slack, Discord, and Messages.

## Why is this needed?

macOS stores notifications in a protected SQLite database. To read notifications from native apps (not just web browsers), Doraemon needs permission to access this database.

**Without Full Disk Access:**
- ✅ Web notifications work (via browser extension)
- ❌ Native app notifications don't work

**With Full Disk Access:**
- ✅ Web notifications work
- ✅ Native app notifications work (WhatsApp, Slack, Discord, Messages, etc.)

---

## Setup Instructions

### For Development (`npm run dev`) — Recommended

When running in development mode, grant Full Disk Access to your **Terminal or IDE** instead of Electron. The child process (Electron) will inherit the permission from its parent.

**Option A: Grant to Terminal (recommended)**

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click the **🔒 lock icon** and enter your password
3. Click the **+** button
4. Navigate to **Applications** → **Utilities**
5. Select **Terminal.app** (or **iTerm.app** if you use iTerm)
6. Make sure the checkbox is **enabled** ✅
7. Restart Terminal and run `npm run dev`

**Option B: Grant to IDE**

If you run `npm run dev` from your IDE's integrated terminal:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click **+** and add your IDE:
   - **VS Code**: `/Applications/Visual Studio Code.app`
   - **Cursor**: `/Applications/Cursor.app`
   - **Kiro**: `/Applications/Kiro.app`
3. Make sure the checkbox is **enabled** ✅
4. Restart the IDE and run `npm run dev`

> 💡 **Why this works**: macOS Full Disk Access is inherited by child processes. When Terminal/IDE has the permission, any app launched from it (including Electron) gets the same access.

### For Production (Built App)

When running the built/packaged app, grant Full Disk Access directly to **Doraemon.app**:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click the **🔒 lock icon** and enter your password
3. Click the **+** button
4. Navigate to **Applications** folder (or wherever you installed Doraemon)
5. Select **Doraemon.app** and click **Open**
6. Make sure the checkbox is **enabled** ✅
7. Restart Doraemon

> ⚠️ **Note**: If you rebuild the app, you may need to remove and re-add it to Full Disk Access since the binary signature changes.

---

## Verifying It Works

After granting permission:

1. Restart Doraemon
2. The setup screen should show **Native Notifications: Enabled** ✅
3. Send yourself a WhatsApp message from another device
4. Doraemon should display a beautiful notification bubble!

---

## Troubleshooting

### "Permission needed" still showing

- Make sure you added the correct app (Electron.app for dev, Doraemon.app for production)
- Make sure the checkbox is **enabled** (not just added to the list)
- Try removing and re-adding the app
- Restart your Mac if changes don't take effect

### Can't find Electron.app

Use Finder:
1. Open Finder
2. Press **Cmd+Shift+G**
3. Paste the path to your project's `node_modules/electron/dist/`
4. Drag **Electron.app** into the Full Disk Access list

### Notifications still not working

Check the terminal output for:
```
[NotificationWatcher] Full Disk Access granted - watching native notifications
```

If you see this but notifications still don't appear:
- The notification database might be empty (no recent notifications)
- Try sending a test notification to yourself

---

## Supported Apps

| App | Status |
|-----|--------|
| 💬 WhatsApp | ✅ Supported |
| 💬 Messages | ✅ Supported |
| 📧 Mail | ✅ Supported |
| 💬 Teams | ✅ Supported |
| 📧 Outlook | ✅ Supported |
| 💼 Slack | ✅ Supported |
| 🎮 Discord | ✅ Supported |
| ✈️ Telegram | ✅ Supported |
| 📞 FaceTime | ✅ Supported |
| 📝 Reminders | ✅ Supported |
| 📒 Notes | ✅ Supported |
| 📅 Calendar | ✅ Supported |

---

## Privacy Note

Doraemon only reads notification metadata (app name, timestamp) from the macOS notification database. It does **not** read the actual notification content (message text, sender info) due to how macOS stores this data.

For full notification content, use the [browser extension](../browser-extension/README.md) which can capture web notifications with their full text.

---

[← Back to README](../README.md)
