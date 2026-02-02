import { createServer, IncomingMessage } from 'http';
import { BrowserWindow } from 'electron';
import { createHash } from 'crypto';
import { EventEmitter } from 'events';

export type WebNotification = {
  source: 'twitter' | 'outlook' | 'teams' | 'github' | 'unknown';
  title: string;
  body: string;
  icon?: string;
  url?: string;
  timestamp: number;
};

type NotificationCallback = (notification: WebNotification) => void;

const WEB_NOTIFICATION_PORT = 18790;

let server: ReturnType<typeof createServer> | null = null;
let clients: Set<WebSocketClient> = new Set();

class WebSocketClient extends EventEmitter {
  private socket: import('net').Socket;
  
  constructor(socket: import('net').Socket) {
    super();
    this.socket = socket;
    
    socket.on('data', (buffer) => {
      const frame = this.parseFrame(buffer);
      if (frame) {
        if (frame.opcode === 0x8) {
          this.close();
        } else if (frame.opcode === 0x1) {
          this.emit('message', frame.payload);
        }
      }
    });
    
    socket.on('close', () => this.emit('close'));
    socket.on('error', (err) => this.emit('error', err));
  }
  
  private parseFrame(buffer: Buffer): { opcode: number; payload: string } | null {
    if (buffer.length < 2) return null;
    
    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let payloadLength = buffer[1] & 0x7f;
    let offset = 2;
    
    if (payloadLength === 126) {
      payloadLength = buffer.readUInt16BE(2);
      offset = 4;
    } else if (payloadLength === 127) {
      payloadLength = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }
    
    const maskKey = masked ? buffer.slice(offset, offset + 4) : null;
    if (masked) offset += 4;
    
    const payload = buffer.slice(offset, offset + payloadLength);
    
    if (masked && maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4];
      }
    }
    
    return { opcode, payload: payload.toString('utf8') };
  }
  
  send(data: string) {
    const payload = Buffer.from(data, 'utf8');
    const frame = Buffer.alloc(2 + payload.length);
    frame[0] = 0x81;
    frame[1] = payload.length;
    payload.copy(frame, 2);
    this.socket.write(frame);
  }
  
  close() {
    this.socket.end();
  }
}

function handleUpgrade(req: IncomingMessage, socket: import('net').Socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.end();
    return null;
  }
  
  const acceptKey = createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );
  
  return new WebSocketClient(socket);
}

export function startWebNotificationServer(
  mainWindow: BrowserWindow,
  onNotification: NotificationCallback
) {
  if (server) return;

  server = createServer();
  
  server.on('upgrade', (req, socket) => {
    const client = handleUpgrade(req, socket as import('net').Socket);
    if (!client) return;
    
    clients.add(client);
    console.log('[WebNotificationServer] Browser extension connected');
    
    client.on('message', (data: string) => {
      try {
        const notification = JSON.parse(data) as WebNotification;
        notification.timestamp = Date.now();
        
        console.log('[WebNotificationServer] Received:', notification.source, notification.title, notification.body);
        
        onNotification(notification);
      } catch (err) {
        console.error('[WebNotificationServer] Parse error:', err);
      }
    });
    
    client.on('close', () => {
      clients.delete(client);
      console.log('[WebNotificationServer] Browser extension disconnected');
    });
    
    client.on('error', (err: Error) => {
      console.error('[WebNotificationServer] Client error:', err);
      clients.delete(client);
    });
  });
  
  server.listen(WEB_NOTIFICATION_PORT, () => {
    console.log(`[WebNotificationServer] Started on port ${WEB_NOTIFICATION_PORT}`);
  });
  
  server.on('error', (err) => {
    console.error('[WebNotificationServer] Server error:', err);
  });
}

export function stopWebNotificationServer() {
  if (server) {
    clients.forEach((client) => client.close());
    clients.clear();
    server.close();
    server = null;
    console.log('[WebNotificationServer] Stopped');
  }
}

export function getConnectionStatus(): { connected: number; port: number } {
  return {
    connected: clients.size,
    port: WEB_NOTIFICATION_PORT,
  };
}
