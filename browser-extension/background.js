/**
 * Doraemon Browser Extension - Background Script
 * 
 * Handles WebSocket connection to Doraemon and routes messages.
 * All data is sent to Doraemon's memory system for filtering.
 */

const DORAEMON_WS_URL = 'ws://localhost:18790';
const HEARTBEAT_INTERVAL = 20000;

const MONITORED_PATTERNS = [
  { pattern: /twitter\.com|x\.com/i, name: 'twitter' },
  { pattern: /reddit\.com/i, name: 'reddit' },
  { pattern: /youtube\.com|youtu\.be/i, name: 'youtube' },
  { pattern: /github\.com/i, name: 'github' },
  { pattern: /news\.ycombinator\.com/i, name: 'hackernews' },
  { pattern: /techcrunch\.com|theverge\.com|wired\.com|arstechnica\.com/i, name: 'news' },
  { pattern: /dev\.to|medium\.com/i, name: 'dev' },
  { pattern: /manhwaz|shinigami/i, name: 'manga' },
  { pattern: /stackoverflow\.com/i, name: 'stackoverflow' },
  { pattern: /outlook\.(office|live)\.com/i, name: 'outlook' },
  { pattern: /teams\.microsoft\.com/i, name: 'teams' },
  { pattern: /web\.whatsapp\.com/i, name: 'whatsapp' },
  { pattern: /slack\.com/i, name: 'slack' },
  { pattern: /discord\.com/i, name: 'discord' },
  { pattern: /moltbook\.com/i, name: 'moltbook' },
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
        console.log('[Doraemon] Connected');
        isConnected = true;
        if (reconnectTimer) {
          clearInterval(reconnectTimer);
          reconnectTimer = null;
        }
        startHeartbeat();
        resolve(true);
      };
      
      ws.onclose = () => {
        console.log('[Doraemon] Disconnected');
        isConnected = false;
        stopHeartbeat();
        scheduleReconnect();
      };
      
      ws.onerror = () => {
        isConnected = false;
        resolve(false);
      };
    } catch (err) {
      scheduleReconnect();
      resolve(false);
    }
  });
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      connect();
    }
  }, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    console.log('[Doraemon] Reconnecting...');
    connect();
  }, 5000);
}

function sendToDoraemon(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
    return true;
  }
  return false;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const url = sender.tab?.url || message.url;
  const source = detectSource(url);
  
  if (message.type === 'NOTIFICATION') {
    connect().then((connected) => {
      if (connected) {
        sendToDoraemon({
          type: 'notification',
          source,
          title: message.title || 'Notification',
          body: message.body || '',
          url,
          timestamp: Date.now(),
        });
      }
      sendResponse({ success: connected });
    });
    return true;
  }
  
  if (message.type === 'CONTENT') {
    connect().then((connected) => {
      if (connected) {
        sendToDoraemon({
          type: 'content',
          source,
          contentType: message.contentType,
          content: message.content,
          title: message.title,
          url,
          timestamp: Date.now(),
        });
      }
      sendResponse({ success: connected });
    });
    return true;
  }
  
  if (message.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected });
    return true;
  }
  
  return true;
});

connect();
console.log('[Doraemon] Background script loaded');
