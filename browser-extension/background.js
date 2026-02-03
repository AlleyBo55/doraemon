const DORAEMON_WS_URL = 'ws://localhost:18790';
const HEARTBEAT_INTERVAL = 20000; // 20 seconds
const MONITORED_PATTERNS = [
  { pattern: /twitter\.com|x\.com/i, name: 'twitter' },
  { pattern: /outlook\.(office|live)\.com/i, name: 'outlook' },
  { pattern: /teams\.microsoft\.com/i, name: 'teams' },
  { pattern: /github\.com/i, name: 'github' },
  { pattern: /web\.whatsapp\.com/i, name: 'whatsapp' },
  { pattern: /slack\.com/i, name: 'slack' },
  { pattern: /discord\.com/i, name: 'discord' },
];

let ws = null;
let reconnectTimer = null;
let isConnected = false;
let heartbeatInterval = null;

function detectSource(url) {
  if (!url) return 'unknown';
  for (const { pattern, name } of MONITORED_PATTERNS) {
    if (pattern.test(url)) return name;
  }
  return 'unknown';
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
  if (ws && ws.readyState === WebSocket.CONNECTING) {
    return new Promise((resolve) => {
      ws.addEventListener('open', () => resolve(true), { once: true });
      ws.addEventListener('error', () => resolve(false), { once: true });
    });
  }
  
  return new Promise((resolve) => {
    try {
      ws = new WebSocket(DORAEMON_WS_URL);
      
      ws.onopen = () => {
        console.log('[Doraemon Extension] Connected to Doraemon');
        isConnected = true;
        if (reconnectTimer) {
          clearInterval(reconnectTimer);
          reconnectTimer = null;
        }
        startHeartbeat();
        resolve(true);
      };
      
      ws.onclose = () => {
        console.log('[Doraemon Extension] Disconnected from Doraemon');
        isConnected = false;
        stopHeartbeat();
        scheduleReconnect();
      };
      
      ws.onerror = () => {
        console.error('[Doraemon Extension] WebSocket error');
        isConnected = false;
        resolve(false);
      };
    } catch (err) {
      console.error('[Doraemon Extension] Connection failed:', err);
      scheduleReconnect();
      resolve(false);
    }
  });
}

function startHeartbeat() {
  stopHeartbeat();
  
  heartbeatInterval = setInterval(async () => {
    // Keep WebSocket alive
    if (ws && ws.readyState === WebSocket.OPEN) {
      console.log('[Doraemon Extension] Heartbeat ping');
    } else {
      await connect();
    }
    
    // Proactively poll all monitored tabs
    pollMonitoredTabs();
  }, HEARTBEAT_INTERVAL);
  
  // Initial poll
  pollMonitoredTabs();
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function pollMonitoredTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    
    for (const tab of tabs) {
      if (!tab.url) continue;
      
      const source = detectSource(tab.url);
      if (source === 'unknown') continue;
      
      // Send a ping to the content script to check for notifications
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'HEARTBEAT_CHECK' });
      } catch {
        // Content script not loaded or tab not ready - ignore
      }
    }
  } catch (err) {
    console.log('[Doraemon Extension] Poll error:', err.message);
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    console.log('[Doraemon Extension] Attempting reconnect...');
    connect();
  }, 5000);
}

function sendNotification(notification) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(notification));
    console.log('[Doraemon Extension] Sent:', notification.source, notification.title);
  } else {
    console.log('[Doraemon Extension] Not connected, notification dropped');
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Doraemon Extension BG] Received message:', message.type, message.title, message.body);
  
  if (message.type === 'NOTIFICATION') {
    // Ensure we're connected before sending
    connect().then((connected) => {
      if (connected) {
        const source = detectSource(sender.tab?.url || message.url);
        const notification = {
          source,
          title: message.title || 'Notification',
          body: message.body || '',
          icon: message.icon,
          url: sender.tab?.url || message.url,
        };
        console.log('[Doraemon Extension BG] Sending to WS:', notification);
        sendNotification(notification);
      } else {
        console.log('[Doraemon Extension BG] Not connected, notification dropped');
      }
      sendResponse({ success: connected });
    });
    return true; // Keep channel open for async response
  } else if (message.type === 'GET_STATUS') {
    connect().then((connected) => {
      sendResponse({ connected });
    });
    return true;
  }
  return true;
});

connect();
console.log('[Doraemon Extension] Background script loaded');
