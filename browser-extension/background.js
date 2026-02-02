const DORAEMON_WS_URL = 'ws://localhost:18790';
let ws = null;
let reconnectTimer = null;
let isConnected = false;
let keepAliveInterval = null;

function detectSource(url) {
  if (!url) return 'unknown';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('outlook.office.com') || url.includes('outlook.live.com')) return 'outlook';
  if (url.includes('teams.microsoft.com')) return 'teams';
  if (url.includes('github.com')) return 'github';
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
        // Start keep-alive to prevent service worker from sleeping
        startKeepAlive();
        resolve(true);
      };
      
      ws.onclose = () => {
        console.log('[Doraemon Extension] Disconnected from Doraemon');
        isConnected = false;
        stopKeepAlive();
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

function startKeepAlive() {
  stopKeepAlive();
  // Send a ping every 20 seconds to keep service worker alive
  keepAliveInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Just check connection is still alive
      console.log('[Doraemon Extension] Keep-alive ping');
    } else {
      connect();
    }
  }, 20000);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
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
