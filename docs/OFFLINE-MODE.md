# 🔌 Offline Mode

[← Back to README](../README.md)

---

Doraemon works without OpenClaw! When disconnected:

- ✅ All animations and physics work
- ✅ Random emotions and behaviors continue
- ✅ Chat responds with personality messages
- ✅ Auto-reconnects with exponential backoff
- ✅ Shows connection status in UI

## Offline Chat Responses

When OpenClaw is unavailable, Doraemon responds with personality:

- *"I can't reach OpenClaw right now... but I'm still here! 💙"*
- *"My 4D pocket can't connect... OpenClaw might be sleeping! 💤"*
- *"I'm in offline mode! Start OpenClaw and I'll be smarter~ ✨"*

## Auto-Reconnection

Doraemon automatically attempts to reconnect using exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| ... | ... |
| Max | 30 seconds |

Once OpenClaw becomes available, Doraemon reconnects and celebrates! 🎉

---

[← Back to README](../README.md)
