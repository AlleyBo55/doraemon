const DORAEMON_WS_URL = 'ws://localhost:18790';
let ws = null;
let reconnectTimer = null;
let isConnected = false;

function detectSource(url) {
  if (!url) return 'unknown';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('outlook.office.com') || url.includes('outlook.live.com')) return 'outlook';
  if (url.includes('teams.microsoft.com')) return 'teams';
  if (url.includes('github.com')) return 'github';
  return 'unknown';
}

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  
  try {
    ws = new WebSocket(DORAEMON_WS_URL);
    
    ws.onopen = () => {
      console.log('[Doraemon Extension] Connected to Doraemon');
      isConnected = true;
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    };
    
    ws.onclose = () => {
      console.log('[Doraemon Extension] Disconnected from Doraemon');
      isConnected = false;
      scheduleReconnect();
    };
    
    ws.onerror = (err) => {
      console.error('[Doraemon Extension] WebSocket error:', err);
      isConnected = false;
    };
  } catch (err) {
    console.error('[Doraemon Extension] Connection failed:', err);
    scheduleReconnect();
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
  if (message.type === 'NOTIFICATION') {
    const source = detectSource(sender.tab?.url || message.url);
    sendNotification({
      source,
      title: message.title || 'Notification',
      body: message.body || '',
      icon: message.icon,
      url: sender.tab?.url || message.url,
    });
    sendResponse({ success: true });
  } else if (message.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected });
  }
  return true;
});

connect();
console.log('[Doraemon Extension] Background script loaded');
