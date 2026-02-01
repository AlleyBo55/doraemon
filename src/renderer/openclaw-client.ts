/**
 * OpenClaw WebSocket Client
 * Connects to OpenClaw Gateway and receives events
 * 
 * Features:
 * - Auto-reconnect with exponential backoff
 * - Connection state tracking
 * - Offline mode support
 */

export type OpenClawFrame = {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: unknown;
  event?: string;
  payload?: Record<string, unknown>;
  ok?: boolean;
  error?: { code: string; message: string };
};

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

// Reconnection settings
const INITIAL_RECONNECT_DELAY = 1000;  // 1 second
const MAX_RECONNECT_DELAY = 30000;     // 30 seconds max
const RECONNECT_MULTIPLIER = 1.5;

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectAttempts = 0;
  private requestId = 0;
  private pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private connectionState: ConnectionState = 'disconnected';

  private onEvent: ((event: OpenClawFrame) => void) | null = null;
  private onStateChange: ((state: ConnectionState) => void) | null = null;
  private onReconnectAttempt: ((attempt: number, delay: number) => void) | null = null;

  constructor(url: string = 'ws://127.0.0.1:18789') {
    this.url = url;
  }

  setOnEvent(callback: (event: OpenClawFrame) => void) {
    this.onEvent = callback;
  }

  setOnStateChange(callback: (state: ConnectionState) => void) {
    this.onStateChange = callback;
  }

  setOnReconnectAttempt(callback: (attempt: number, delay: number) => void) {
    this.onReconnectAttempt = callback;
  }

  private setState(state: ConnectionState) {
    if (this.connectionState !== state) {
      this.connectionState = state;
      this.onStateChange?.(state);
    }
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setState('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[OpenClaw] Connected');
        this.setState('connected');
        this.reconnectDelay = INITIAL_RECONNECT_DELAY;
        this.reconnectAttempts = 0;
        this.sendConnect();
      };

      this.ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data) as OpenClawFrame;
          this.handleFrame(frame);
        } catch (e) {
          console.error('[OpenClaw] Failed to parse message:', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[OpenClaw] Disconnected:', event.code, event.reason);
        this.ws = null;
        this.setState('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[OpenClaw] WebSocket error:', error);
        // Error will trigger onclose, which handles reconnection
      };
    } catch (e) {
      console.error('[OpenClaw] Failed to connect:', e);
      this.setState('disconnected');
      this.scheduleReconnect();
    }
  }

  private sendConnect() {
    // Send hello/connect frame
    const connectParams = {
      minProtocol: 1,
      maxProtocol: 1,
      client: {
        id: 'doraemon-desktop',
        displayName: 'Doraemon Desktop',
        version: '0.1.0',
        platform: typeof process !== 'undefined' ? process.platform : 'browser',
        mode: 'observer',
      },
      caps: ['events'],
    };

    this.send({
      type: 'req',
      id: this.nextId(),
      method: 'connect',
      params: connectParams,
    });
  }

  private handleFrame(frame: OpenClawFrame) {
    if (frame.type === 'event') {
      this.onEvent?.(frame);
    } else if (frame.type === 'res' && frame.id) {
      const pending = this.pendingRequests.get(frame.id);
      if (pending) {
        this.pendingRequests.delete(frame.id);
        if (frame.ok) {
          pending.resolve(frame.payload);
        } else {
          pending.reject(new Error(frame.error?.message || 'Unknown error'));
        }
      }
    }
  }

  private send(frame: OpenClawFrame) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private nextId(): string {
    return `doraemon-${++this.requestId}`;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    
    this.reconnectAttempts++;
    this.setState('reconnecting');
    
    // Exponential backoff with jitter
    const jitter = Math.random() * 1000;
    const delay = Math.min(this.reconnectDelay + jitter, MAX_RECONNECT_DELAY);
    
    console.log(`[OpenClaw] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
    this.onReconnectAttempt?.(this.reconnectAttempts, delay);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * RECONNECT_MULTIPLIER, MAX_RECONNECT_DELAY);
      this.connect();
    }, delay);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getState(): ConnectionState {
    return this.connectionState;
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  /**
   * Send a chat message to OpenClaw
   */
  sendChat(message: string) {
    const id = this.nextId();
    this.send({
      type: 'req',
      id,
      method: 'chat',
      params: { message },
    });
    return id;
  }
}
